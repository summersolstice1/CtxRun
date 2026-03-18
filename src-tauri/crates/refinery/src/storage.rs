use chrono::Utc;
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{DynamicImage, ImageEncoder};
use rusqlite::{Connection, OptionalExtension, params};
use std::fs;
use std::io::BufWriter;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};
use uuid::Uuid;
use xxhash_rust::xxh3::xxh3_64;

use super::models::{ClipboardCapture, RefineryMetadata};
use crate::error::Result;

const IMAGE_FOLDER: &str = "refinery_images";

pub fn hash_dynamic_image(image: &DynamicImage) -> String {
    let raw_bytes = image.as_bytes();
    let hash_val = xxh3_64(raw_bytes);
    format!("{:016x}", hash_val)
}

pub fn hash_content(content: &[u8]) -> String {
    let hash_val = xxh3_64(content);
    format!("{:016x}", hash_val)
}

fn ensure_image_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    let app_dir = app.path().app_local_data_dir()?;

    let image_dir = app_dir.join(IMAGE_FOLDER);
    if !image_dir.exists() {
        fs::create_dir_all(&image_dir)?;
    }
    Ok(image_dir)
}

pub fn save_image_to_disk<R: Runtime>(
    app: &AppHandle<R>,
    image: &DynamicImage,
) -> Result<(String, String)> {
    let hash = hash_dynamic_image(image);

    let dir = ensure_image_dir(app)?;
    let file_name = format!("{}.png", hash);
    let file_path = dir.join(&file_name);
    let file_path_str = file_path.to_string_lossy().to_string();

    if file_path.exists() {
        return Ok((file_path_str, hash));
    }

    let file = fs::File::create(&file_path)?;
    let ref_writer = BufWriter::new(file);

    let encoder =
        PngEncoder::new_with_quality(ref_writer, CompressionType::Fast, FilterType::Adaptive);

    encoder.write_image(
        image.as_bytes(),
        image.width(),
        image.height(),
        image.color().into(),
    )?;

    Ok((file_path_str, hash))
}

pub fn capture_clipboard_item(conn: &Connection, item: ClipboardCapture) -> Result<(bool, String)> {
    let now = Utc::now().timestamp_millis();
    let ClipboardCapture {
        kind,
        content,
        hash,
        preview,
        source_app,
        url,
        size_info,
        metadata,
    } = item;

    let existing_id: Option<String> = conn.query_row(
        "SELECT id FROM refinery_history WHERE content_hash = ? ORDER BY updated_at DESC LIMIT 1",
        params![&hash],
        |row: &rusqlite::Row| row.get(0)
    ).optional()?;

    if let Some(id) = existing_id {
        match (&source_app, &url) {
            (Some(app), Some(u)) => {
                conn.execute(
                    "UPDATE refinery_history SET updated_at = ?, source_app = ?, url = ? WHERE id = ?",
                    params![now, app, u, &id]
                )?;
            }
            (Some(app), None) => {
                conn.execute(
                    "UPDATE refinery_history SET updated_at = ?, source_app = ? WHERE id = ?",
                    params![now, app, &id],
                )?;
            }
            (None, Some(u)) => {
                conn.execute(
                    "UPDATE refinery_history SET updated_at = ?, url = ? WHERE id = ?",
                    params![now, u, &id],
                )?;
            }
            (None, None) => {
                conn.execute(
                    "UPDATE refinery_history SET updated_at = ? WHERE id = ?",
                    params![now, &id],
                )?;
            }
        }
        Ok((false, id))
    } else {
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
            ],
        )?;

        Ok((true, new_id))
    }
}

pub fn create_manual_note_db(
    conn: &Connection,
    content: String,
    title: Option<String>,
) -> Result<String> {
    let now = Utc::now().timestamp_millis();
    let new_id = Uuid::new_v4().to_string();

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
            &new_id, content, hash, preview, size_info, meta_json, now, title
        ],
    )?;

    Ok(new_id)
}

pub fn update_note_db(
    conn: &Connection,
    id: &str,
    content: Option<String>,
    title: Option<String>,
) -> Result<()> {
    let now = Utc::now().timestamp_millis();

    if let Some(new_content) = content {
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
            params![new_content, hash, preview, size_info, title, now, id],
        )?;
    } else if let Some(new_title) = title {
        conn.execute(
            "UPDATE refinery_history SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![new_title, now, id],
        )?;
    }

    Ok(())
}
