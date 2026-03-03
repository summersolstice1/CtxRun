//! Browser automation layer built on chromiumoxide.
//!
//! Provides a high-level async API for interacting with an externally-launched
//! Chrome/Edge browser via CDP.

use std::time::Duration;

use chromiumoxide::{
    Browser, Element, Page,
    cdp::browser_protocol::{
        input::{DispatchKeyEventParams, DispatchKeyEventType},
        target::{TargetId, TargetInfo},
    },
    keys::{self, KeyDefinition},
};
use ctxrun_browser_utils::{
    BrowserType as UtilsBrowserType, app_chrome_data_dir, is_browser_running,
    is_debug_port_available, kill_browser_processes, locate_browser,
};
use futures::StreamExt;
use tauri::async_runtime::JoinHandle;
use tokio::sync::oneshot;

use crate::error::{AutomatorError, Result};

const DEFAULT_DEBUG_PORT: u16 = 9222;
const ELEMENT_WAIT_TIMEOUT: Duration = Duration::from_secs(5);
// Poll cadence for selector wait. Keep short enough for responsiveness without busy polling.
const ELEMENT_WAIT_POLL_INTERVAL: Duration = Duration::from_millis(120);
// Allow a short settle window after initial connect before fetching targets.
const TARGET_SYNC_WAIT: Duration = Duration::from_millis(250);
// Retry target/page acquisition to tolerate startup races in remote-debug sessions.
const TARGET_FETCH_RETRIES: usize = 8;
const TARGET_FETCH_RETRY_DELAY: Duration = Duration::from_millis(200);
const PAGE_FETCH_RETRIES: usize = 12;
const PAGE_FETCH_RETRY_DELAY: Duration = Duration::from_millis(120);
// Interactive picker waits up to 60s for a human click.
const PICKER_POLL_INTERVAL: Duration = Duration::from_millis(100);
const PICKER_MAX_POLLS: usize = 600;

// ---------------------------------------------------------------------------
// TabSession — operations on a single tab
// ---------------------------------------------------------------------------

/// High-level wrapper around a single browser tab for automation actions.
pub struct TabSession {
    page: Page,
    _browser: Browser, // Keep browser alive to maintain CDP connection
    handler_task: Option<JoinHandle<()>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

impl Drop for TabSession {
    fn drop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(task) = self.handler_task.take() {
            task.abort();
        }
    }
}

impl TabSession {
    /// Connect to the debug port and find a tab matching the optional filter.
    pub async fn connect_and_find(url_filter: Option<&str>) -> Result<Self> {
        let debug_url = format!("http://127.0.0.1:{DEFAULT_DEBUG_PORT}");
        let (mut browser, mut handler) = Browser::connect(debug_url)
            .await
            .map_err(|e| {
                AutomatorError::BrowserError(format!(
                    "Failed to connect to debug port: {}. Make sure Chrome is running with --remote-debugging-port={}",
                    e, DEFAULT_DEBUG_PORT
                ))
            })?;

        let (shutdown_tx, mut shutdown_rx) = oneshot::channel();
        let mut shutdown_tx = Some(shutdown_tx);
        let mut handler_task = Some(tauri::async_runtime::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => {
                        break;
                    }
                    event = handler.next() => {
                        match event {
                            Some(Ok(_)) => {}
                            Some(Err(err)) => {
                                eprintln!("[Automator] Browser handler stopped: {}", err);
                                break;
                            }
                            None => break,
                        }
                    }
                }
            }
        }));

        tokio::time::sleep(TARGET_SYNC_WAIT).await;

        let target = match find_target_with_retry(&mut browser, url_filter).await {
            Ok(target) => target,
            Err(err) => {
                cleanup_handler_task(&mut shutdown_tx, &mut handler_task);
                return Err(err);
            }
        };
        let page = match get_page_with_retry(&browser, target.target_id).await {
            Ok(page) => page,
            Err(err) => {
                cleanup_handler_task(&mut shutdown_tx, &mut handler_task);
                return Err(err);
            }
        };
        let _ = page.bring_to_front().await;

        Ok(Self {
            page,
            _browser: browser,
            handler_task,
            shutdown_tx,
        })
    }

    // -- Element interaction ------------------------------------------------

    /// Wait for an element matching `selector` to appear, then return its
    /// viewport center coordinates (x, y).
    pub async fn get_element_center(&self, selector: &str) -> Result<(i32, i32)> {
        let element = wait_for_element(&self.page, selector, ELEMENT_WAIT_TIMEOUT).await?;

        element
            .scroll_into_view()
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Scroll failed: {}", e)))?;

        tokio::time::sleep(Duration::from_millis(80)).await;

        let point = element
            .clickable_point()
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Midpoint failed: {}", e)))?;

        Ok((point.x.round() as i32, point.y.round() as i32))
    }

    /// Click an element by CSS selector using CDP mouse events.
    pub async fn click_element(&self, selector: &str) -> Result<()> {
        let element = wait_for_element(&self.page, selector, ELEMENT_WAIT_TIMEOUT).await?;

        element
            .click()
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Click failed: {}", e)))?;

        Ok(())
    }

    /// Type text into an element by CSS selector.
    pub async fn type_into_element(&self, selector: &str, text: &str) -> Result<()> {
        let element = wait_for_element(&self.page, selector, ELEMENT_WAIT_TIMEOUT).await?;

        element
            .click()
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Focus click failed: {}", e)))?;

        element
            .type_str(text)
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Type failed: {}", e)))?;

        Ok(())
    }

    /// Simulate a key press (e.g. "Enter", "Tab", "Escape").
    pub async fn press_key(&self, key: &str) -> Result<()> {
        let normalized = normalize_key_name(key);
        let key_def = resolve_key_definition(&normalized).ok_or_else(|| {
            AutomatorError::BrowserError(format!("Unsupported key '{}'", key))
        })?;
        let key_down = build_key_event(key_def, 0, true)
            .map_err(|e| AutomatorError::BrowserError(format!("Key press build failed: {}", e)))?;
        let key_up = build_key_event(key_def, 0, false)
            .map_err(|e| AutomatorError::BrowserError(format!("Key press build failed: {}", e)))?;

        self.page
            .execute(key_down)
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Key press '{}' failed: {}", key, e)))?;
        self.page
            .execute(key_up)
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Key press '{}' failed: {}", key, e)))?;

        Ok(())
    }

    /// Simulate a key combination like "Ctrl+A", "Ctrl+C".
    pub async fn press_key_combo(&self, combo: &str) -> Result<()> {
        let mut modifiers = 0i64;
        let mut main_key = None;

        for part in combo.split('+').map(str::trim).filter(|s| !s.is_empty()) {
            if let Some(bit) = modifier_to_bit(part) {
                modifiers |= bit;
            } else {
                main_key = Some(normalize_key_name(part));
            }
        }

        let key = main_key.ok_or_else(|| {
            AutomatorError::BrowserError(format!("Key combo '{}' has no main key", combo))
        })?;

        let key_def = resolve_key_definition(&key).ok_or_else(|| {
            AutomatorError::BrowserError(format!("Unsupported key in combo '{}': {}", combo, key))
        })?;

        let key_down = build_key_event(key_def, modifiers, true)
            .map_err(|e| AutomatorError::BrowserError(format!("Key combo build failed: {}", e)))?;
        let key_up = build_key_event(key_def, modifiers, false)
            .map_err(|e| AutomatorError::BrowserError(format!("Key combo build failed: {}", e)))?;

        self.page
            .execute(key_down)
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Key combo failed: {}", e)))?;
        self.page
            .execute(key_up)
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Key combo failed: {}", e)))?;

        Ok(())
    }

    /// Evaluate a JavaScript expression and return the result as a string.
    pub async fn evaluate_js(&self, expression: &str) -> Result<String> {
        let result = self
            .page
            .evaluate(expression)
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("JS eval failed: {}", e)))?;

        match result.value() {
            Some(val) => Ok(val.to_string()),
            None => Ok(String::new()),
        }
    }

    /// Interactive element picker: injects a visual overlay into the page,
    /// lets the user click an element, and returns its CSS selector.
    pub async fn pick_element(&self) -> Result<String> {
        let picker_js = r#"
            (function() {
                window.__ctxrun_picked_result = '';
                const styleId = '__ctxrun_picker_style';
                if (document.getElementById(styleId)) return;

                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = '.__ctxrun_hover { outline: 2px solid red !important; outline-offset: -2px; }';
                document.head.appendChild(style);

                function buildSelector(el) {
                    if (el.id) return '#' + CSS.escape(el.id);
                    let path = [];
                    let cur = el;
                    while (cur && cur !== document.body && cur !== document.documentElement) {
                        let seg = cur.tagName.toLowerCase();
                        if (cur.className && typeof cur.className === 'string') {
                            const cls = cur.className.trim().split(/\s+/)
                                .filter(c => !c.startsWith('__ctxrun')).slice(0, 2)
                                .map(c => '.' + CSS.escape(c)).join('');
                            if (cls) seg += cls;
                        }
                        if (!cur.id && cur.parentElement) {
                            const sibs = Array.from(cur.parentElement.children).filter(c => c.tagName === cur.tagName);
                            if (sibs.length > 1) seg += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
                        }
                        path.unshift(seg);
                        cur = cur.parentElement;
                    }
                    return path.join(' > ');
                }

                let lastEl = null;
                function onMove(e) {
                    if (lastEl) lastEl.classList.remove('__ctxrun_hover');
                    e.target.classList.add('__ctxrun_hover');
                    lastEl = e.target;
                    e.stopPropagation(); e.preventDefault();
                }
                function onClick(e) {
                    e.stopPropagation(); e.preventDefault();
                    if (lastEl) lastEl.classList.remove('__ctxrun_hover');
                    window.__ctxrun_picked_result = buildSelector(e.target);
                    document.removeEventListener('mousemove', onMove, true);
                    document.removeEventListener('mousedown', onClick, true);
                    const s = document.getElementById(styleId);
                    if (s) s.remove();
                }
                document.addEventListener('mousemove', onMove, true);
                document.addEventListener('mousedown', onClick, true);
            })()
        "#;

        self.page
            .evaluate(picker_js)
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Picker injection failed: {}", e)))?;

        // Poll for result (user clicks an element in the browser)
        for _ in 0..PICKER_MAX_POLLS {
            tokio::time::sleep(PICKER_POLL_INTERVAL).await;

            let result = self
                .page
                .evaluate("window.__ctxrun_picked_result || ''")
                .await
                .map_err(|e| AutomatorError::BrowserError(format!("Poll failed: {}", e)))?;

            let picked = result.into_value::<String>().unwrap_or_default();
            if !picked.is_empty() {
                let _ = self
                    .page
                    .evaluate("delete window.__ctxrun_picked_result;")
                    .await;
                return Ok(picked);
            }
        }

        Err(AutomatorError::BrowserError("Picker timeout (60s)".into()))
    }
}

fn modifier_to_bit(value: &str) -> Option<i64> {
    match value.to_ascii_lowercase().as_str() {
        "alt" => Some(1),
        "ctrl" | "control" => Some(2),
        "meta" | "cmd" | "command" => Some(4),
        "shift" => Some(8),
        _ => None,
    }
}

fn normalize_key_name(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "return" => "Enter".to_string(),
        "space" => " ".to_string(),
        "esc" => "Escape".to_string(),
        "del" => "Delete".to_string(),
        "page up" => "PageUp".to_string(),
        "page down" => "PageDown".to_string(),
        "arrow up" | "up" => "ArrowUp".to_string(),
        "arrow down" | "down" => "ArrowDown".to_string(),
        "arrow left" | "left" => "ArrowLeft".to_string(),
        "arrow right" | "right" => "ArrowRight".to_string(),
        "cmd" | "command" => "Meta".to_string(),
        "ctrl" => "Control".to_string(),
        _ => raw.trim().to_string(),
    }
}

fn resolve_key_definition(name: &str) -> Option<&'static KeyDefinition> {
    let normalized = normalize_key_name(name);
    keys::get_key_definition(&normalized).or_else(|| {
        if normalized.len() == 1 {
            keys::get_key_definition(normalized.to_ascii_lowercase())
                .or_else(|| keys::get_key_definition(normalized.to_ascii_uppercase()))
        } else {
            None
        }
    })
}

fn build_key_event(
    key_def: &'static KeyDefinition,
    modifiers: i64,
    is_key_down: bool,
) -> std::result::Result<DispatchKeyEventParams, String> {
    let mut builder = DispatchKeyEventParams::builder()
        .modifiers(modifiers)
        .key(key_def.key)
        .code(key_def.code)
        .windows_virtual_key_code(key_def.key_code)
        .native_virtual_key_code(key_def.key_code)
        .location(key_location(key_def.code));

    let event_type = if is_key_down {
        if let Some(text) = key_def.text {
            builder = builder.text(text);
            DispatchKeyEventType::KeyDown
        } else if key_def.key.len() == 1 {
            builder = builder.text(key_def.key);
            DispatchKeyEventType::KeyDown
        } else {
            DispatchKeyEventType::RawKeyDown
        }
    } else {
        DispatchKeyEventType::KeyUp
    };

    builder
        .r#type(event_type)
        .build()
        .map_err(|e| e.to_string())
}

fn key_location(code: &str) -> i64 {
    if code.ends_with("Left") {
        1
    } else if code.ends_with("Right") {
        2
    } else {
        0
    }
}

fn cleanup_handler_task(
    shutdown_tx: &mut Option<oneshot::Sender<()>>,
    handler_task: &mut Option<JoinHandle<()>>,
) {
    if let Some(tx) = shutdown_tx.take() {
        let _ = tx.send(());
    }
    if let Some(task) = handler_task.take() {
        task.abort();
    }
}

async fn wait_for_element(page: &Page, selector: &str, timeout: Duration) -> Result<Element> {
    let deadline = tokio::time::Instant::now() + timeout;

    loop {
        match page.find_element(selector).await {
            Ok(element) => return Ok(element),
            Err(err) => {
                if tokio::time::Instant::now() >= deadline {
                    return Err(AutomatorError::BrowserError(format!(
                        "Element not found '{}': {}",
                        selector, err
                    )));
                }

                tokio::time::sleep(ELEMENT_WAIT_POLL_INTERVAL).await;
            }
        }
    }
}

async fn find_target_with_retry(
    browser: &mut Browser,
    url_filter: Option<&str>,
) -> Result<TargetInfo> {
    for attempt in 0..TARGET_FETCH_RETRIES {
        let targets = browser.fetch_targets().await.map_err(|e| {
            AutomatorError::BrowserError(format!("Failed to fetch browser targets: {}", e))
        })?;

        if let Some(target) = targets.into_iter().find(|t| matches_target(t, url_filter)) {
            return Ok(target);
        }

        if attempt + 1 < TARGET_FETCH_RETRIES {
            tokio::time::sleep(TARGET_FETCH_RETRY_DELAY).await;
        }
    }

    Err(AutomatorError::BrowserError(
        "No matching page tab found. Please open a web page in the browser.".into(),
    ))
}

fn matches_target(target: &TargetInfo, url_filter: Option<&str>) -> bool {
    if target.r#type != "page" {
        return false;
    }

    if target.url.starts_with("devtools://") {
        return false;
    }

    match url_filter {
        Some(filter) => target.url.contains(filter) || target.title.contains(filter),
        None => true,
    }
}

async fn get_page_with_retry(browser: &Browser, target_id: TargetId) -> Result<Page> {
    let mut last_error = None;

    for attempt in 0..PAGE_FETCH_RETRIES {
        match browser.get_page(target_id.clone()).await {
            Ok(page) => return Ok(page),
            Err(err) => {
                last_error = Some(err.to_string());
                if attempt + 1 < PAGE_FETCH_RETRIES {
                    tokio::time::sleep(PAGE_FETCH_RETRY_DELAY).await;
                }
            }
        }
    }

    Err(AutomatorError::BrowserError(format!(
        "Failed to attach to selected page: {}",
        last_error.unwrap_or_else(|| "unknown error".into())
    )))
}

// ---------------------------------------------------------------------------
// Browser launcher — start a new browser with debugging enabled
// ---------------------------------------------------------------------------

/// Launch a browser with `--remote-debugging-port` for automation.
pub fn launch_debug_browser(
    is_edge: bool,
    url: Option<String>,
    use_temp_profile: bool,
) -> std::result::Result<(), String> {
    use std::process::Command;

    if is_debug_port_available(DEFAULT_DEBUG_PORT) {
        return Ok(());
    }

    let target = if is_edge {
        UtilsBrowserType::Edge
    } else {
        UtilsBrowserType::Chrome
    };
    let exe_path =
        locate_browser(target).ok_or_else(|| format!("Browser {:?} not found", target))?;

    if is_browser_running(target) {
        kill_browser_processes(target)?;
    }

    let mut cmd = Command::new(exe_path);
    cmd.arg(format!("--remote-debugging-port={}", DEFAULT_DEBUG_PORT));
    cmd.arg("--no-first-run");
    cmd.arg("--no-default-browser-check");

    let base_dir = app_chrome_data_dir();
    if use_temp_profile {
        cmd.arg(format!(
            "--user-data-dir={}",
            base_dir.join("temp").to_string_lossy()
        ));
    } else {
        cmd.arg(format!(
            "--user-data-dir={}",
            base_dir.join("persistent").to_string_lossy()
        ));
    }

    cmd.arg(url.unwrap_or_else(|| "about:blank".into()));

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x00000008;
        cmd.creation_flags(DETACHED_PROCESS);
    }

    cmd.spawn()
        .map_err(|e| format!("Failed to launch browser: {}", e))?;

    for i in 0..10 {
        std::thread::sleep(Duration::from_millis(500));
        if is_debug_port_available(DEFAULT_DEBUG_PORT) {
            return Ok(());
        }
        if i == 9 {
            return Err(
                "Browser started but debug port is not available after 5 seconds. This may be a Chrome profile lock issue.".into(),
            );
        }
    }

    Ok(())
}
