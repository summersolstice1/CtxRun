use refinery::embed_migrations;
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use super::error::DbError;

embed_migrations!("migrations");

pub struct DbState {
    pub conn: Mutex<Connection>,
}
fn column_exists(conn: &Connection, table: &str, column: &str) -> bool {
    let query = format!("PRAGMA table_info({})", table);
    let mut stmt = match conn.prepare(&query) {
        Ok(s) => s,
        Err(_) => return false,
    };

    stmt.query_map([], |row| {
        let name: String = row.get(1)?;
        Ok(name)
    })
    .map(|iter| iter.flatten().any(|name| name == column))
    .unwrap_or(false)
}

fn migrate_legacy_columns(conn: &Connection) -> crate::error::Result<()> {
    let has_prompts = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='prompts'",
            [],
            |r| r.get::<_, i32>(0),
        )
        .unwrap_or(0)
        > 0;

    let has_refinery = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='refinery_schema_history'",
        [],
        |r| r.get::<_, i32>(0)
    ).unwrap_or(0) > 0;

    if !has_prompts || has_refinery {
        return Ok(());
    }
    if !column_exists(conn, "prompts", "is_executable") {
        conn.execute(
            "ALTER TABLE prompts ADD COLUMN is_executable INTEGER DEFAULT 0",
            [],
        )?;
    }
    if !column_exists(conn, "prompts", "shell_type") {
        conn.execute("ALTER TABLE prompts ADD COLUMN shell_type TEXT", [])?;
    }
    if !column_exists(conn, "prompts", "use_as_chat_template") {
        conn.execute(
            "ALTER TABLE prompts ADD COLUMN use_as_chat_template INTEGER DEFAULT 0",
            [],
        )?;
    }

    Ok(())
}

pub fn init_db(app_handle: &AppHandle) -> crate::error::Result<Connection> {
    let app_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| DbError::Message(e.to_string()))?;
    if !app_dir.exists() {
        std::fs::create_dir_all(&app_dir)?;
    }
    let db_path = app_dir.join("prompts.db");

    let mut conn = Connection::open(db_path)?;
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
    ",
    )?;

    if let Err(e) = migrate_legacy_columns(&conn) {
        eprintln!("[Database] Failed to migrate legacy columns: {}", e);
    }

    let report = migrations::runner()
        .run(&mut conn)
        .map_err(|e| DbError::Migration(e.to_string()))?;

    let applied = report.applied_migrations();
    if !applied.is_empty() {
        println!("[Database] Applied {} migrations.", applied.len());
        for m in applied {
            println!("[Database] - {}", m.name());
        }
    }

    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn legacy_prompts_schema(conn: &Connection) {
        conn.execute_batch(
            "
            CREATE TABLE prompts (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                group_name TEXT NOT NULL,
                description TEXT,
                tags TEXT,
                is_favorite INTEGER DEFAULT 0,
                created_at INTEGER,
                updated_at INTEGER,
                source TEXT DEFAULT 'local',
                pack_id TEXT,
                original_id TEXT,
                type TEXT
            );
            ",
        )
        .expect("create legacy prompts table");
    }

    fn column_names(conn: &Connection, table: &str) -> Vec<String> {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .expect("prepare table_info");
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .expect("query table_info");
        rows.collect::<Result<Vec<_>, _>>().expect("collect columns")
    }

    #[test]
    fn column_exists_detects_known_and_missing_columns() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        legacy_prompts_schema(&conn);

        assert!(column_exists(&conn, "prompts", "title"));
        assert!(!column_exists(&conn, "prompts", "is_executable"));
        assert!(!column_exists(&conn, "missing_table", "title"));
    }

    #[test]
    fn migrate_legacy_columns_adds_missing_prompt_fields_once() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        legacy_prompts_schema(&conn);

        migrate_legacy_columns(&conn).expect("migrate legacy columns");
        let columns = column_names(&conn, "prompts");
        assert!(columns.contains(&"is_executable".to_string()));
        assert!(columns.contains(&"shell_type".to_string()));
        assert!(columns.contains(&"use_as_chat_template".to_string()));

        migrate_legacy_columns(&conn).expect("repeat migration should stay idempotent");
        let columns_after_repeat = column_names(&conn, "prompts");
        assert_eq!(columns_after_repeat, columns);
    }

    #[test]
    fn migrate_legacy_columns_skips_when_schema_history_exists_or_prompts_missing() {
        let conn_without_prompts = Connection::open_in_memory().expect("open in-memory db");
        migrate_legacy_columns(&conn_without_prompts)
            .expect("migration without prompts table should no-op");

        let conn_with_history = Connection::open_in_memory().expect("open in-memory db");
        legacy_prompts_schema(&conn_with_history);
        conn_with_history
            .execute(
                "CREATE TABLE refinery_schema_history (version TEXT PRIMARY KEY, name TEXT NOT NULL, applied_on TEXT NOT NULL, checksum TEXT NOT NULL)",
                [],
            )
            .expect("create schema history");

        migrate_legacy_columns(&conn_with_history)
            .expect("migration with schema history should no-op");
        let columns = column_names(&conn_with_history, "prompts");
        assert!(!columns.contains(&"is_executable".to_string()));
        assert!(!columns.contains(&"shell_type".to_string()));
        assert!(!columns.contains(&"use_as_chat_template".to_string()));
    }
}
