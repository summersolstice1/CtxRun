use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use percent_encoding::{AsciiSet, CONTROLS, utf8_percent_encode};
use uuid::Uuid;

use crate::error::{Result, TransferError};

const CONTENT_DISPOSITION_SET: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'%')
    .add(b'\'')
    .add(b';')
    .add(b'\\');

#[derive(Debug, Clone)]
pub struct FileEntry {
    pub id: String,
    pub device_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub path: PathBuf,
}

pub fn create_file_entry(device_id: &str, file_path: &Path) -> Result<FileEntry> {
    let metadata = std::fs::metadata(file_path)?;
    if !metadata.is_file() {
        return Err(TransferError::BadRequest(format!(
            "Selected path is not a file: {}",
            file_path.display()
        )));
    }

    let file_name = file_path
        .file_name()
        .and_then(OsStr::to_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| TransferError::BadRequest("Unable to resolve file name.".to_string()))?;

    Ok(FileEntry {
        id: Uuid::new_v4().simple().to_string()[..16].to_string(),
        device_id: device_id.to_string(),
        file_name,
        file_size: metadata.len(),
        path: file_path.to_path_buf(),
    })
}

pub fn sanitize_filename(raw: &str) -> String {
    let name = Path::new(raw)
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("file")
        .trim();

    if name.is_empty() {
        return "file".to_string();
    }

    name.replace(['\0', '\r', '\n'], "")
}

pub fn resolve_save_path(save_dir: &Path, raw_name: &str) -> Result<PathBuf> {
    let safe_name = sanitize_filename(raw_name);
    let candidate = save_dir.join(&safe_name);
    if !candidate.exists() {
        return Ok(candidate);
    }

    let stem = Path::new(&safe_name)
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or("file");
    let ext = Path::new(&safe_name)
        .extension()
        .and_then(OsStr::to_str)
        .map(|value| format!(".{value}"))
        .unwrap_or_default();

    for index in 1..10_000 {
        let next = save_dir.join(format!("{stem}({index}){ext}"));
        if !next.exists() {
            return Ok(next);
        }
    }

    Err(TransferError::Message(
        "Failed to allocate a unique file name.".to_string(),
    ))
}

pub fn build_content_disposition(file_name: &str) -> String {
    let encoded = utf8_percent_encode(file_name, CONTENT_DISPOSITION_SET).to_string();
    let ascii_fallback = file_name
        .chars()
        .map(|ch| {
            if ch.is_ascii() && !ch.is_control() {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    let ascii_fallback = if ascii_fallback.trim().is_empty() {
        "download.bin".to_string()
    } else {
        ascii_fallback
    };

    format!("attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded}")
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{resolve_save_path, sanitize_filename};

    #[test]
    fn sanitize_filename_strips_parent_traversal() {
        assert_eq!(sanitize_filename("../unsafe.txt"), "unsafe.txt");
        assert_eq!(sanitize_filename("..\\unsafe.txt"), "unsafe.txt");
    }

    #[test]
    fn resolve_save_path_uses_incrementing_suffix() {
        let root = std::env::temp_dir().join("ctxrun-transfer-save-path-test");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create root");
        fs::write(root.join("report.txt"), "one").expect("seed file");

        let next = resolve_save_path(&root, "report.txt").expect("resolve unique path");
        assert!(next.ends_with("report(1).txt"));

        let _ = fs::remove_dir_all(&root);
    }
}
