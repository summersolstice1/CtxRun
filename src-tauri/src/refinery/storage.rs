use std::fs;
use std::path::PathBuf;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use chrono::Utc;
use uuid::Uuid;
use tauri::{AppHandle, Manager};
use image::DynamicImage;
use std::io::Cursor;

use super::model::{RefineryKind, RefineryMetadata};

const IMAGE_FOLDER: &str = "refinery_images";

/// 计算文本内容的 SHA256
pub fn hash_content(content: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content);
    hex::encode(hasher.finalize())
}

/// 确保图片存储目录存在
fn ensure_image_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path().app_local_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let image_dir = app_dir.join(IMAGE_FOLDER);
    if !image_dir.exists() {
        fs::create_dir_all(&image_dir)
            .map_err(|e| format!("Failed to create image dir: {}", e))?;
    }
    Ok(image_dir)
}

/// 保存图片到本地文件系统，返回 (文件路径, 哈希值)
pub fn save_image_to_disk(app: &AppHandle, image: &DynamicImage) -> Result<(String, String), String> {
    // 1. 转换为 PNG 字节流以计算统一的 Hash
    let mut bytes: Vec<u8> = Vec::new();
    image.write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode image: {}", e))?;

    let hash = hash_content(&bytes);
    let file_name = format!("{}.png", hash);

    let dir = ensure_image_dir(app)?;
    let file_path = dir.join(&file_name);
    let file_path_str = file_path.to_string_lossy().to_string();

    // 如果文件已存在，直接返回路径（相当于去重）
    if file_path.exists() {
        return Ok((file_path_str, hash));
    }

    // 写入文件
    fs::write(&file_path, &bytes)
        .map_err(|e| format!("Failed to write image file: {}", e))?;

    Ok((file_path_str, hash))
}

/// 核心数据库操作：Upsert (插入或更新时间)
/// 返回: (IsNewEntry: bool, ItemId: String)
pub fn upsert_record(
    conn: &Connection,
    kind: RefineryKind,
    content: Option<String>,
    hash: String,
    preview: Option<String>,
    source_app: Option<String>, // [新增]
    size_info: Option<String>,
    metadata: RefineryMetadata
) -> Result<(bool, String), String> {
    let now = Utc::now().timestamp_millis();

    // 1. 检查是否存在
    let existing_id: Option<String> = conn.query_row(
        "SELECT id FROM refinery_history WHERE content_hash = ? LIMIT 1",
        params![&hash],
        |row| row.get(0)
    ).unwrap_or(None);

    if let Some(id) = existing_id {
        // 2. 存在 -> 更新时间和 source_app
        conn.execute(
            "UPDATE refinery_history SET updated_at = ?, source_app = ? WHERE id = ?",
            params![now, source_app, &id]
        ).map_err(|e| e.to_string())?;

        Ok((false, id))
    } else {
        // 3. 不存在 -> 插入新记录
        let new_id = Uuid::new_v4().to_string();
        let meta_json = serde_json::to_string(&metadata).unwrap_or("{}".to_string());

        conn.execute(
            "INSERT INTO refinery_history (
                id, kind, content, content_hash, preview, source_app, size_info,
                metadata, created_at, updated_at, is_pinned
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0)",
            params![
                &new_id,
                kind.to_string(),
                content,
                hash,
                preview,
                source_app, // [新增]
                size_info,
                meta_json,
                now,
                now
            ]
        ).map_err(|e| e.to_string())?;

        Ok((true, new_id))
    }
}
