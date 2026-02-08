use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

// 引入 Refinery 迁移宏
use refinery::embed_migrations;

// 编译时嵌入 migrations 文件夹中的 SQL 文件
embed_migrations!("./migrations");

pub struct DbState {
    pub conn: Mutex<Connection>,
}

// 检查列是否存在（用于遗留数据库升级）
fn column_exists(conn: &Connection, table: &str, column: &str) -> bool {
    let query = format!("PRAGMA table_info({})", table);
    let mut stmt = match conn.prepare(&query) {
        Ok(s) => s,
        Err(_) => return false,
    };

    let exists = stmt.query_map([], |row| {
        let name: String = row.get(1)?;
        Ok(name)
    }).map(|iter| {
        iter.flatten().any(|name| name == column)
    }).unwrap_or(false);

    exists
}

// 处理遗留数据库：为老用户的 prompts 表添加缺失的列
// 注意：表结构创建完全由 refinery 迁移管理，此处仅处理列升级
fn migrate_legacy_columns(conn: &Connection) -> rusqlite::Result<()> {
    // 检查是否是老用户：有 prompts 表，但没有 refinery 历史记录
    let has_prompts = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='prompts'",
        [],
        |r| r.get::<_, i32>(0)
    ).unwrap_or(0) > 0;

    let has_refinery = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='refinery_schema_history'",
        [],
        |r| r.get::<_, i32>(0)
    ).unwrap_or(0) > 0;

    // 新用户或已迁移用户：跳过
    if !has_prompts || has_refinery {
        return Ok(());
    }

    println!("[Database] Legacy prompts table detected. Adding new columns...");

    // 添加新列（如果不存在）
    if !column_exists(conn, "prompts", "is_executable") {
        conn.execute("ALTER TABLE prompts ADD COLUMN is_executable INTEGER DEFAULT 0", [])?;
    }
    if !column_exists(conn, "prompts", "shell_type") {
        conn.execute("ALTER TABLE prompts ADD COLUMN shell_type TEXT", [])?;
    }
    if !column_exists(conn, "prompts", "use_as_chat_template") {
        conn.execute("ALTER TABLE prompts ADD COLUMN use_as_chat_template INTEGER DEFAULT 0", [])?;
    }

    println!("[Database] Legacy columns added successfully.");
    Ok(())
}

pub fn init_db(app_handle: &AppHandle) -> Result<Connection, Box<dyn std::error::Error>> {
    let app_dir = app_handle.path().app_local_data_dir().unwrap();
    if !app_dir.exists() {
        std::fs::create_dir_all(&app_dir).unwrap();
    }
    let db_path = app_dir.join("prompts.db");

    let mut conn = Connection::open(db_path)?;

    // 基础优化
    conn.execute_batch("
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
    ")?;

    // 处理遗留数据库的列升级（表结构由 refinery 迁移管理）
    if let Err(e) = migrate_legacy_columns(&conn) {
        eprintln!("[Database] Failed to migrate legacy columns: {}", e);
    }

    // 运行 refinery 迁移
    match migrations::runner().run(&mut conn) {
        Ok(report) => {
            let applied = report.applied_migrations();
            if !applied.is_empty() {
                println!("[Database] Applied {} migrations.", applied.len());
                for m in applied {
                    println!("[Database] - {}", m.name());
                }
            }
        },
        Err(e) => return Err(Box::new(e)),
    }

    Ok(conn)
}
