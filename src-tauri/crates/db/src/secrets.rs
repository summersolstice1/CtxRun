use rusqlite::{Connection, params};
use tauri::State;
use uuid::Uuid;

use super::init::DbState;
use super::models::IgnoredSecret;

// ============================================================================
// Ignored Secrets Commands
// ============================================================================

#[tauri::command]
pub fn add_ignored_secrets(
    state: State<DbState>,
    secrets: Vec<IgnoredSecret>,
) -> crate::error::Result<usize> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut count = 0;

    {
        let mut stmt = tx.prepare(
            "INSERT OR IGNORE INTO ignored_secrets (id, value, rule_id, created_at) VALUES (?, ?, ?, ?)"
        ).map_err(|e| e.to_string())?;

        for s in secrets {
            let id = if s.id.is_empty() {
                Uuid::new_v4().to_string()
            } else {
                s.id
            };
            let now = chrono::Utc::now().timestamp_millis();
            stmt.execute(params![id, s.value, s.rule_id, now])
                .map_err(|e| e.to_string())?;
            count += 1;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
pub fn get_ignored_secrets(state: State<DbState>) -> crate::error::Result<Vec<IgnoredSecret>> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, value, rule_id, created_at FROM ignored_secrets ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(IgnoredSecret {
                id: row.get(0)?,
                value: row.get(1)?,
                rule_id: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for r in rows {
        results.push(r.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

#[tauri::command]
pub fn delete_ignored_secret(state: State<DbState>, id: String) -> crate::error::Result<()> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM ignored_secrets WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_all_ignored_values_internal(
    conn: &Connection,
) -> crate::error::Result<std::collections::HashSet<String>> {
    let mut stmt = conn.prepare("SELECT value FROM ignored_secrets")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;

    let mut set = std::collections::HashSet::new();
    for r in rows {
        if let Ok(val) = r {
            set.insert(val);
        }
    }
    Ok(set)
}
