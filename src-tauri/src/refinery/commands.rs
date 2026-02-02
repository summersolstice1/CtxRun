use tauri::{State, Emitter}; // 引入 Emitter 用于通知前端
use rusqlite::params;
use serde::Serialize;
use serde_json;
use clipboard_rs::Clipboard; // 导入 Clipboard trait

use crate::db::DbState;
use super::model::RefineryItem;
use super::storage::{create_manual_note_db, update_note_db};
use super::worker::SelfCopyState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefineryStatistics {
    pub total_entries: u32,
    pub this_week: u32,
    pub favorites: u32,
}

// ============================================================================
// 查询与筛选 (Read) - 升级版
// ============================================================================

#[tauri::command]
pub fn get_refinery_history(
    state: State<DbState>,
    page: u32,
    page_size: u32,
    search_query: Option<String>,
    kind_filter: Option<String>, // "text" | "image"
    pinned_only: bool,
    start_date: Option<i64>,
    end_date: Option<i64>,
) -> Result<Vec<RefineryItem>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let offset = (page - 1) * page_size;

    let mut sql = String::from("SELECT * FROM refinery_history WHERE 1=1");
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    // 1. 关键词搜索 (升级：增加对 title 的匹配)
    if let Some(q) = search_query {
        let q_str = q.trim();
        if !q_str.is_empty() {
            // 注意：这里暂时使用 LIKE，如果数据量巨大建议改用 FTS Match
            sql.push_str(" AND (preview LIKE ? OR source_app LIKE ? OR title LIKE ?)");
            let pattern = format!("%{}%", q_str);
            params.push(Box::new(pattern.clone()));
            params.push(Box::new(pattern.clone()));
            params.push(Box::new(pattern));
        }
    }

    // 2. 类型筛选
    if let Some(k) = kind_filter {
        if k == "text" || k == "image" {
            sql.push_str(" AND kind = ?");
            params.push(Box::new(k));
        }
    }

    // 3. 收藏筛选
    if pinned_only {
        sql.push_str(" AND is_pinned = 1");
    }

    // 4. 日期范围筛选
    if let Some(start) = start_date {
        sql.push_str(" AND created_at >= ?");
        params.push(Box::new(start));
    }
    if let Some(end) = end_date {
        sql.push_str(" AND created_at <= ?");
        params.push(Box::new(end));
    }

    // 5. 排序与分页
    sql.push_str(" ORDER BY updated_at DESC LIMIT ? OFFSET ?");
    params.push(Box::new(page_size));
    params.push(Box::new(offset));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    // 转换参数类型以匹配 rusqlite api
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let iter = stmt.query_map(param_refs.as_slice(), |row| {
        // 处理 tags JSON 字符串转 Vec<String>
        let tags_str: Option<String> = row.get("tags")?;
        let tags: Option<Vec<String>> = tags_str.and_then(|s| serde_json::from_str(&s).ok());

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
            // [新增字段映射]
            title: row.get("title")?,
            tags,
            is_manual: row.get("is_manual").unwrap_or(false),
            is_edited: row.get("is_edited").unwrap_or(false),
        })
    }).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for item in iter {
        results.push(item.map_err(|e| e.to_string())?);
    }

    Ok(results)
}

/// 获取统计信息
#[tauri::command]
pub fn get_refinery_statistics(state: State<DbState>) -> Result<RefineryStatistics, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // 总条目数
    let total_entries: u32 = conn.query_row(
        "SELECT COUNT(*) FROM refinery_history",
        [],
        |row| row.get(0)
    ).map_err(|e| e.to_string())?;

    // 收藏数
    let favorites: u32 = conn.query_row(
        "SELECT COUNT(*) FROM refinery_history WHERE is_pinned = 1",
        [],
        |row| row.get(0)
    ).map_err(|e| e.to_string())?;

    // 本周新增（计算7天前的时间戳）
    let week_ago = chrono::Utc::now().timestamp_millis() - (7 * 24 * 60 * 60 * 1000);
    let this_week: u32 = conn.query_row(
        "SELECT COUNT(*) FROM refinery_history WHERE created_at > ?",
        params![week_ago],
        |row| row.get(0)
    ).map_err(|e| e.to_string())?;

    Ok(RefineryStatistics {
        total_entries,
        this_week,
        favorites,
    })
}

// ============================================================================
// 操作与状态修改 (Update)
// ============================================================================

#[tauri::command]
pub fn toggle_refinery_pin(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE refinery_history SET is_pinned = NOT is_pinned WHERE id = ?",
        params![id]
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
// 删除逻辑 (Delete) - 包含文件清理
// ============================================================================

/// 内部辅助函数：根据 ID 列表删除数据库记录并清理关联文件
fn delete_items_internal(conn: &rusqlite::Connection, ids: &[String]) -> Result<usize, String> {
    if ids.is_empty() {
        return Ok(0);
    }

    // 1. 查找需要删除的记录中，哪些是图片（需要删文件）
    let mut files_to_delete: Vec<String> = Vec::new();

    {
        let mut stmt = conn.prepare("SELECT kind, content FROM refinery_history WHERE id = ?")
            .map_err(|e| e.to_string())?;

        for id in ids {
            let rows = stmt.query_map(params![id], |row| {
                let kind: String = row.get(0)?;
                let content: String = row.get(1)?;
                Ok((kind, content))
            }).map_err(|e| e.to_string())?;

            for r in rows {
                if let Ok((kind, content)) = r {
                    if kind == "image" {
                        files_to_delete.push(content);
                    }
                }
            }
        }
    }

    // 2. 执行数据库删除 (开启事务)
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let mut deleted_count = 0;

    {
        let mut delete_stmt = tx.prepare("DELETE FROM refinery_history WHERE id = ?")
            .map_err(|e| e.to_string())?;

        for id in ids {
            deleted_count += delete_stmt.execute(params![id]).map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    // 3. 执行文件系统删除 (数据库提交成功后再删文件)
    for path_str in files_to_delete {
        let path = std::path::Path::new(&path_str);
        if path.exists() {
            let _ = std::fs::remove_file(path).map_err(|e|
                println!("[Refinery] Failed to delete image file: {} - {}", path_str, e)
            );
        }
    }

    Ok(deleted_count)
}

#[tauri::command]
pub fn delete_refinery_items(
    state: State<DbState>,
    ids: Vec<String>
) -> Result<usize, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    delete_items_internal(&conn, &ids)
}

#[tauri::command]
pub fn clear_refinery_history(
    state: State<DbState>,
    before_timestamp: Option<i64>, // 如果为 None，则清空所有
    include_pinned: bool,          // 是否同时也删除收藏的项目
) -> Result<usize, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // 1. 构建查询条件，找出所有待删除的 ID
    let mut sql = String::from("SELECT id FROM refinery_history WHERE 1=1");
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    // 时间筛选 (清除 X 天前的记录)
    if let Some(ts) = before_timestamp {
        sql.push_str(" AND created_at < ?");
        params.push(Box::new(ts));
    }

    // 保护收藏项
    if !include_pinned {
        sql.push_str(" AND is_pinned = 0");
    }

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let ids: Vec<String> = stmt.query_map(param_refs.as_slice(), |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    if ids.is_empty() {
        return Ok(0);
    }

    // 2. 复用删除逻辑
    delete_items_internal(&conn, &ids)
}

// ============================================================================
// 剪贴板操作 (Clipboard)
// ============================================================================

/// 复制文本到剪贴板
#[tauri::command]
pub fn copy_refinery_text(text: String, state: State<SelfCopyState>) -> Result<(), String> {
    let clipboard = clipboard_rs::ClipboardContext::new()
        .map_err(|e| format!("Failed to init clipboard: {}", e))?;

    // 标记为自我复制，防止监听器记录
    state.mark_self_copy();

    clipboard.set_text(text)
        .map_err(|e| format!("Failed to copy text: {}", e))?;
    Ok(())
}

/// 复制图片到剪贴板
#[tauri::command]
pub fn copy_refinery_image(image_path: String, state: State<SelfCopyState>) -> Result<(), String> {
    use clipboard_rs::common::{RustImageData, RustImage};
    use std::path::Path;

    // 读取图片文件
    let path = Path::new(&image_path);
    if !path.exists() {
        return Err(format!("Image file not found: {}", image_path));
    }

    // 使用 image crate 打开图片
    let img = image::open(path)
        .map_err(|e| format!("Failed to open image: {}", e))?;

    // 转换为 clipboard_rs 的 RustImageData
    let rust_image = RustImageData::from_dynamic_image(img);

    // 创建剪贴板上下文并设置图片
    let clipboard = clipboard_rs::ClipboardContext::new()
        .map_err(|e| format!("Failed to init clipboard: {}", e))?;

    // 标记为自我复制，防止监听器记录
    state.mark_self_copy();

    clipboard.set_image(rust_image)
        .map_err(|e| format!("Failed to copy image: {}", e))?;

    Ok(())
}

// ============================================================================
// 笔记操作 (Create/Update) - 新增
// ============================================================================

#[tauri::command]
pub fn create_note(
    app: tauri::AppHandle,
    state: State<DbState>,
    content: String,
    title: Option<String>
) -> Result<String, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // 调用 storage 层逻辑
    let new_id = create_manual_note_db(&conn, content, title)?;

    // 通知前端刷新列表
    let _ = app.emit("refinery://new-entry", &new_id);

    Ok(new_id)
}

#[tauri::command]
pub fn update_note(
    app: tauri::AppHandle,
    state: State<DbState>,
    id: String,
    content: Option<String>,
    title: Option<String>
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // 调用 storage 层逻辑
    update_note_db(&conn, &id, content, title)?;

    // 通知前端刷新 (update 事件)
    let _ = app.emit("refinery://update", &id);

    Ok(())
}
