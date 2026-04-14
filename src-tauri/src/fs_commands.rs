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

    #[cfg(target_os = "windows")]
    {
        if metadata.is_file() {
            // 如果是文件，打开所在目录并高亮选中该文件
            new_detached_command("explorer")
                .arg(format!("/select,{}", path))
                .spawn()
                .map_err(|e| format!("Failed to reveal file: {e}"))?;
        } else {
            // 如果是目录，直接打开
            new_detached_command("explorer")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open folder: {e}"))?;
        }
    }

    #[cfg(target_os = "macos")]
    {
        if metadata.is_file() {
            // Mac 访达中高亮选中文件
            std::process::Command::new("open")
                .arg("-R")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to reveal file: {e}"))?;
        } else {
            std::process::Command::new("open")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open folder: {e}"))?;
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Linux 缺乏统一的选中命令，打开其父目录
        let target_path = if metadata.is_file() {
            std::path::Path::new(&path)
                .parent()
                .unwrap_or(std::path::Path::new(&path))
                .to_string_lossy()
                .to_string()
        } else {
            path
        };

        std::process::Command::new("xdg-open")
            .arg(&target_path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {e}"))?;
    }

    Ok(())
}
