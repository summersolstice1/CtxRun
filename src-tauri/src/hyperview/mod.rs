pub mod protocol;
pub mod sniffer;

use self::sniffer::FileMeta;

#[tauri::command]
pub async fn get_file_meta(path: String) -> crate::error::Result<FileMeta> {
    tauri::async_runtime::spawn_blocking(move || sniffer::detect_file_type(&path))
        .await
        .map_err(|e| e.to_string())?
}
