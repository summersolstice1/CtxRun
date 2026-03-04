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

    let exists = stmt
        .query_map([], |row| {
            let name: String = row.get(1)?;
            Ok(name)
        })
        .map(|iter| iter.flatten().any(|name| name == column))
        .unwrap_or(false);

    exists
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
