use std::{
    fs,
    path::PathBuf,
    process,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use chrono::Utc;
use ctxrun_db::init::DbState;
use ctxrun_plugin_refinery::commands;
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
    unsafe { std::mem::transmute::<&'a T, tauri::State<'a, T>>(value) }
}

#[allow(clippy::too_many_arguments)]
fn insert_refinery_item(
    conn: &Connection,
    id: &str,
    kind: &str,
    content: Option<&str>,
    preview: Option<&str>,
    source_app: Option<&str>,
    url: Option<&str>,
    size_info: Option<&str>,
    is_pinned: bool,
    metadata: &str,
    created_at: i64,
    updated_at: i64,
    title: Option<&str>,
    tags_json: &str,
    is_manual: bool,
    is_edited: bool,
) {
    conn.execute(
        "INSERT INTO refinery_history (
            id, kind, content, content_hash, preview, source_app, url, size_info,
            is_pinned, metadata, created_at, updated_at, title, tags, is_manual, is_edited
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            id,
            kind,
            content,
            format!("hash-{id}"),
            preview,
            source_app,
            url,
            size_info,
            is_pinned,
            metadata,
            created_at,
            updated_at,
            title,
            tags_json,
            is_manual,
            is_edited
        ],
    )
    .expect("insert refinery item");
}

#[test]
fn centralized_refinery_history_commands_cover_filters_details_stats_and_pin_toggle() {
    let db_state = make_db_state();
    let now = Utc::now().timestamp_millis();
    {
        let conn = db_state.conn.lock().expect("lock db");
        insert_refinery_item(
            &conn,
            "text-1",
            "text",
            Some("alpha beta body"),
            Some("alpha beta preview"),
            Some("Editor"),
            None,
            Some("15 chars"),
            false,
            r#"{"tokens": 12}"#,
            now - 10 * 24 * 60 * 60 * 1000,
            now - 3_000,
            Some("Alpha"),
            r#"["tag-a"]"#,
            false,
            false,
        );
        insert_refinery_item(
            &conn,
            "image-1",
            "image",
            Some("/tmp/image.png"),
            Some("preview"),
            Some("Browser"),
            Some("https://example.com"),
            Some("1 KB"),
            true,
            "{}",
            now - 2 * 24 * 60 * 60 * 1000,
            now - 2_000,
            Some("Image"),
            r#"["image"]"#,
            false,
            false,
        );
        insert_refinery_item(
            &conn,
            "note-1",
            "text",
            Some("manual note"),
            Some("manual note"),
            Some("CtxRun"),
            None,
            Some("11 chars"),
            false,
            "{}",
            now - 24 * 60 * 60 * 1000,
            now - 1_000,
            Some("Note"),
            r#"["note"]"#,
            true,
            true,
        );
    }

    let all = commands::get_refinery_history(
        state_of(&db_state),
        1,
        20,
        None,
        None,
        false,
        false,
        None,
        None,
    )
    .expect("get all refinery history");
    assert_eq!(
        all.iter().map(|item| item.id.as_str()).collect::<Vec<_>>(),
        vec!["note-1", "image-1", "text-1"]
    );
    assert_eq!(all[1].content.as_deref(), Some("/tmp/image.png"));
    assert_eq!(all[2].content, None, "history list should not expose text bodies");
    assert_eq!(all[2].tags.as_ref().map(|tags| tags[0].as_str()), Some("tag-a"));

    let search = commands::get_refinery_history(
        state_of(&db_state),
        1,
        20,
        Some("alpha beta".into()),
        None,
        false,
        false,
        None,
        None,
    )
    .expect("search refinery history");
    assert_eq!(search.len(), 1);
    assert_eq!(search[0].id, "text-1");

    let pinned_images = commands::get_refinery_history(
        state_of(&db_state),
        1,
        20,
        None,
        Some("image".into()),
        true,
        false,
        None,
        None,
    )
    .expect("get pinned images");
    assert_eq!(pinned_images.len(), 1);
    assert_eq!(pinned_images[0].id, "image-1");

    let manual_notes = commands::get_refinery_history(
        state_of(&db_state),
        1,
        20,
        None,
        None,
        false,
        true,
        None,
        None,
    )
    .expect("get manual history");
    assert_eq!(manual_notes.len(), 1);
    assert_eq!(manual_notes[0].id, "note-1");

    let ranged = commands::get_refinery_history(
        state_of(&db_state),
        1,
        20,
        None,
        None,
        false,
        false,
        Some(now - 3 * 24 * 60 * 60 * 1000),
        Some(now),
    )
    .expect("get ranged history");
    assert_eq!(ranged.len(), 2);
    assert!(ranged.iter().any(|item| item.id == "image-1"));
    assert!(ranged.iter().any(|item| item.id == "note-1"));

    let detail = commands::get_refinery_item_detail(state_of(&db_state), "image-1".into())
        .expect("get detail")
        .expect("image item should exist");
    assert_eq!(detail.content.as_deref(), Some("/tmp/image.png"));
    assert!(
        commands::get_refinery_item_detail(state_of(&db_state), "missing".into())
            .expect("missing detail should succeed")
            .is_none()
    );

    let stats = commands::get_refinery_statistics(state_of(&db_state)).expect("get stats");
    assert_eq!(stats.total_entries, 3);
    assert_eq!(stats.favorites, 1);
    assert_eq!(stats.this_week, 2);

    commands::toggle_refinery_pin(state_of(&db_state), "text-1".into()).expect("toggle pin");
    let toggled = commands::get_refinery_item_detail(state_of(&db_state), "text-1".into())
        .expect("read toggled item")
        .expect("text item should still exist");
    assert!(toggled.is_pinned);
}

#[test]
fn centralized_refinery_delete_and_clear_history_remove_rows_and_image_files() {
    let db_state = make_db_state();
    let now = Utc::now().timestamp_millis();
    let root = temp_root("refinery-delete");
    let image_path = root.join("clipboard.png");
    fs::write(&image_path, b"image-bytes").expect("write image file");

    {
        let conn = db_state.conn.lock().expect("lock db");
        insert_refinery_item(
            &conn,
            "image-old",
            "image",
            Some(&image_path.to_string_lossy()),
            Some("preview"),
            Some("Browser"),
            Some("https://example.com"),
            Some("1 KB"),
            false,
            "{}",
            now - 5 * 24 * 60 * 60 * 1000,
            now - 5 * 24 * 60 * 60 * 1000,
            Some("Old Image"),
            r#"["image"]"#,
            false,
            false,
        );
        insert_refinery_item(
            &conn,
            "text-pinned",
            "text",
            Some("keep me"),
            Some("keep me"),
            Some("Editor"),
            None,
            Some("7 chars"),
            true,
            "{}",
            now - 5 * 24 * 60 * 60 * 1000,
            now - 4 * 24 * 60 * 60 * 1000,
            Some("Pinned"),
            r#"["pinned"]"#,
            false,
            false,
        );
        insert_refinery_item(
            &conn,
            "note-fresh",
            "text",
            Some("fresh"),
            Some("fresh"),
            Some("CtxRun"),
            None,
            Some("5 chars"),
            false,
            "{}",
            now,
            now,
            Some("Fresh"),
            r#"["fresh"]"#,
            true,
            false,
        );
    }

    assert_eq!(
        commands::delete_refinery_items(state_of(&db_state), Vec::new()).expect("delete empty ids"),
        0
    );

    let deleted_old = commands::delete_refinery_items(
        state_of(&db_state),
        vec!["image-old".into()],
    )
    .expect("delete direct image row");
    assert_eq!(deleted_old, 1);
    assert!(!image_path.exists(), "image-backed entries should remove their cached file");

    let deleted_pinned = commands::clear_refinery_history(
        state_of(&db_state),
        Some(now - 24 * 60 * 60 * 1000),
        true,
    )
    .expect("clear old pinned history");
    assert_eq!(deleted_pinned, 1);

    let no_match = commands::clear_refinery_history(
        state_of(&db_state),
        Some(now - 24 * 60 * 60 * 1000),
        false,
    )
    .expect("clear history with no remaining matches");
    assert_eq!(no_match, 0);

    let remaining = commands::get_refinery_history(
        state_of(&db_state),
        1,
        20,
        None,
        None,
        false,
        false,
        None,
        None,
    )
    .expect("get remaining history");
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].id, "note-fresh");

    let _ = fs::remove_dir_all(root);
}

#[tokio::test(flavor = "multi_thread")]
async fn centralized_refinery_copy_image_rejects_missing_path() {
    let missing_path = temp_root("refinery-missing-image").join("missing.png");
    let error = commands::copy_refinery_image(missing_path.to_string_lossy().to_string())
        .await
        .expect_err("missing image should error before touching the clipboard");
    assert!(error.to_string().contains("Image file not found"));
}
