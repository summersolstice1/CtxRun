use clipboard_rs::Clipboard;
use rusqlite::{OptionalExtension, params};
use serde::Serialize;
use serde_json;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tokio::sync::Mutex;

use enigo::{Direction, Enigo, Key, Keyboard, Settings};

use super::cleanup_worker::RefineryCleanupConfig;
use super::models::RefineryItem;
use super::storage::{create_manual_note_db, update_note_db};
use super::worker::PASTING_FLAG;
use crate::error::Result;
use ctxrun_db::DbState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefineryStatistics {
    pub total_entries: u32,
    pub this_week: u32,
    pub favorites: u32,
}

#[tauri::command]
pub fn get_refinery_history(
    state: State<DbState>,
    page: u32,
    page_size: u32,
    search_query: Option<String>,
    kind_filter: Option<String>,
    pinned_only: bool,
    manual_only: bool,
    start_date: Option<i64>,
    end_date: Option<i64>,
) -> Result<Vec<RefineryItem>> {
    let conn = state.conn.lock()?;
    let offset = (page - 1) * page_size;

    let mut sql = String::from(
        "SELECT id, kind,
                CASE WHEN kind = 'image' THEN content ELSE NULL END as content,
                content_hash, preview, source_app, url, size_info,
                is_pinned, metadata, created_at, updated_at,
                title, tags, is_manual, is_edited
         FROM refinery_history WHERE 1=1",
    );
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(q) = search_query {
        let q_str = q.trim();
        if !q_str.is_empty() {
            let escaped_query = q_str
                .replace('\\', "\\\\")
                .replace('"', "\"\"")
                .replace(' ', " AND ");
            sql.push_str(&format!(
                " AND rowid IN (SELECT rowid FROM refinery_fts WHERE refinery_fts MATCH \"{}\")",
                escaped_query
            ));
        }
    }

    if let Some(k) = kind_filter {
        if k == "text" || k == "image" {
            sql.push_str(" AND kind = ?");
            params.push(Box::new(k));
        }
    }

    if pinned_only {
        sql.push_str(" AND is_pinned = 1");
    }
    if manual_only {
        sql.push_str(" AND is_manual = 1");
    }

    if let Some(start) = start_date {
        sql.push_str(" AND created_at >= ?");
        params.push(Box::new(start));
    }
    if let Some(end) = end_date {
        sql.push_str(" AND created_at <= ?");
        params.push(Box::new(end));
    }

    sql.push_str(" ORDER BY updated_at DESC LIMIT ? OFFSET ?");
    params.push(Box::new(page_size));
    params.push(Box::new(offset));

    let mut stmt = conn.prepare(&sql)?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let iter = stmt.query_map(param_refs.as_slice(), |row: &rusqlite::Row| {
        let tags_str: Option<String> = row.get("tags")?;
        let tags: Option<Vec<String>> = tags_str.and_then(|s| serde_json::from_str(&s).ok());
        let kind: String = row.get("kind")?;
        let content: Option<String> = if kind == "image" {
            row.get("content")?
        } else {
            None
        };

        Ok(RefineryItem {
            id: row.get("id")?,
            kind,
            content,
            content_hash: row.get("content_hash")?,
            preview: row.get("preview")?,
            source_app: row.get("source_app")?,
            url: row.get("url")?,
            size_info: row.get("size_info")?,
            is_pinned: row.get("is_pinned")?,
            metadata: row.get("metadata")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            title: row.get("title")?,
            tags,
            is_manual: row.get("is_manual").unwrap_or(false),
            is_edited: row.get("is_edited").unwrap_or(false),
        })
    })?;

    let mut results = Vec::new();
    for item in iter {
        results.push(item?);
    }
    Ok(results)
}

#[tauri::command]
pub fn get_refinery_item_detail(state: State<DbState>, id: String) -> Result<Option<RefineryItem>> {
    let conn = state.conn.lock()?;
    let item = conn
        .query_row(
            "SELECT * FROM refinery_history WHERE id = ?",
            params![id],
            |row: &rusqlite::Row| {
                let tags_str: Option<String> = row.get("tags")?;
                let tags: Option<Vec<String>> =
                    tags_str.and_then(|s| serde_json::from_str(&s).ok());
                Ok(RefineryItem {
                    id: row.get("id")?,
                    kind: row.get("kind")?,
                    content: row.get("content")?,
                    content_hash: row.get("content_hash")?,
                    preview: row.get("preview")?,
                    source_app: row.get("source_app")?,
                    url: row.get("url")?,
                    size_info: row.get("size_info")?,
                    is_pinned: row.get("is_pinned")?,
                    metadata: row.get("metadata")?,
                    created_at: row.get("created_at")?,
                    updated_at: row.get("updated_at")?,
                    title: row.get("title")?,
                    tags,
                    is_manual: row.get("is_manual").unwrap_or(false),
                    is_edited: row.get("is_edited").unwrap_or(false),
                })
            },
        )
        .optional()?;
    Ok(item)
}

#[tauri::command]
pub fn get_refinery_statistics(state: State<DbState>) -> Result<RefineryStatistics> {
    let conn = state.conn.lock()?;
    let total_entries: u32 = conn.query_row(
        "SELECT COUNT(*) FROM refinery_history",
        [],
        |row: &rusqlite::Row| row.get(0),
    )?;

    let favorites: u32 = conn.query_row(
        "SELECT COUNT(*) FROM refinery_history WHERE is_pinned = 1",
        [],
        |row: &rusqlite::Row| row.get(0),
    )?;

    let week_ago = chrono::Utc::now().timestamp_millis() - (7 * 24 * 60 * 60 * 1000);
    let this_week: u32 = conn.query_row(
        "SELECT COUNT(*) FROM refinery_history WHERE created_at > ?",
        params![week_ago],
        |row: &rusqlite::Row| row.get(0),
    )?;

    Ok(RefineryStatistics {
        total_entries,
        this_week,
        favorites,
    })
}

#[tauri::command]
pub fn toggle_refinery_pin(state: State<DbState>, id: String) -> Result<()> {
    let conn = state.conn.lock()?;
    conn.execute(
        "UPDATE refinery_history SET is_pinned = NOT is_pinned WHERE id = ?",
        params![id],
    )?;
    Ok(())
}

fn delete_items_internal(conn: &rusqlite::Connection, ids: &[String]) -> Result<usize> {
    if ids.is_empty() {
        return Ok(0);
    }
    let mut files_to_delete: Vec<String> = Vec::new();
    {
        let mut stmt = conn.prepare("SELECT kind, content FROM refinery_history WHERE id = ?")?;
        for id in ids {
            let rows = stmt.query_map(params![id], |row: &rusqlite::Row| {
                let kind: String = row.get(0)?;
                let content: String = row.get(1)?;
                Ok((kind, content))
            })?;
            for r in rows {
                if let Ok((kind, content)) = r {
                    if kind == "image" {
                        files_to_delete.push(content);
                    }
                }
            }
        }
    }
    let tx = conn.unchecked_transaction()?;
    let mut deleted_count = 0;
    {
        let mut delete_stmt = tx.prepare("DELETE FROM refinery_history WHERE id = ?")?;
        for id in ids {
            deleted_count += delete_stmt.execute(params![id])?;
        }
    }
    tx.commit()?;
    for path_str in files_to_delete {
        let path = std::path::Path::new(&path_str);
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }
    Ok(deleted_count)
}

#[tauri::command]
pub fn delete_refinery_items(state: State<DbState>, ids: Vec<String>) -> Result<usize> {
    let conn = state.conn.lock()?;
    delete_items_internal(&conn, &ids)
}

#[tauri::command]
pub fn clear_refinery_history(
    state: State<DbState>,
    before_timestamp: Option<i64>,
    include_pinned: bool,
) -> Result<usize> {
    let conn = state.conn.lock()?;
    let mut sql = String::from("SELECT id FROM refinery_history WHERE 1=1");
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if let Some(ts) = before_timestamp {
        sql.push_str(" AND created_at < ?");
        params.push(Box::new(ts));
    }
    if !include_pinned {
        sql.push_str(" AND is_pinned = 0");
    }
    let mut stmt = conn.prepare(&sql)?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let ids: Vec<String> = stmt
        .query_map(param_refs.as_slice(), |row: &rusqlite::Row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();
    if ids.is_empty() {
        return Ok(0);
    }
    delete_items_internal(&conn, &ids)
}

#[tauri::command]
pub async fn copy_refinery_text(text: String) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let clipboard = clipboard_rs::ClipboardContext::new()
            .map_err(|e| format!("Failed to init clipboard: {}", e))?;
        clipboard
            .set_text(text)
            .map_err(|e| format!("Failed to copy text: {}", e))?;
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn copy_refinery_image(image_path: String) -> Result<()> {
    use clipboard_rs::common::{RustImage, RustImageData};
    use std::path::Path;
    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&image_path);
        if !path.exists() {
            return Err(format!("Image file not found: {}", image_path).into());
        }
        let img = image::open(path)?;
        let final_img = if img.width() > 4096 || img.height() > 4096 {
            let (max_w, max_h) = if img.width() > img.height() {
                (4096, (4096 * img.height() / img.width()).max(1))
            } else {
                ((4096 * img.width() / img.height()).max(1), 4096)
            };
            img.resize(max_w, max_h, image::imageops::FilterType::Triangle)
        } else {
            img
        };
        let rust_image = RustImageData::from_dynamic_image(final_img);
        let clipboard = clipboard_rs::ClipboardContext::new()
            .map_err(|e| format!("Failed to init clipboard: {}", e))?;
        clipboard
            .set_image(rust_image)
            .map_err(|e| format!("Failed to copy image: {}", e))?;
        Ok(())
    })
    .await?
}

#[tauri::command]
pub fn create_note<R: Runtime>(
    app: AppHandle<R>,
    state: State<DbState>,
    content: String,
    title: Option<String>,
) -> Result<String> {
    let conn = state.conn.lock()?;
    let new_id = create_manual_note_db(&conn, content, title)?;
    let _ = app.emit("refinery:create", &new_id);
    Ok(new_id)
}

#[tauri::command]
pub fn update_note<R: Runtime>(
    app: AppHandle<R>,
    state: State<DbState>,
    id: String,
    content: Option<String>,
    title: Option<String>,
) -> Result<()> {
    let conn = state.conn.lock()?;
    update_note_db(&conn, &id, content, title)?;
    let _ = app.emit("refinery:update", &id);
    Ok(())
}

pub struct CleanupConfigState(pub Arc<Mutex<RefineryCleanupConfig>>);

#[tauri::command]
pub async fn update_cleanup_config<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CleanupConfigState>,
    config: RefineryCleanupConfig,
) -> Result<()> {
    let is_enabled = config.enabled;
    {
        let mut state_config = state.0.lock().await;
        *state_config = config;
    }

    if is_enabled {
        let _ = manual_cleanup(app, state).await;
    }

    Ok(())
}
#[tauri::command]
pub async fn manual_cleanup<R: Runtime>(
    app: AppHandle<R>,
    config_state: State<'_, CleanupConfigState>,
) -> Result<usize> {
    let config = config_state.0.lock().await.clone();
    if !config.enabled {
        return Ok(0);
    }
    match config.strategy.as_str() {
        "count" => {
            if let Some(max) = config.max_count {
                execute_count_cleanup(&app, max, config.keep_pinned)
            } else {
                Ok(0)
            }
        }
        "time" => {
            if let Some(days) = config.days {
                execute_time_cleanup(&app, days, config.keep_pinned)
            } else {
                Ok(0)
            }
        }
        "both" => {
            let c = if let Some(max) = config.max_count {
                execute_count_cleanup(&app, max, config.keep_pinned).unwrap_or(0)
            } else {
                0
            };
            if c == 0 {
                if let Some(days) = config.days {
                    execute_time_cleanup(&app, days, config.keep_pinned)
                } else {
                    Ok(0)
                }
            } else {
                Ok(c)
            }
        }
        _ => Ok(0),
    }
}

const CLEANUP_BUFFER_RATIO: f64 = 0.10;

pub fn execute_count_cleanup<R: Runtime>(
    app: &AppHandle<R>,
    max_count: u32,
    keep_pinned: bool,
) -> Result<usize> {
    let state = app.state::<DbState>();
    let conn = state.conn.lock()?;
    let buffer = (max_count as f64 * CLEANUP_BUFFER_RATIO).ceil() as u32;
    let threshold = max_count + buffer;
    let total: u32 = conn.query_row(
        "SELECT COUNT(*) FROM refinery_history WHERE is_manual = 0",
        [],
        |row: &rusqlite::Row| row.get(0),
    )?;
    if total <= threshold {
        return Ok(0);
    }
    let to_delete = total - max_count;
    let mut sql = String::from("SELECT id FROM refinery_history WHERE is_manual = 0");
    if keep_pinned {
        sql.push_str(" AND is_pinned = 0");
    }
    sql.push_str(&format!(" ORDER BY updated_at ASC LIMIT {}", to_delete));
    let ids: Vec<String> = conn
        .prepare(&sql)?
        .query_map([], |row: &rusqlite::Row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();
    if ids.is_empty() {
        return Ok(0);
    }
    delete_items_internal(&conn, &ids)
}

pub fn execute_time_cleanup<R: Runtime>(
    app: &AppHandle<R>,
    days: u32,
    keep_pinned: bool,
) -> Result<usize> {
    let state = app.state::<DbState>();
    let conn = state.conn.lock()?;
    let cutoff = chrono::Utc::now().timestamp_millis() - (days as i64 * 24 * 60 * 60 * 1000);
    let mut sql =
        String::from("SELECT id FROM refinery_history WHERE is_manual = 0 AND created_at < ?");
    if keep_pinned {
        sql.push_str(" AND is_pinned = 0");
    }
    let ids: Vec<String> = conn
        .prepare(&sql)?
        .query_map(params![cutoff], |row: &rusqlite::Row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();
    if ids.is_empty() {
        return Ok(0);
    }
    delete_items_internal(&conn, &ids)
}

#[tauri::command]
pub async fn spotlight_paste<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, DbState>,
    item_id: String,
) -> Result<()> {
    PASTING_FLAG.store(true, std::sync::atomic::Ordering::SeqCst);
    let (kind, content) = {
        let conn = state.conn.lock()?;
        conn.query_row(
            "SELECT kind, content FROM refinery_history WHERE id = ?",
            params![item_id],
            |row: &rusqlite::Row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        )?
    };

    if let Some(window) = app.get_webview_window("spotlight") {
        let _ = window.hide();
    }

    if kind == "image" {
        if let Some(path) = content {
            copy_refinery_image(path).await?;
        }
    } else {
        if let Some(text) = content {
            copy_refinery_text(text).await?;
        }
    }

    tauri::async_runtime::spawn(async move {
        thread::sleep(Duration::from_millis(150));
        let mut enigo = match Enigo::new(&Settings::default()) {
            Ok(e) => e,
            Err(e) => {
                eprintln!("[CtxRun] Failed to init Enigo: {:?}", e);
                return;
            }
        };
        let mut perform_paste = || -> std::result::Result<(), enigo::InputError> {
            #[cfg(target_os = "macos")]
            {
                enigo.key(Key::Meta, Direction::Press)?;
                enigo.key(Key::Unicode('v'), Direction::Click)?;
                enigo.key(Key::Meta, Direction::Release)?;
            }
            #[cfg(not(target_os = "macos"))]
            {
                enigo.key(Key::Control, Direction::Press)?;
                enigo.key(Key::Unicode('v'), Direction::Click)?;
                enigo.key(Key::Control, Direction::Release)?;
            }
            Ok(())
        };
        if let Err(e) = perform_paste() {
            eprintln!("[CtxRun] Enigo paste failed: {:?}", e);
        }
        thread::sleep(Duration::from_millis(500));
        PASTING_FLAG.store(false, std::sync::atomic::Ordering::SeqCst);
    });
    Ok(())
}
