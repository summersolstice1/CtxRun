# CodeForgeAI / CtxRun — Code Quality Cleanup Tasks

> This file is a handoff document for AI-assisted code cleanup.
> Each section describes a specific issue with exact file paths, line numbers, and recommended fixes.

---

## 1. Error Serialize Impl — 8 files with identical code

Every plugin crate manually writes the same `Serialize` impl for its error type:

```rust
impl Serialize for XxxError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where S: serde::ser::Serializer {
        serializer.serialize_str(&self.to_string())
    }
}
```

**Files:**

| # | File | Lines |
|---|------|-------|
| 1 | `src-tauri/crates/automator/src/error.rs` | 32-39 |
| 2 | `src-tauri/crates/context/src/error.rs` | 38-45 |
| 3 | `src-tauri/crates/db/src/error.rs` | 49-56 |
| 4 | `src-tauri/crates/git/src/error.rs` | 34-45 |
| 5 | `src-tauri/crates/miner/src/error.rs` | 26-33 |
| 6 | `src-tauri/crates/ocr/src/error.rs` | 81-88 |
| 7 | `src-tauri/crates/refinery/src/error.rs` | 60-67 |
| 8 | `src-tauri/crates/transfer/src/error.rs` | 60-67 |

**Fix:** Create a macro in a shared location (e.g. `src-tauri/crates/runtime-utils/src/macros.rs`):

```rust
#[macro_export]
macro_rules! impl_tauri_error_serialize {
    ($error_type:ty) => {
        impl serde::Serialize for $error_type {
            fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
            where
                S: serde::ser::Serializer,
            {
                serializer.serialize_str(&self.to_string())
            }
        }
    };
}
```

Then replace each manual impl with `impl_tauri_error_serialize!(XxxError);`.

---

## 2. `From<String>` + `From<&str>` for Error — 5 files with identical code

Repeated pattern mapping string-like values to a generic message variant:

```rust
impl From<String> for XxxError {
    fn from(value: String) -> Self { Self::Message(value) }
}
impl From<&str> for XxxError {
    fn from(value: &str) -> Self { Self::Message(value.to_string()) }
}
```

**Files:**

| # | File | Lines | Variant name |
|---|------|-------|-------------|
| 1 | `src-tauri/crates/db/src/error.rs` | 31-41 | `Message` |
| 2 | `src-tauri/crates/context/src/error.rs` | 26-36 | `DbError` |
| 3 | `src-tauri/crates/refinery/src/error.rs` | 36-46 | `String` |
| 4 | `src-tauri/crates/transfer/src/error.rs` | 42-52 | `Message` |
| 5 | `src-tauri/crates/browser-utils/src/error.rs` | 12-22 | `Message` |

Also `src-tauri/crates/ocr/src/error.rs` (lines 63-79) has the same plus an extra `From<PathBuf>`.

**Fix:** Include in the same macro from Task 1, or create a second macro:

```rust
#[macro_export]
macro_rules! impl_string_conversions {
    ($error_type:ty, $variant:ident) => {
        impl From<String> for $error_type {
            fn from(value: String) -> Self { Self::$variant(value) }
        }
        impl From<&str> for $error_type {
            fn from(value: &str) -> Self { Self::$variant(value.to_string()) }
        }
    };
}
```

---

## 3. `type Result<T>` alias — 9 files

Every `error.rs` ends with:

```rust
pub type Result<T> = std::result::Result<T, XxxError>;
```

**Files:** All 9 `error.rs` files listed in Tasks 1 and 2.

**Fix:** This is idiomatic Rust and each crate needs its own alias. **No action needed.**

---

## 4. Polling Wait Loops — 4 identical patterns in browser.rs

All four functions follow the exact same `deadline + loop + check + sleep` pattern:

```rust
let deadline = tokio::time::Instant::now() + timeout;
loop {
    let result = /* check condition */;
    if result { return Ok(...); }
    if tokio::time::Instant::now() >= deadline {
        return Err(AutomatorError::BrowserError("Timeout..."));
    }
    tokio::time::sleep(INTERVAL).await;
}
```

**Files (all in `src-tauri/crates/automator/src/browser.rs`):**

| # | Lines | Function |
|---|-------|----------|
| 1 | 448-470 | `wait_for_selector_state` |
| 2 | 482-498 | `wait_for_url_match` |
| 3 | 591-640 | `wait_for_navigation_ready` |
| 4 | 1051-1068 | `wait_for_element` |

**Fix:** Use `ctxrun_runtime_utils::poll_until` (already exists in `src-tauri/crates/runtime-utils/src/wait.rs`). Note that `wait_for_navigation_ready` (item 3) has more complex state tracking (stable rounds counter) and may need a custom wrapper around `poll_until`.

---

## 5. Retry Loops — 3 identical patterns in browser.rs

All three functions use `for attempt in 0..MAX_RETRIES { match ... { Ok => return, Err => sleep } }`:

```rust
for attempt in 0..MAX_RETRIES {
    match operation().await {
        Ok(result) => return Ok(result),
        Err(err) => {
            if attempt + 1 < MAX_RETRIES {
                tokio::time::sleep(RETRY_DELAY).await;
            }
        }
    }
}
Err(Error("failed after retries"))
```

**Files (all in `src-tauri/crates/automator/src/browser.rs`):**

| # | Lines | Function |
|---|-------|----------|
| 1 | 1071-1097 | `fetch_page_targets_with_retry` |
| 2 | 1389-1408 | `get_page_with_retry` |
| 3 | 1410-1445 | `focus_target_with_retry` |

**Fix:** Add a generic `retry` function to `ctxrun-runtime-utils`:

```rust
pub async fn retry<F, Fut, T, E>(
    max_attempts: usize,
    delay: Duration,
    operation: F,
) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: Clone,
{
    let mut last_err = None;
    for attempt in 0..max_attempts {
        match operation().await {
            Ok(value) => return Ok(value),
            Err(err) => {
                last_err = Some(err);
                if attempt + 1 < max_attempts {
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }
    Err(last_err.unwrap())
}
```

---

## 6. App Directory Resolution — 5 files with similar code

Pattern: resolve Tauri's `app_local_data_dir`, optionally create if missing, then join subpaths.

```rust
let app_dir = app.path().app_local_data_dir().map_err(|e| ...)?;
if !app_dir.exists() { std::fs::create_dir_all(&app_dir)?; }
let target = app_dir.join("something");
```

**Files:**

| # | File | Lines |
|---|------|-------|
| 1 | `src-tauri/crates/db/src/init.rs` | 66-73 |
| 2 | `src-tauri/crates/db/src/url_history.rs` | 68-70 |
| 3 | `src-tauri/crates/automator/src/lib.rs` | 134-135 |
| 4 | `src-tauri/crates/refinery/src/storage.rs` | 28-33 |
| 5 | `src-tauri/crates/ocr/src/paths.rs` | 43-48 |

**Fix:** Add a shared utility to `ctxrun-runtime-utils`:

```rust
pub fn ensure_app_local_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    let dir = app.path().app_local_data_dir()
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}
```

Note: This requires adding `tauri` as a dependency of `runtime-utils`, which may not be desirable. Alternative: put it in a new `ctxrun-tauri-utils` crate, or keep it in each crate but as a private helper duplicated only once per crate instead of multiple times.

---

## 7. `lock_recover` Function — 2 files

Identical function for recovering from poisoned Mutex:

```rust
fn lock_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}
```

**Files:**

| # | File | Lines |
|---|------|-------|
| 1 | `src-tauri/crates/runtime-utils/src/idle.rs` | 118-122 |
| 2 | `src-tauri/crates/ocr/src/service.rs` | 234-238 |

**Fix:** Export `lock_recover` as `pub` from `ctxrun-runtime-utils`, then have `ocr/service.rs` import it instead of defining its own copy.

---

## 8. Dead Code — Rust

### 8a. `runtime-utils/time.rs` — Entire module unused

**File:** `src-tauri/crates/runtime-utils/src/time.rs`

All 6 functions (`duration_from_millis`, `duration_from_secs`, `clamp_millis`, `clamp_duration`, `deadline_after`, `saturating_remaining`) are never called outside the module's own tests.

**Action:** Delete `time.rs`, remove its module declaration and re-exports from `src-tauri/crates/runtime-utils/src/lib.rs`.

### 8b. `runtime-utils` — Several exports only used in tests

The following are exported but never used in production code (only in tests within the same crate):

- `spawn_delayed` (from `tasks.rs`)
- `poll_until`, `PollError`, `PollOptions` (from `wait.rs`)
- `IdleLease`, `IdleSnapshot` (from `idle.rs`)

**Action:** Either remove the unused exports or keep them if there are plans to use them soon. `poll_until` is planned for Task 4, so keep it.

### 8c. `browser-utils` — 5 unused public functions

**File:** `src-tauri/crates/browser-utils/src/lib.rs`

Only `locate_browser()` and `launch_debug_browser()` are used by the automator crate. The following are never called externally:

- `locate_all_browsers()`
- `app_chrome_data_dir()`
- `is_debug_port_available()`
- `is_browser_running()`
- `kill_browser_processes()`

**Action:** Mark as `pub(crate)` or remove if not planned for future use.

### 8d. `process-utils` — 1 unused public function

**File:** `src-tauri/crates/process-utils/src/lib.rs`

`new_tokio_detached_command()` is never called externally.

**Action:** Mark as `pub(crate)` or remove.

---

## 9. Dead Code — Frontend

### 9a. `Toast.tsx` — Entire component unused

**File:** `src/components/ui/Toast.tsx`

The `Toast` component and `ToastType` are never imported anywhere.

**Action:** Delete the file.

### 9b. Unused icon imports

**Files:**
- `src/components/features/prompts/PromptCard.tsx` — imports `BadgeCheck`, `Zap` from lucide-react (verify usage)
- `src/components/features/prompts/PromptView.tsx` — imports `Sparkles` from lucide-react (verify usage)

**Action:** Remove unused imports.

---

## 10. Frontend Duplicate Patterns

### 10a. `appWindow.hide() + setQuery('')` — 4 times in one file

**File:** `src/windows/spotlight/SpotlightWindowApp.tsx`

Lines: 162-163, 176-177, 190-191, 222-223

```typescript
await appWindow.hide();
setQuery('');
```

**Fix:** Extract a helper:

```typescript
const dismiss = async () => {
  await appWindow.hide();
  setQuery('');
};
```

### 10b. Copy Feedback State — 3 files

```typescript
const [copiedId, setCopiedId] = useState<string | null>(null);
// on copy:
setCopiedId(id);
setTimeout(() => setCopiedId(null), 2000);
```

**Files:**

| # | File | Line |
|---|------|------|
| 1 | `src/windows/spotlight/SpotlightWindowApp.tsx` | 65 |
| 2 | `src/components/settings/IgnoredSecretsManager.tsx` | 22 |
| 3 | `src/components/ui/ClockPopover.tsx` | 29 |

**Fix:** Extract a `useCopyFeedback` hook:

```typescript
function useCopyFeedback(timeout = 2000) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const markCopied = useCallback((id: string) => {
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), timeout);
  }, [timeout]);
  return { copiedId, markCopied };
}
```

### 10c. `record_url_visit` invoke — 2 identical calls

**File:** `src/windows/spotlight/SpotlightWindowApp.tsx` lines 173, 187

```typescript
void invoke('record_url_visit', { url: item.url }).catch((err) => {
  console.error('Failed to ...', err);
});
```

**Fix:** Extract a helper function in the same file.

---

## 11. OCR Plugin — Incomplete Feature

### 11a. `download.rs` is a stub

**File:** `src-tauri/crates/ocr/src/download.rs`

The `ensure_models_downloaded` function always returns an error:

```rust
pub fn ensure_models_downloaded<R: Runtime>(...) -> Result<()> {
    Err(OcrServiceError::ModelDownloadNotImplemented(...))
}
```

When model files are missing, OCR is completely non-functional. Users must manually place 4 model files in the correct directory.

**Required model files** (defined in `src-tauri/crates/ocr/src/paths.rs`):
- `PP-OCRv5_mobile_det.mnn`
- `PP-OCRv5_mobile_rec.mnn`
- `ppocr_keys_v5.txt`
- `PP-LCNet_x1_0_doc_ori.mnn`

**Target directory:** `{app_local_data_dir}/models/ocr/ppocrv5_mobile/`

**Action:** Either implement the download logic, or document the manual setup requirement and return a clear user-facing error.

### 11b. Capabilities already added

The OCR permissions have been added to `src-tauri/capabilities/migrated.json`:
- `ctxrun-plugin-ocr:allow-ocr-get-status`
- `ctxrun-plugin-ocr:allow-ocr-prepare`
- `ctxrun-plugin-ocr:allow-ocr-recognize-file`
- `ctxrun-plugin-ocr:allow-ocr-recognize-bytes`
- `ctxrun-plugin-ocr:allow-ocr-release`

No action needed here.

---

## Priority Summary

| Priority | Task | Impact |
|----------|------|--------|
| **P0** | 8a. Delete `time.rs` dead code | Remove unused module |
| **P0** | 9a. Delete `Toast.tsx` dead component | Remove unused component |
| **P1** | 1+2. Error Serialize + From macro | Eliminate 13 duplicate blocks across 8 files |
| **P1** | 4. Replace polling loops with `poll_until` | Eliminate 4 duplicate loops |
| **P1** | 5. Add generic `retry` utility | Eliminate 3 duplicate loops |
| **P2** | 10a. Extract `dismiss` helper | Eliminate 4 duplicates in SpotlightWindowApp |
| **P2** | 10b. Extract `useCopyFeedback` hook | Eliminate 3 duplicates across files |
| **P2** | 7. Consolidate `lock_recover` | Eliminate 2 duplicates |
| **P2** | 6. Consolidate app dir resolution | Eliminate 5 duplicates |
| **P3** | 8b-8d. Mark unused Rust exports as `pub(crate)` | Reduce API surface |
| **P3** | 9b. Remove unused icon imports | Clean imports |
| **P3** | 10c. Extract `record_url_visit` helper | Minor dedup |
| **Backlog** | 11a. Implement OCR model download | Feature completion |

---

# Phase 2: Full Project Audit

> Comprehensive audit covering security, architecture, CI, performance, frontend quality, and concurrency.
> Generated: 2026-04-09

---

## 12. Security Issues

### 12a. Command Injection — CRITICAL

User-controlled paths passed directly to shell commands without sanitization.

**`src-tauri/src/fs_commands.rs`** — Lines 21, 27, 39, 44, 64:
```rust
.arg(format!("/select,{}", path))  // No sanitization
.arg(&path)  // Direct use with explorer/open/xdg-open
```

**`src-tauri/src/apps.rs`** — Lines 126, 134, 142:
```rust
.args(["/C", "start", "", &path])  // cmd.exe with user path
.arg(&path)  // Direct use with browser/path
```

**`src-tauri/crates/env-probe/src/env_probe/network.rs`** — Lines 547, 555, 562:
```rust
command_process.args(["-n", &PING_ATTEMPTS.to_string(), "-w", "1000", target]);
command.args(["-c", &PING_ATTEMPTS.to_string(), "-W", "1", target]);
```

**Fix:** Validate and sanitize all inputs before passing to shell commands. Use proper argument arrays (not format strings). Reject paths containing shell metacharacters. For ping targets, validate as valid IP/hostname.

### 12b. Path Traversal — HIGH

**`src-tauri/crates/exec-runtime/src/safety.rs`** — Lines 180-195:

Uses `std::fs::canonicalize` for workspace path validation, which may not catch all traversal patterns on Windows (e.g. `\\?\` prefix paths).

**Fix:** Add explicit checks for `..` components and normalize paths before comparison.

### 12c. Unsafe Code — HIGH (Accepted Risk)

Extensive `unsafe` blocks for Windows API usage in:
- `src-tauri/src/guard.rs` — Lines 341, 377-634 (keyboard/mouse hooks)
- `src-tauri/crates/hyperview/src/peek.rs` — Lines 164-506 (keyboard hook, COM)
- `src-tauri/crates/automator/src/inspector.rs` — Lines 42, 206 (UI automation)
- `src-tauri/crates/env-probe/src/commands/monitoring.rs` — Lines 649-776 (network structures)

**Fix:** These are necessary for Windows hooks and COM interop. Add safety documentation comments explaining invariants.

### 12d. SQL Dynamic Construction — MEDIUM

**`src-tauri/crates/db/src/prompts.rs`** — Lines 102-145:

Complex dynamic SQL string construction with multiple `format!` calls. Currently uses parameterized queries correctly, but the complexity increases risk of future mistakes.

**Fix:** Consider using a query builder or simplifying the SQL construction logic.

### 12e. Pagination Without Bounds — MEDIUM

**`src-tauri/crates/db/src/prompts.rs`** — Lines 13-79:

`page` and `page_size` parameters are not validated for reasonable ranges (e.g., page_size = 999999).

**Fix:** Add bounds: `page_size = page_size.clamp(1, 200)`.

---

## 13. Error Handling Issues

### 13a. Unwrap in Production Code — MEDIUM

| File | Line | Code |
|------|------|------|
| `src-tauri/src/apps.rs` | 173, 211, 249 | `path.file_stem().unwrap().to_string_lossy().to_string()` |
| `src-tauri/src/shortcuts.rs` | 55 | `self.registered.lock().unwrap()` |
| `src-tauri/crates/git/src/commands.rs` | 141 | `new_file.path().or(old_file.path()).unwrap()` |

**Fix:** Use `.unwrap_or_default()`, `?`, or proper error variants.

### 13b. Swallowed Errors — LOW (mostly intentional)

`let _ =` patterns throughout:
- `src-tauri/src/apps.rs:147` — `let _ = ctxrun_db::apps::record_app_usage(state, path);`
- `src-tauri/src/guard.rs` — Multiple `let _ = window.hide()`, `let _ = apply_keep_awake(...)`
- `src-tauri/src/main.rs` — Multiple `let _ = window.show()`, `let _ = window.set_focus()`

Most are fire-and-forget UI operations where failure is acceptable. The `record_app_usage` one should probably log on error.

---

## 14. Architecture & Dependencies

### 14a. Unused Workspace Dependency — `serde_rusqlite`

**File:** `src-tauri/Cargo.toml:64`

`serde_rusqlite` is declared in workspace dependencies but never imported anywhere in the codebase.

**Action:** Remove from workspace dependencies.

### 14b. `db` Crate Depends on `reqwest` — Architectural Concern

**File:** `src-tauri/crates/db/Cargo.toml:16`

The database crate imports `reqwest` (HTTP client) to fetch URL titles in `url_history.rs`. A database crate should not be making HTTP requests.

**Action:** Move URL fetching logic to a separate service or make it optional behind a feature flag.

### 14c. Inconsistent Dependency Versions

| Dependency | Location A | Location B |
|------------|-----------|-----------|
| `walkdir` | Root: `"2"` | workspace-tests: `"2.5"`, tool-runtime: `"2"` |
| `reqwest` | Root: features `["json", "rustls-tls", "blocking"]` | db: features `["json", "rustls-tls"]` (missing `blocking`) |
| `image` | Root: explicit decl | refinery: duplicate identical decl (should use workspace) |

**Action:** Standardize all versions through workspace dependencies with `{ workspace = true }`.

### 14d. `git2` Vendored Features — Build Time Impact

**File:** `src-tauri/Cargo.toml:70`

```toml
git2 = { version = "0.19", features = ["vendored-libgit2", "vendored-openssl"] }
```

These features add ~5-10 minutes to build time and increase binary size. Only needed if deployment targets lack system libgit2/openssl.

**Action:** Test if CI runners have system libraries available. If yes, make vendored features optional or remove.

---

## 15. CI Coverage Gaps

### 15a. Missing Crates in CI Checks

**File:** `.github/workflows/ci.yml:72`

`cargo check` and `cargo test` only cover 5 crates. Missing:
- `ctxrun-plugin-ocr`
- `ctxrun-plugin-exec-runtime`
- `ctxrun-plugin-transfer`

**Current:**
```yaml
run: cargo check -p ctxrun-plugin-automator -p ctxrun-plugin-context -p ctxrun-plugin-git -p ctxrun-plugin-miner -p ctxrun-plugin-refinery
```

**Fix:** Add all plugin crates to the check command.

### 15b. Missing CI Steps

| Step | Status |
|------|--------|
| `cargo fmt --check` | Missing — no formatting enforcement |
| `cargo audit` | Missing — no vulnerability scanning |
| `cargo tree -d` | Missing — no duplicate dependency detection |
| Cargo build cache | Missing in release.yml — no caching, slow builds |

**Action:** Add these steps to CI.

---

## 16. Performance Issues

### 16a. Blocking I/O in Async Context — MEDIUM

**`src-tauri/src/apps.rs:115`** — `std::sync::Mutex` locked in async function for DB access.

**`src-tauri/src/monitor.rs:13`** — `std::sync::Mutex<System>` in Tauri command, could block.

**Fix:** Wrap blocking DB/system operations in `spawn_blocking` if they hold locks for extended periods.

### 16a. Excessive String Allocation — LOW

**`src-tauri/src/apps.rs:170, 173, 180, 211, 220, 249, 252`** — Multiple `to_string_lossy().to_string()` and `to_lowercase()` calls in the app scanning loop, creating temporary String allocations for every scanned file.

**Fix:** Use `Cow<str>` or case-insensitive comparison to avoid allocations where possible.

### 16b. Spawn Without Join — MEDIUM

JoinHandles dropped without awaiting, silently losing errors:

| File | Line | Context |
|------|------|---------|
| `src-tauri/src/main.rs` | 108-118, 125-130 | `tauri::async_runtime::spawn` for delayed init tasks |
| `src-tauri/src/guard.rs` | 126-131 | `refresh_guard_service` spawns and forgets |

**Fix:** Either `.await` the handles, or add `.unwrap_or_else(|e| log::error!(...))` error logging.

---

## 17. Concurrency Issues

### 17a. HWND Stored as AtomicI64 — Type Safety

**`src-tauri/src/guard.rs:196`**

```rust
guard_hwnd: AtomicI64,  // Stores HWND (raw pointer) cast to i64
```

**Fix:** This works on 64-bit Windows but is technically type-unsafe. Consider a dedicated wrapper type.

### 17b. Mutex Poisoning via `unwrap()`

**`src-tauri/src/shortcuts.rs:55`**

```rust
let mut registered = self.registered.lock().unwrap();
```

If the mutex is poisoned, this panics. The rest of the codebase uses `lock_recover` or `if let Ok(...)` patterns.

**Fix:** Use `lock_recover` pattern consistent with OCR and idle tracker.

---

## 18. Frontend Quality Issues

### 18a. No React Error Boundaries — HIGH

**Zero error boundaries** exist in the entire frontend codebase. Any unhandled error in any component will crash the entire UI tree.

**Fix:** Add error boundaries at minimum around:
- Each major view (Automator, Context, Patch, Monitor)
- The Spotlight window
- The Peek window

### 18b. Race Conditions — HIGH

**`src/components/features/spotlight/hooks/useSpotlightChat.ts:409-483`** — Async `runDefaultAgentTurn` can complete after component unmounts, calling `setMessages` on unmounted component.

**`src/components/features/patch/PatchView.tsx:133-180`** — `setTimeout` with async operation inside; if component unmounts during delay, state updates will occur on dead component.

**Fix:** Use AbortController or a ref-based cancellation flag. Check mount status before state updates.

### 18c. Extensive `any` Type Usage — HIGH

**60+ instances** of `any` type, concentrated in:
- `src/types/automator.ts:146-147` — `flowNodes?: any[]`, `flowEdges?: any[]`
- `src/components/features/automator/AutomatorView.tsx:197,208,263,269,275,281,358` — Multiple `payload: any`
- `src/components/ui/MarkdownContent.tsx:68,77,104,143,159` — All MDX props typed as `any`
- `src/lib/monaco.ts:52` — `monaco: any`

**Fix:** Define proper interfaces for automator node/edge data. Use typed MDX component props.

### 18d. Large Component Files — MEDIUM

| File | Lines |
|------|-------|
| `src/components/features/monitor/tabs/MonitorDashboard.tsx` | ~968 |
| `src/components/features/monitor/tabs/NetworkDoctor.tsx` | ~925 |
| `src/components/features/context/ContextView.tsx` | ~773 |
| `src/components/features/automator/nodes/ActionNode.tsx` | ~768 |
| `src/components/features/spotlight/core/SearchBar.tsx` | ~666 |
| `src/components/layout/ViewSwitcher.tsx` | ~572 |

**Fix:** Split into smaller, focused sub-components. E.g., MonitorDashboard could extract MetricCard, BatteryOverview, NetworkInterfacesPanel.

### 18e. Magic Numbers — MEDIUM

**50+ hardcoded numeric values** for timeouts, sizes, and thresholds:
- `3000` ms timeout in ActionNode.tsx:286, ConditionNode.tsx:35
- `1000`, `5000`, `10000` in ActionPalette.tsx:74,109,115,127
- `1000` ms (1 second) — 20+ occurrences
- `2000` ms (2 seconds) — 15+ occurrences

**Fix:** Extract to named constants in a shared file, e.g., `src/lib/constants.ts`.

---

## Updated Priority Summary

| Priority | Task | Impact |
|----------|------|--------|
| **P0** | 12a. Fix command injection vulnerabilities | Security — Critical |
| **P0** | 15a. Add missing crates to CI | Build integrity |
| **P0** | 8a. Delete `time.rs` dead code | Remove unused module |
| **P0** | 9a. Delete `Toast.tsx` dead component | Remove unused component |
| **P1** | 12e. Add pagination bounds | Security — DoS prevention |
| **P1** | 18a. Add React error boundaries | Crash resilience |
| **P1** | 18b. Fix race conditions in Spotlight/Patch | Memory leaks, crashes |
| **P1** | 1+2. Error Serialize + From macro | Eliminate 13 duplicate blocks |
| **P1** | 4. Replace polling loops with `poll_until` | Eliminate 4 duplicate loops |
| **P1** | 5. Add generic `retry` utility | Eliminate 3 duplicate loops |
| **P1** | 15b. Add CI steps (fmt, audit, cache) | Code quality, build speed |
| **P2** | 13a. Replace unwrap() in production | Crash prevention |
| **P2** | 14a. Remove `serde_rusqlite` | Reduce build time |
| **P2** | 14c. Standardize dependency versions | Consistency |
| **P2** | 16b. Handle spawned task errors | Error visibility |
| **P2** | 18c. Reduce `any` type usage | Type safety |
| **P2** | 18e. Extract magic number constants | Maintainability |
| **P2** | 10a. Extract `dismiss` helper | Frontend dedup |
| **P2** | 10b. Extract `useCopyFeedback` hook | Frontend dedup |
| **P3** | 12c. Document unsafe invariants | Code clarity |
| **P3** | 14b. Move HTTP out of db crate | Architecture |
| **P3** | 14d. Evaluate git2 vendored features | Build time |
| **P3** | 7. Consolidate `lock_recover` | Minor dedup |
| **P3** | 8b-8d. Mark unused exports `pub(crate)` | Reduce API surface |
| **P3** | 17b. Fix mutex poisoning in shortcuts.rs | Consistency |
| **P3** | 18d. Split large components | Maintainability |
| **Backlog** | 11a. Implement OCR model download | Feature completion |
| **Backlog** | 16a. Wrap blocking I/O in spawn_blocking | Performance |
