use tauri::State;
use rusqlite::params;
use std::fs;
use std::path::Path;
use clipboard_rs::{ClipboardContext, Clipboard};
use clipboard_rs::common::{RustImageData, RustImage};

use crate::db::DbState;
use super::model::RefineryItem;

// ============================================================================
// 查询与筛选 (Read)
// ============================================================================

#[tauri::command]
pub fn get_refinery_history(
    state: State<DbState>,
    page: u32,
    page_size: u32,
    search_query: Option<String>,
    kind_filter: Option<String>, // "text" | "image"
    pinned_only: bool,
) -> Result<Vec<RefineryItem>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let offset = (page - 1) * page_size;

    let mut sql = String::from("SELECT * FROM refinery_history WHERE 1=1");
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    // 1. 关键词搜索 (匹配 preview 或 source_app)
    if let Some(q) = search_query {
        let q_str = q.trim();
        if !q_str.is_empty() {
            sql.push_str(" AND (preview LIKE ? OR source_app LIKE ?)");
            let pattern = format!("%{}%", q_str);
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

    // 4. 排序与分页 (按更新时间倒序)
    sql.push_str(" ORDER BY updated_at DESC LIMIT ? OFFSET ?");
    params.push(Box::new(page_size));
    params.push(Box::new(offset));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    // 转换参数类型以匹配 rusqlite api
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let iter = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(RefineryItem {
            id: row.get("id")?,
            kind: row.get("kind")?,
            content: row.get("content")?, // 注意：如果是图片，这里是文件路径
            content_hash: row.get("content_hash")?,
            preview: row.get("preview")?,
            source_app: row.get("source_app")?,
            url: row.get("url")?,
            size_info: row.get("size_info")?,
            is_pinned: row.get("is_pinned")?,
            metadata: row.get("metadata")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for item in iter {
        results.push(item.map_err(|e| e.to_string())?);
    }

    Ok(results)
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
    // 为了性能，我们手动拼接 IN 查询 (SQLite 参数限制通常是 999，批量删除需注意)
    // 这里使用简单的循环查询（考虑到批量删除通常不会一次选几千个，循环可接受且安全）
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
    // 使用循环执行 delete，或者构造 WHERE id IN (...)
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
        let path = Path::new(&path_str);
        if path.exists() {
            let _ = fs::remove_file(path).map_err(|e|
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
pub fn copy_refinery_text(text: String) -> Result<(), String> {
    let clipboard = ClipboardContext::new()
        .map_err(|e| format!("Failed to init clipboard: {}", e))?;
    clipboard.set_text(text)
        .map_err(|e| format!("Failed to copy text: {}", e))?;
    Ok(())
}

/// 复制图片到剪贴板
#[tauri::command]
pub fn copy_refinery_image(image_path: String) -> Result<(), String> {
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
    let clipboard = ClipboardContext::new()
        .map_err(|e| format!("Failed to init clipboard: {}", e))?;

    clipboard.set_image(rust_image)
        .map_err(|e| format!("Failed to copy image: {}", e))?;

    Ok(())
}
