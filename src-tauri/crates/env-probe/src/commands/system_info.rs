use std::sync::{Arc, Mutex};

use ctxrun_process_utils::new_background_command;
use serde::Serialize;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};
use tauri::State;

#[derive(Debug, Serialize)]
pub struct SystemInfo {
    cpu_usage: f64,
    memory_usage: u64,
    memory_total: u64,
    memory_available: u64,
    uptime: u64,
}

#[tauri::command]
pub fn get_system_info(system: State<'_, Arc<Mutex<System>>>) -> crate::error::Result<SystemInfo> {
    let mut sys = system.lock().map_err(|e| e.to_string())?;

    sys.refresh_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::nothing().with_cpu_usage())
            .with_memory(MemoryRefreshKind::nothing()),
    );

    Ok(SystemInfo {
        cpu_usage: sys.global_cpu_usage() as f64,
        memory_usage: sys.used_memory(),
        memory_total: sys.total_memory(),
        memory_available: sys.available_memory(),
        uptime: System::uptime(),
    })
}

#[tauri::command]
pub async fn check_python_env() -> crate::error::Result<String> {
    tauri::async_runtime::spawn_blocking(move || -> crate::error::Result<String> {
        #[cfg(target_os = "windows")]
        let bin = "python";
        #[cfg(not(target_os = "windows"))]
        let bin = "python3";

        let mut cmd = new_background_command(bin);
        cmd.arg("--version");
        let output = cmd.output().map_err(|_| "Not Found".to_string())?;

        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if version.is_empty() {
                Ok(String::from_utf8_lossy(&output.stderr).trim().to_string())
            } else {
                Ok(version)
            }
        } else {
            Err("Not Installed".to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
