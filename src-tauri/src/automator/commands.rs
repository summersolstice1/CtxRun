use tauri::{State, AppHandle, Emitter};
use std::sync::atomic::Ordering;
use super::engine::{AutomatorState, run_clicker_task};
use super::model::ClickerConfig;

#[tauri::command]
pub async fn start_clicker(
    app: AppHandle,
    state: State<'_, AutomatorState>,
    config: ClickerConfig
) -> Result<(), String> {
    // 防止重复启动
    if state.is_running.load(Ordering::SeqCst) {
        return Ok(());
    }

    // 设置状态为运行中
    state.is_running.store(true, Ordering::SeqCst);

    // 通知前端状态变化
    let _ = app.emit("automator:status", true);

    // 启动后台线程
    run_clicker_task(app, config, state.is_running.clone());

    Ok(())
}

#[tauri::command]
pub async fn stop_clicker(
    app: AppHandle,
    state: State<'_, AutomatorState>
) -> Result<(), String> {
    // 简单地将原子标志设为 false，线程会在下一次循环检测时退出
    state.is_running.store(false, Ordering::SeqCst);
    let _ = app.emit("automator:status", false);
    Ok(())
}

#[tauri::command]
pub async fn get_mouse_position() -> Result<(i32, i32), String> {
    use enigo::{Enigo, Mouse, Settings};

    let enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    let (x, y) = enigo.location().map_err(|e| e.to_string())?;

    Ok((x, y))
}
