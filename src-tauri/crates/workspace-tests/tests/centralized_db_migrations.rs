use std::{fs, path::PathBuf};

use rusqlite::{Connection, params};

fn read_db_migration(name: &str) -> String {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let crates_dir = manifest_dir
        .parent()
        .expect("workspace-tests should be inside crates/");
    let migration_path = crates_dir.join("db").join("migrations").join(name);
    fs::read_to_string(&migration_path).unwrap_or_else(|e| {
        panic!(
            "failed to read migration file {}: {}",
            migration_path.display(),
            e
        )
    })
}

fn apply_migration(conn: &Connection, name: &str) {
    let sql = read_db_migration(name);
    conn.execute_batch(&sql)
        .unwrap_or_else(|e| panic!("failed to apply {name}: {e}"));
}

#[test]
fn centralized_db_prompts_fts_triggers_sync_insert_update_delete() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    conn.execute(
        "INSERT INTO prompts (
            id, title, content, group_name, description, tags,
            is_favorite, created_at, updated_at, source, type,
            is_executable, shell_type, use_as_chat_template
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            "p1",
            "Title One",
            "Body One",
            "Default",
            "Desc One",
            "[]",
            0,
            1_i64,
            1_i64,
            "local",
            "prompt",
            0,
            Option::<String>::None,
            0
        ],
    )
    .expect("insert prompt");

    let fts_title: String = conn
        .query_row(
            "SELECT title FROM prompts_fts WHERE id = ?1",
            params!["p1"],
            |row| row.get(0),
        )
        .expect("prompt should be indexed in prompts_fts");
    assert_eq!(fts_title, "Title One");

    conn.execute(
        "UPDATE prompts SET title = ?1, content = ?2 WHERE id = ?3",
        params!["Title Two", "Body Two", "p1"],
    )
    .expect("update prompt");

    let fts_title_after: String = conn
        .query_row(
            "SELECT title FROM prompts_fts WHERE id = ?1",
            params!["p1"],
            |row| row.get(0),
        )
        .expect("updated prompt should be re-indexed in prompts_fts");
    assert_eq!(fts_title_after, "Title Two");

    conn.execute("DELETE FROM prompts WHERE id = ?1", params!["p1"])
        .expect("delete prompt");
    let fts_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM prompts_fts WHERE id = ?1",
            params!["p1"],
            |row| row.get(0),
        )
        .expect("count deleted prompt in fts");
    assert_eq!(fts_count, 0, "deleted prompts should be removed from prompts_fts");
}

#[test]
fn centralized_db_url_history_fts_triggers_sync_insert_update_delete() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    conn.execute(
        "INSERT INTO url_history (url, title, visit_count, last_visit) VALUES (?1, ?2, ?3, ?4)",
        params!["https://example.com", "Example", 1_i64, 1_i64],
    )
    .expect("insert url history");

    let fts_title: String = conn
        .query_row(
            "SELECT title FROM url_history_fts WHERE url = ?1",
            params!["https://example.com"],
            |row| row.get(0),
        )
        .expect("url should be indexed in url_history_fts");
    assert_eq!(fts_title, "Example");

    conn.execute(
        "UPDATE url_history SET title = ?1 WHERE url = ?2",
        params!["Example Updated", "https://example.com"],
    )
    .expect("update url history");

    let fts_title_after: String = conn
        .query_row(
            "SELECT title FROM url_history_fts WHERE url = ?1",
            params!["https://example.com"],
            |row| row.get(0),
        )
        .expect("updated url should be re-indexed in url_history_fts");
    assert_eq!(fts_title_after, "Example Updated");

    conn.execute(
        "DELETE FROM url_history WHERE url = ?1",
        params!["https://example.com"],
    )
    .expect("delete url history");

    let fts_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM url_history_fts WHERE url = ?1",
            params!["https://example.com"],
            |row| row.get(0),
        )
        .expect("count deleted url in fts");
    assert_eq!(fts_count, 0, "deleted url should be removed from url_history_fts");
}

#[test]
fn centralized_db_shell_history_enforces_unique_command() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V2__shell_history.sql");

    conn.execute(
        "INSERT INTO shell_history (command, timestamp, execution_count) VALUES (?1, ?2, ?3)",
        params!["npm test", 1_i64, 1_i64],
    )
    .expect("insert first shell command");

    let duplicate = conn.execute(
        "INSERT INTO shell_history (command, timestamp, execution_count) VALUES (?1, ?2, ?3)",
        params!["npm test", 2_i64, 1_i64],
    );
    assert!(
        duplicate.is_err(),
        "shell_history should reject duplicate command due to UNIQUE(command)"
    );
}

#[test]
fn centralized_db_refinery_v4_hash_index_non_unique_and_fts_text_only() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V3__create_refinery_table.sql");
    apply_migration(&conn, "V4__refinery_notes.sql");

    // V4 should downgrade hash index to non-unique.
    let mut stmt = conn
        .prepare("PRAGMA index_list('refinery_history')")
        .expect("prepare pragma index_list");
    let mut idx_rows = stmt.query([]).expect("query index list");
    let mut hash_unique_flag = None;
    while let Some(row) = idx_rows.next().expect("iterate index rows") {
        let name: String = row.get(1).expect("index name");
        if name == "idx_refinery_hash" {
            let unique: i64 = row.get(2).expect("unique flag");
            hash_unique_flag = Some(unique);
            break;
        }
    }
    assert_eq!(
        hash_unique_flag,
        Some(0),
        "V4 should make idx_refinery_hash non-unique"
    );

    conn.execute(
        "INSERT INTO refinery_history (
            id, kind, content, content_hash, preview, source_app, url, size_info,
            metadata, created_at, updated_at, title, tags, is_manual, is_edited
        ) VALUES (?1, 'text', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, 0)",
        params![
            "text-1",
            "hello text",
            "same-hash",
            "preview-1",
            "Editor",
            Option::<String>::None,
            "10 chars",
            "{}",
            1_i64,
            1_i64,
            "Title One",
            "[]"
        ],
    )
    .expect("insert first text row");

    conn.execute(
        "INSERT INTO refinery_history (
            id, kind, content, content_hash, preview, source_app, url, size_info,
            metadata, created_at, updated_at, title, tags, is_manual, is_edited
        ) VALUES (?1, 'text', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, 0)",
        params![
            "text-2",
            "hello text 2",
            "same-hash",
            "preview-2",
            "Editor",
            Option::<String>::None,
            "11 chars",
            "{}",
            2_i64,
            2_i64,
            "Title Two",
            "[]"
        ],
    )
    .expect("insert second text row with same hash");

    let same_hash_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM refinery_history WHERE content_hash = ?1",
            params!["same-hash"],
            |row| row.get(0),
        )
        .expect("count same-hash rows");
    assert_eq!(
        same_hash_count, 2,
        "non-unique hash index should allow duplicate hashes after V4"
    );

    // FTS trigger should index only text rows, not image rows.
    conn.execute(
        "INSERT INTO refinery_history (
            id, kind, content, content_hash, preview, source_app, url, size_info,
            metadata, created_at, updated_at, title, tags, is_manual, is_edited
        ) VALUES (?1, 'image', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, 0)",
        params![
            "img-1",
            "/tmp/a.png",
            "image-hash",
            "preview-img",
            "Editor",
            Option::<String>::None,
            "1920x1080",
            "{}",
            3_i64,
            3_i64,
            "Image",
            "[]"
        ],
    )
    .expect("insert image row");

    let fts_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM refinery_fts", [], |row| row.get(0))
        .expect("count refinery_fts rows");
    assert_eq!(fts_count, 2, "only text rows should be indexed in refinery_fts");

    // Update trigger should refresh indexed title for text row.
    conn.execute(
        "UPDATE refinery_history SET title = ?1 WHERE id = ?2",
        params!["Title One Updated", "text-1"],
    )
    .expect("update text row title");
    let rowid_text_1: i64 = conn
        .query_row(
            "SELECT rowid FROM refinery_history WHERE id = ?1",
            params!["text-1"],
            |row| row.get(0),
        )
        .expect("get rowid for text-1");
    let indexed_title: String = conn
        .query_row(
            "SELECT title FROM refinery_fts WHERE rowid = ?1",
            params![rowid_text_1],
            |row| row.get(0),
        )
        .expect("read updated fts title");
    assert_eq!(indexed_title, "Title One Updated");

    // Delete trigger should remove row from FTS.
    conn.execute(
        "DELETE FROM refinery_history WHERE id = ?1",
        params!["text-1"],
    )
    .expect("delete text row");
    let fts_after_delete: i64 = conn
        .query_row("SELECT COUNT(*) FROM refinery_fts", [], |row| row.get(0))
        .expect("count fts rows after delete");
    assert_eq!(fts_after_delete, 1);
}
