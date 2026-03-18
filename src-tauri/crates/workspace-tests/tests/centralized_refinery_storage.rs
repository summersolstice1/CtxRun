use std::{thread, time::Duration};

use ctxrun_plugin_refinery::{
    models::{ClipboardCapture, RefineryKind, RefineryMetadata},
    storage::{capture_clipboard_item, create_manual_note_db, hash_content, update_note_db},
};
use rusqlite::{Connection, params};

fn setup_refinery_schema(conn: &Connection) {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS refinery_history (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            content TEXT,
            content_hash TEXT NOT NULL,
            preview TEXT,
            source_app TEXT,
            url TEXT,
            size_info TEXT,
            is_pinned INTEGER DEFAULT 0,
            metadata TEXT DEFAULT '{}',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            title TEXT,
            tags TEXT,
            is_manual INTEGER DEFAULT 0,
            is_edited INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_refinery_hash ON refinery_history(content_hash);
        "#,
    )
    .expect("create refinery schema");
}

fn default_metadata() -> RefineryMetadata {
    RefineryMetadata {
        width: None,
        height: None,
        format: None,
        tokens: None,
        image_path: None,
    }
}

#[test]
fn centralized_refinery_hash_content_is_stable() {
    let v1 = hash_content(b"same-content");
    let v2 = hash_content(b"same-content");
    let v3 = hash_content(b"other-content");

    assert_eq!(v1, v2);
    assert_ne!(v1, v3);
    assert_eq!(v1.len(), 16, "xxh3 hex hash should be 16 chars");
}

#[test]
fn centralized_refinery_capture_clipboard_deduplicates_by_hash() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    setup_refinery_schema(&conn);

    let hash = hash_content(b"clipboard-value");
    let (created1, id1) = capture_clipboard_item(
        &conn,
        ClipboardCapture {
            kind: RefineryKind::Text,
            content: Some("clipboard-value".to_string()),
            hash: hash.clone(),
            preview: Some("clipboard-value".to_string()),
            source_app: Some("Editor".to_string()),
            url: None,
            size_info: Some("15 chars".to_string()),
            metadata: default_metadata(),
        },
    )
    .expect("first capture should succeed");
    assert!(created1);

    // Ensure updated_at can change on fast machines.
    thread::sleep(Duration::from_millis(2));

    let (created2, id2) = capture_clipboard_item(
        &conn,
        ClipboardCapture {
            kind: RefineryKind::Text,
            content: Some("clipboard-value".to_string()),
            hash,
            preview: Some("clipboard-value".to_string()),
            source_app: Some("Browser".to_string()),
            url: Some("https://example.com".to_string()),
            size_info: Some("15 chars".to_string()),
            metadata: default_metadata(),
        },
    )
    .expect("duplicate capture should succeed");

    assert!(!created2);
    assert_eq!(id1, id2);

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM refinery_history", [], |row| row.get(0))
        .expect("count rows");
    assert_eq!(count, 1, "duplicate hash should not insert a new row");

    let (source_app, url): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT source_app, url FROM refinery_history WHERE id = ?1",
            params![id1],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("read updated row");
    assert_eq!(source_app.as_deref(), Some("Browser"));
    assert_eq!(url.as_deref(), Some("https://example.com"));
}

#[test]
fn centralized_refinery_manual_note_create_and_update_flow() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    setup_refinery_schema(&conn);

    let initial_content = "a".repeat(320);
    let note_id = create_manual_note_db(
        &conn,
        initial_content.clone(),
        Some("Initial Title".to_string()),
    )
    .expect("create manual note");

    let (is_manual, is_edited, title, preview_len): (i64, i64, Option<String>, i64) = conn
        .query_row(
            "SELECT is_manual, is_edited, title, LENGTH(preview) FROM refinery_history WHERE id = ?1",
            params![note_id.clone()],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .expect("read created note");
    assert_eq!(is_manual, 1);
    assert_eq!(is_edited, 0);
    assert_eq!(title.as_deref(), Some("Initial Title"));
    assert_eq!(preview_len, 300, "create_manual_note_db preview should cap at 300 chars");

    let updated_content = "b".repeat(180);
    update_note_db(
        &conn,
        &note_id,
        Some(updated_content.clone()),
        Some("Updated Title".to_string()),
    )
    .expect("update note content and title");

    let (content, is_edited_after, title_after, preview_len_after): (String, i64, Option<String>, i64) = conn
        .query_row(
            "SELECT content, is_edited, title, LENGTH(preview) FROM refinery_history WHERE id = ?1",
            params![note_id.clone()],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .expect("read updated note");
    assert_eq!(content, updated_content);
    assert_eq!(is_edited_after, 1);
    assert_eq!(title_after.as_deref(), Some("Updated Title"));
    assert_eq!(preview_len_after, 150, "update_note_db preview should cap at 150 chars");

    update_note_db(&conn, &note_id, None, Some("Retitled".to_string()))
        .expect("update title only");
    let title_only: Option<String> = conn
        .query_row(
            "SELECT title FROM refinery_history WHERE id = ?1",
            params![note_id],
            |row| row.get(0),
        )
        .expect("read title after title-only update");
    assert_eq!(title_only.as_deref(), Some("Retitled"));
}
