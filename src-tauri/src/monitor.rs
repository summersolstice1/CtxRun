use std::sync::{Arc, Mutex};

use ctxrun_env_probe::commands::is_critical_system_process;
use ctxrun_process_utils::new_background_command;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use tauri::State;

#[tauri::command]
pub fn kill_process(
    pid: u32,
    system: State<'_, Arc<Mutex<System>>>,
) -> crate::error::Result<String> {
    let mut sys = system.lock().map_err(|e| e.to_string())?;
    let sys_pid = Pid::from(pid as usize);

    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[sys_pid]),
        false,
        ProcessRefreshKind::nothing(),
    );

    if let Some(process) = sys.process(sys_pid) {
        if is_critical_system_process(&sys, process) {
            return Err("Action Denied: Cannot kill a critical system process.".into());
        }
    } else {
        return Err("Process not found".into());
    }

    #[cfg(target_os = "windows")]
    let output = new_background_command("taskkill")
        .args(["/F", "/PID", &pid.to_string()])
        .output();

    #[cfg(not(target_os = "windows"))]
    let output = new_background_command("kill")
        .args(["-9", &pid.to_string()])
        .output();

    match output {
        Ok(output) if output.status.success() => Ok("Success".to_string()),
        Ok(output) => Err(String::from_utf8_lossy(&output.stderr).to_string().into()),
        Err(err) => Err(err.to_string().into()),
    }
}
