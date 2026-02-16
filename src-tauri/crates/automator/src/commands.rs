use tauri::{State, AppHandle, Emitter, Runtime};
use std::sync::atomic::Ordering;
use crate::engine::{AutomatorState, run_workflow_task, run_graph_task};
use crate::models::{Workflow, WorkflowGraph};
use crate::screen;

#[tauri::command]
pub async fn execute_workflow<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AutomatorState>,
    workflow: Workflow
) -> Result<(), String> {
    if state.is_running.load(Ordering::SeqCst) {
        return Err("Already running".into());
    }

    state.is_running.store(true, Ordering::SeqCst);
    let _ = app.emit("automator:status", true);

    run_workflow_task(app, workflow, state.is_running.clone());

    Ok(())
}

#[tauri::command]
pub async fn stop_workflow<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AutomatorState>
) -> Result<(), String> {
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

#[tauri::command]
pub async fn get_pixel_color(x: i32, y: i32) -> Result<String, String> {
    // 使用 tauri::async_runtime::spawn_blocking
    // 因为屏幕截图通常是阻塞操作，不应阻塞 Tauri 的异步运行时线程
    let result = tauri::async_runtime::spawn_blocking(move || {
        screen::get_color_at(x, y)
    }).await
    .map_err(|e| format!("Task join error: {}", e))?; // 处理线程错误

    match result {
        Ok(hex) => Ok(hex),
        Err(e) => Err(format!("Failed to get color: {}", e)) // 处理业务错误
    }
}

/// 调试命令：获取所有屏幕信息
#[tauri::command]
pub async fn get_screens_info() -> Result<Vec<screen::ScreenInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        screen::get_all_screens_info()
    }).await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to get screens info: {}", e))
}

/// 调试命令：测试取色功能（带详细日志）
#[tauri::command]
pub async fn test_get_pixel_color(x: i32, y: i32) -> Result<String, String> {
    eprintln!("[TestColor] Testing color pick at ({}, {})", x, y);

    let result = tauri::async_runtime::spawn_blocking(move || {
        screen::get_color_at(x, y)
    }).await
    .map_err(|e| format!("Task join error: {}", e))?;

    match &result {
        Ok(color) => eprintln!("[TestColor] Success: {}", color),
        Err(e) => eprintln!("[TestColor] Failed: {}", e),
    }

    result.map_err(|e| format!("Failed to get color: {}", e))
}

#[tauri::command]
pub async fn execute_workflow_graph<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AutomatorState>,
    graph: WorkflowGraph
) -> Result<(), String> {
    if state.is_running.load(Ordering::SeqCst) {
        return Err("Already running".into());
    }

    state.is_running.store(true, Ordering::SeqCst);
    let _ = app.emit("automator:status", true);

    run_graph_task(app, graph, state.is_running.clone());

    Ok(())
}
