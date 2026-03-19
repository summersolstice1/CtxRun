use std::{
    fs,
    path::PathBuf,
    process,
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

use ctxrun_db::init::DbState;
use ctxrun_plugin_context::{
    commands,
    scanner::{self, ScanIgnoreConfig},
};
use rusqlite::{Connection, params};

fn temp_root(prefix: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let root = std::env::temp_dir().join(format!(
        "ctxrun-workspace-tests-{prefix}-{}-{nanos}",
        process::id()
    ));
    fs::create_dir_all(&root).expect("create temp root");
    root
}

fn apply_db_migrations(conn: &Connection) {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let migrations_dir = manifest_dir
        .parent()
        .expect("workspace-tests should be inside crates/")
        .join("db")
        .join("migrations");

    let mut files = fs::read_dir(&migrations_dir)
        .expect("read migrations dir")
        .map(|e| e.expect("migration entry").path())
        .collect::<Vec<_>>();
    files.sort();

    for path in files {
        let sql = fs::read_to_string(&path)
            .unwrap_or_else(|e| panic!("failed to read migration {}: {e}", path.display()));
        conn.execute_batch(&sql)
            .unwrap_or_else(|e| panic!("failed to apply migration {}: {e}", path.display()));
    }
}

fn make_db_state() -> DbState {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_db_migrations(&conn);
    DbState {
        conn: Mutex::new(conn),
    }
}

fn state_of<'a, T: Send + Sync + 'static>(value: &'a T) -> tauri::State<'a, T> {
    // SAFETY: `tauri::State<'a, T>` is a thin wrapper around `&'a T`.
    // We only use it in tests for directly invoking command functions.
    unsafe { std::mem::transmute::<&'a T, tauri::State<'a, T>>(value) }
}

fn empty_ignore() -> ScanIgnoreConfig {
    ScanIgnoreConfig {
        dirs: vec![],
        files: vec![],
        extensions: vec![],
    }
}

fn scanner_test_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[test]
fn centralized_context_scanner_filter_ignored_file_visible_locked() {
    let _guard = scanner_test_lock().lock().expect("lock scanner tests");
    let root = temp_root("context-filter-file");
    fs::write(root.join("hidden.txt"), "secret").expect("write hidden file");
    fs::write(root.join("keep.rs"), "fn main() {}").expect("write keep file");

    let result = scanner::scan_project_tree(
        root.to_string_lossy().to_string(),
        ScanIgnoreConfig {
            dirs: vec![],
            files: vec!["hidden.txt".into()],
            extensions: vec![],
        },
        false,
        Some(12),
        Some(10_000),
    )
    .expect("scan project tree");

    let hidden = result
        .nodes
        .iter()
        .find(|n| n.name == "hidden.txt")
        .expect("hidden node should still be present");
    assert_eq!(hidden.is_locked, Some(true));
    assert_eq!(hidden.ignore_source.as_deref(), Some("filter"));
    assert!(!hidden.is_selected);

    let keep = result
        .nodes
        .iter()
        .find(|n| n.name == "keep.rs")
        .expect("keep node should be present");
    assert_eq!(keep.is_locked, None);
    assert!(keep.is_selected);

    let _ = fs::remove_dir_all(root);
}

#[test]
fn centralized_context_scanner_filter_ignored_dir_keeps_placeholder_without_children() {
    let _guard = scanner_test_lock().lock().expect("lock scanner tests");
    let root = temp_root("context-filter-dir");
    let ignored_dir = root.join("ignored");
    fs::create_dir_all(&ignored_dir).expect("create ignored dir");
    fs::write(ignored_dir.join("inner.ts"), "export const x = 1;").expect("write inner file");

    let result = scanner::scan_project_tree(
        root.to_string_lossy().to_string(),
        ScanIgnoreConfig {
            dirs: vec!["ignored".into()],
            files: vec![],
            extensions: vec![],
        },
        false,
        Some(12),
        Some(10_000),
    )
    .expect("scan project tree");

    let ignored = result
        .nodes
        .iter()
        .find(|n| n.name == "ignored" && n.kind == "dir")
        .expect("ignored dir node");
    assert_eq!(ignored.is_locked, Some(true));
    assert_eq!(ignored.ignore_source.as_deref(), Some("filter"));
    assert_eq!(
        ignored.children.as_ref().map(|c| c.len()),
        Some(0),
        "locked dirs should not recurse into children"
    );

    let _ = fs::remove_dir_all(root);
}

#[test]
fn centralized_context_scanner_git_ignore_locks_directory_and_prefers_git_source() {
    let _guard = scanner_test_lock().lock().expect("lock scanner tests");
    let root = temp_root("context-git-dir");
    fs::write(root.join(".gitignore"), "ignored/\n").expect("write gitignore");
    let ignored_dir = root.join("ignored");
    fs::create_dir_all(&ignored_dir).expect("create ignored dir");
    fs::write(ignored_dir.join("inner.ts"), "export const x = 1;").expect("write inner file");

    let result = scanner::scan_project_tree(
        root.to_string_lossy().to_string(),
        ScanIgnoreConfig {
            dirs: vec!["ignored".into()],
            files: vec![],
            extensions: vec![],
        },
        true,
        Some(12),
        Some(10_000),
    )
    .expect("scan project tree");

    let ignored = result
        .nodes
        .iter()
        .find(|n| n.name == "ignored" && n.kind == "dir")
        .expect("ignored dir node");
    assert_eq!(ignored.is_locked, Some(true));
    assert_eq!(
        ignored.ignore_source.as_deref(),
        Some("git"),
        "git should take precedence over filter source"
    );
    assert_eq!(ignored.children.as_ref().map(|c| c.len()), Some(0));

    let _ = fs::remove_dir_all(root);
}

#[test]
fn centralized_context_scanner_max_entries_sets_capped_flag() {
    let _guard = scanner_test_lock().lock().expect("lock scanner tests");
    let root = temp_root("context-cap");
    fs::write(root.join("a.rs"), "fn a() {}").expect("write a");
    fs::write(root.join("b.rs"), "fn b() {}").expect("write b");

    let result = scanner::scan_project_tree(
        root.to_string_lossy().to_string(),
        empty_ignore(),
        false,
        Some(12),
        Some(1),
    )
    .expect("scan project tree");

    assert!(result.capped, "scan should be capped when reaching max_entries");
    assert_eq!(result.scanned_entries, 1);
    assert_eq!(result.max_entries, 1);
    assert_eq!(result.nodes.len(), 1);

    let _ = fs::remove_dir_all(root);
}

#[test]
fn centralized_context_commands_has_ignore_files_and_protocol_filtering() {
    let root = temp_root("context-ignore-files");
    fs::write(root.join(".ctxrunignore"), "*.cache\n").expect("write ctxrunignore");
    fs::write(root.join(".gitignore"), "*.log\n").expect("write gitignore");
    fs::write(root.join("a.log"), "log").expect("write log");
    fs::write(root.join("b.txt"), "txt").expect("write txt");

    assert!(
        commands::has_ignore_files(root.to_string_lossy().to_string()),
        "ignore files should be detected"
    );

    let ignored = commands::get_ignored_by_protocol(
        root.to_string_lossy().to_string(),
        vec![
            root.join("a.log").to_string_lossy().to_string(),
            root.join("b.txt").to_string_lossy().to_string(),
        ],
    );
    assert_eq!(ignored.len(), 1);
    assert!(ignored[0].ends_with("a.log"));

    let _ = fs::remove_dir_all(root);
}

#[tokio::test(flavor = "multi_thread")]
#[allow(clippy::await_holding_lock)]
async fn centralized_context_commands_scan_project_tree_async_returns_locked_nodes() {
    let _guard = scanner_test_lock().lock().expect("lock scanner tests");
    let root = temp_root("context-command-scan");
    fs::write(root.join("skip.md"), "ignored").expect("write skip file");

    let result = commands::scan_project_tree(
        root.to_string_lossy().to_string(),
        ScanIgnoreConfig {
            dirs: vec![],
            files: vec!["skip.md".into()],
            extensions: vec![],
        },
        false,
        Some(12),
        Some(10_000),
    )
    .await
    .expect("scan command result");

    let node = result
        .nodes
        .iter()
        .find(|n| n.name == "skip.md")
        .expect("skip node present");
    assert_eq!(node.is_locked, Some(true));
    assert_eq!(node.ignore_source.as_deref(), Some("filter"));

    let _ = fs::remove_dir_all(root);
}

#[tokio::test(flavor = "multi_thread")]
async fn centralized_context_commands_scan_for_secrets_filters_ignored_values() {
    let db_state = make_db_state();
    let ignored_secret = "sk-A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8";
    let other_secret = "sk-Z9y8X7w6V5u4T3s2Z9y8X7w6V5u4T3s2Z9y8X7w6V5u4T3s2";

    {
        let conn = db_state.conn.lock().expect("lock db");
        conn.execute(
            "INSERT INTO ignored_secrets (id, value, rule_id, created_at) VALUES (?1, ?2, NULL, 0)",
            params!["ignored-1", ignored_secret],
        )
        .expect("insert ignored secret");
    }

    let content = format!("const a = \"{ignored_secret}\";\nconst b = \"{other_secret}\";\n");
    let matches = commands::scan_for_secrets(state_of(&db_state), content)
        .await
        .expect("scan for secrets");

    assert!(
        matches.iter().all(|m| m.value != ignored_secret),
        "ignored secret should be filtered out"
    );
    assert!(
        matches.iter().any(|m| m.value == other_secret),
        "non-ignored secret should still be reported"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn centralized_context_commands_scan_for_secrets_enriches_file_metadata() {
    let db_state = make_db_state();
    let secret = "sk-Z9y8X7w6V5u4T3s2Z9y8X7w6V5u4T3s2Z9y8X7w6V5u4T3s2";
    let content = format!(
        "<project_context>\n<source_files>\n<file path=\"src/demo.ts\">\nconst safe = 1;\nconst token = \"{secret}\";\n</file>\n</source_files>\n</project_context>\n"
    );

    let matches = commands::scan_for_secrets(state_of(&db_state), content)
        .await
        .expect("scan for secrets");

    let hit = matches
        .iter()
        .find(|m| m.value == secret)
        .expect("detected matches should include the expected secret value");

    assert_eq!(hit.file_path.as_deref(), Some("src/demo.ts"));
    assert_eq!(hit.file_name.as_deref(), Some("demo.ts"));
    assert_eq!(hit.line_number, 2);
    assert_eq!(hit.snippet_start_line, 1);
}

#[tokio::test(flavor = "multi_thread")]
async fn centralized_context_commands_calculate_stats_and_content_roundtrip() {
    let root = temp_root("context-content");
    let file = root.join("main.ts");
    fs::write(&file, "const answer = 42; // strip me\n").expect("write context file");

    let stats = commands::calculate_context_stats(vec![file.to_string_lossy().to_string()], true)
        .await
        .expect("calculate context stats");
    assert_eq!(stats.file_count, 1);
    assert!(stats.total_size > 0);
    assert!(stats.total_tokens > 0);

    let content = commands::get_context_content(
        vec![file.to_string_lossy().to_string()],
        "<project_context>".into(),
        true,
    )
    .await
    .expect("get context content");
    assert!(content.starts_with("<project_context>\n<source_files>"));
    assert!(content.contains("<file path=\""));
    assert!(content.contains("const answer = 42;"));
    assert!(!content.contains("strip me"));

    let _ = fs::remove_dir_all(root);
}

#[tokio::test(flavor = "multi_thread")]
async fn centralized_context_commands_save_context_to_file_persists_rendered_output() {
    let root = temp_root("context-save");
    let source = root.join("notes.txt");
    let output = root.join("context.xml");
    fs::write(&source, "line one\nline two\n").expect("write source file");

    commands::save_context_to_file(
        vec![source.to_string_lossy().to_string()],
        "<project_context>".into(),
        false,
        output.to_string_lossy().to_string(),
    )
    .await
    .expect("save context to file");

    let saved = fs::read_to_string(&output).expect("read saved context file");
    assert!(saved.contains("<project_context>"));
    assert!(saved.contains("line one"));
    assert!(saved.contains("</project_context>"));

    let _ = fs::remove_dir_all(root);
}
