use std::fs;
use std::path::PathBuf;
use std::io::BufWriter;
use rusqlite::{params, Connection, OptionalExtension};
use chrono::Utc;
use uuid::Uuid;
use tauri::{AppHandle, Manager};
use image::{DynamicImage, ImageEncoder};
use image::codecs::png::{PngEncoder, CompressionType, FilterType};
use xxhash_rust::xxh3::xxh3_64;

use super::model::{RefineryKind, RefineryMetadata};

const IMAGE_FOLDER: &str = "refinery_images";

// 辅助函数：计算原始像素的哈希（极快）
pub fn hash_dynamic_image(image: &DynamicImage) -> String {
    let raw_bytes = image.as_bytes();
    let hash_val = xxh3_64(raw_bytes);
    format!("{:016x}", hash_val) // 输出 16 位 hex
}

// 辅助函数：统一的内容哈希（使用 xxHash）
pub fn hash_content(content: &[u8]) -> String {
    let hash_val = xxh3_64(content);
    format!("{:016x}", hash_val)
}

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

// 核心优化：使用 Fast 压缩模式保存 PNG
pub fn save_image_to_disk(app: &AppHandle, image: &DynamicImage) -> Result<(String, String), String> {
    // 1. 先计算哈希 (基于原始像素，极快)
    let hash = hash_dynamic_image(image);

    // 2. 检查文件是否存在
    let dir = ensure_image_dir(app)?;
    let file_name = format!("{}.png", hash);
    let file_path = dir.join(&file_name);
    let file_path_str = file_path.to_string_lossy().to_string();

    if file_path.exists() {
        // 命中缓存，直接返回，跳过编码
        return Ok((file_path_str, hash));
    }

    // 3. 只有新图片才进行编码写入
    // 使用 BufWriter 包装 File，减少磁盘 I/O 次数
    let file = fs::File::create(&file_path).map_err(|e| e.to_string())?;
    let ref_writer = BufWriter::new(file);

    // 4. 配置 PNG 编码器
    // CompressionType::Fast 是关键！牺牲一点体积换取速度，依然无损。
    // FilterType::Adaptive 是默认的，通常平衡性较好
    let encoder = PngEncoder::new_with_quality(
        ref_writer,
        CompressionType::Fast,
        FilterType::Adaptive
    );

    encoder.write_image(
        image.as_bytes(),
        image.width(),
        image.height(),
        image.color().into()
    ).map_err(|e| format!("Failed to encode png: {}", e))?;

    Ok((file_path_str, hash))
}

/// 场景 A：剪贴板捕获逻辑 (Worker 使用)
/// 逻辑：
/// 1. 计算哈希，在数据库中查找最近的一条相同哈希的记录。
/// 2. 如果存在 -> 更新时间，使其置顶 (Bump)。
/// 3. 如果不存在 -> 插入新记录。
pub fn capture_clipboard_item(
    conn: &Connection,
    kind: RefineryKind,
    content: Option<String>,
    hash: String,
    preview: Option<String>,
    source_app: Option<String>,
    url: Option<String>,
    size_info: Option<String>,
    metadata: RefineryMetadata
) -> Result<(bool, String), String> {
    let now = Utc::now().timestamp_millis();

    // 1. 查找是否存在相同内容的记录 (按时间倒序取最新的)
    let existing_id: Option<String> = conn.query_row(
        "SELECT id FROM refinery_history WHERE content_hash = ? ORDER BY updated_at DESC LIMIT 1",
        params![&hash],
        |row| row.get(0)
    ).optional().map_err(|e| e.to_string())?;

    if let Some(id) = existing_id {
        // 2. 存在 -> 仅仅更新时间戳和来源信息 (Bump)
        // 注意：不覆盖用户可能已经编辑过的 title 或 tags
        match (&source_app, &url) {
            (Some(app), Some(u)) => {
                conn.execute(
                    "UPDATE refinery_history SET updated_at = ?, source_app = ?, url = ? WHERE id = ?",
                    params![now, app, u, &id]
                ).map_err(|e| e.to_string())?;
            }
            (Some(app), None) => {
                conn.execute(
                    "UPDATE refinery_history SET updated_at = ?, source_app = ? WHERE id = ?",
                    params![now, app, &id]
                ).map_err(|e| e.to_string())?;
            }
            (None, Some(u)) => {
                conn.execute(
                    "UPDATE refinery_history SET updated_at = ?, url = ? WHERE id = ?",
                    params![now, u, &id]
                ).map_err(|e| e.to_string())?;
            }
            (None, None) => {
                conn.execute(
                    "UPDATE refinery_history SET updated_at = ? WHERE id = ?",
                    params![now, &id]
                ).map_err(|e| e.to_string())?;
            }
        }
        Ok((false, id))
    } else {
        // 3. 不存在 -> 插入新记录
        let new_id = Uuid::new_v4().to_string();
        let meta_json = serde_json::to_string(&metadata).unwrap_or("{}".to_string());

        conn.execute(
            "INSERT INTO refinery_history (
                id, kind, content, content_hash, preview, source_app, url, size_info,
                metadata, created_at, updated_at, is_pinned,
                is_manual, is_edited, tags, title
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, 0, 0, '[]', NULL)",
            params![
                &new_id,
                kind.to_string(),
                content,
                hash,
                preview,
                source_app,
                url,
                size_info,
                meta_json,
                now,
                now
            ]
        ).map_err(|e| e.to_string())?;

        Ok((true, new_id))
    }
}

/// 场景 B：用户手动创建笔记 (Command 使用)
/// 逻辑：直接插入，不检查去重。
pub fn create_manual_note_db(
    conn: &Connection,
    content: String,
    title: Option<String>,
) -> Result<String, String> {
    let now = Utc::now().timestamp_millis();
    let new_id = Uuid::new_v4().to_string();

    // 计算哈希和预览
    let hash = hash_content(content.as_bytes());
    let char_count = content.chars().count();
    let size_info = format!("{} chars", char_count);
    let preview: String = content.chars().take(300).collect();

    let metadata = RefineryMetadata {
        width: None,
        height: None,
        format: None,
        tokens: None,
        image_path: None,
    };
    let meta_json = serde_json::to_string(&metadata).unwrap_or("{}".to_string());

    conn.execute(
        "INSERT INTO refinery_history (
            id, kind, content, content_hash, preview, source_app, url, size_info,
            metadata, created_at, updated_at, is_pinned,
            is_manual, is_edited, tags, title
        ) VALUES (?1, 'text', ?2, ?3, ?4, 'CtxRun', NULL, ?5, ?6, ?7, ?7, 0, 1, 0, '[]', ?8)",
        params![
            &new_id,
            content,
            hash,
            preview,
            size_info,
            meta_json,
            now,
            title
        ]
    ).map_err(|e| e.to_string())?;

    Ok(new_id)
}

/// 场景 C：用户更新笔记内容或标题 (Command 使用)
pub fn update_note_db(
    conn: &Connection,
    id: &str,
    content: Option<String>,
    title: Option<String>
) -> Result<(), String> {
    let now = Utc::now().timestamp_millis();

    if let Some(new_content) = content {
        // 如果更新了内容，必须重新计算 Hash、Size 和 Preview
        let hash = hash_content(new_content.as_bytes());
        let char_count = new_content.chars().count();
        let size_info = format!("{} chars", char_count);
        let preview: String = new_content.chars().take(150).collect();

        conn.execute(
            "UPDATE refinery_history SET
                content = ?1,
                content_hash = ?2,
                preview = ?3,
                size_info = ?4,
                title = COALESCE(?5, title),
                updated_at = ?6,
                is_edited = 1
             WHERE id = ?7",
            params![new_content, hash, preview, size_info, title, now, id]
        ).map_err(|e| e.to_string())?;
    } else if let Some(new_title) = title {
        // 只更新标题
        conn.execute(
            "UPDATE refinery_history SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![new_title, now, id]
        ).map_err(|e| e.to_string())?;
    }

    Ok(())
}
