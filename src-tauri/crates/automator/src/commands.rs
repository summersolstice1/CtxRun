use tauri::{State, AppHandle, Emitter, Runtime};
use std::sync::atomic::Ordering;
use crate::engine::{AutomatorState, run_workflow_task, run_graph_task};
use crate::models::{Workflow, WorkflowGraph};
use crate::screen;
use crate::error::{AutomatorError, Result};
use crate::inspector::PickedElement;
use crate::cdp::CdpSession;

#[tauri::command]
pub async fn execute_workflow<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AutomatorState>,
    workflow: Workflow
) -> Result<()> {
    if state.is_running.load(Ordering::SeqCst) {
        return Err(AutomatorError::AlreadyRunning);
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
) -> Result<()> {
    state.is_running.store(false, Ordering::SeqCst);
    let _ = app.emit("automator:status", false);
    Ok(())
}

#[tauri::command]
pub async fn get_mouse_position() -> Result<(i32, i32)> {
    use enigo::{Enigo, Mouse, Settings};
    let enigo = Enigo::new(&Settings::default())
        .map_err(|e| AutomatorError::InputError(e.to_string()))?;
    let (x, y) = enigo.location()
        .map_err(|e| AutomatorError::InputError(e.to_string()))?;
    Ok((x, y))
}

#[tauri::command]
pub async fn get_pixel_color(x: i32, y: i32) -> Result<String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        screen::get_color_at(x, y)
    }).await
    .map_err(|e| AutomatorError::JoinError(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn execute_workflow_graph<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AutomatorState>,
    graph: WorkflowGraph
) -> Result<()> {
    if state.is_running.load(Ordering::SeqCst) {
        return Err(AutomatorError::AlreadyRunning);
    }

    state.is_running.store(true, Ordering::SeqCst);
    let _ = app.emit("automator:status", true);

    run_graph_task(app, graph, state.is_running.clone());

    Ok(())
}

// 新增：智能拾取命令
#[tauri::command]
pub async fn get_element_under_cursor() -> Result<PickedElement> {
    // UIAutomation 涉及 COM 调用，必须丢进 spawn_blocking 避免阻塞异步运行时
    tauri::async_runtime::spawn_blocking(|| {
        crate::inspector::get_element_under_cursor_impl()
    })
    .await
    .map_err(|e| AutomatorError::JoinError(e.to_string()))?
}

// 新增：Web 元素拾取命令
#[tauri::command]
pub async fn pick_web_selector() -> Result<String> {
    // 1. 连接浏览器 (默认端口 9222)
    // 这里我们不传 url_filter，默认连当前最活跃的 Tab
    let mut session = CdpSession::connect(9222, None).await
        .map_err(|e| AutomatorError::CdpConnectionError(e.to_string()))?;

    // 2. 启动拾取流程 (这是阻塞的，直到用户点击)
    let selector = session.pick_element().await
        .map_err(|e| AutomatorError::CdpProtocolError(e.to_string()))?;

    Ok(selector)
}
