#[cfg(target_os = "windows")]
use ctxrun_process_utils::new_detached_command;

#[tauri::command]
pub fn get_file_size(path: String) -> u64 {
    match std::fs::metadata(path) {
        Ok(metadata) => metadata.len(),
        Err(_) => 0,
    }
}

#[tauri::command]
pub fn open_folder_in_file_manager(path: String) -> crate::error::Result<()> {
    let metadata = std::fs::metadata(&path).map_err(|e| format!("Failed to access path: {e}"))?;
    if !metadata.is_dir() {
        return Err("Path is not a directory".into());
    }

    #[cfg(target_os = "windows")]
    {
        new_detached_command("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {e}"))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {e}"))?;
    }

    Ok(())
}
