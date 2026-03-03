use crate::browser::TabSession;
use crate::engine::{AutomatorState, run_graph_task, run_workflow_task};
use crate::error::{AutomatorError, Result};
use crate::inspector::PickedElement;
use crate::models::{Workflow, WorkflowGraph};
use crate::screen;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Runtime, State};

#[tauri::command]
pub async fn execute_workflow<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AutomatorState>,
    workflow: Workflow,
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
    state: State<'_, AutomatorState>,
) -> Result<()> {
    state.is_running.store(false, Ordering::SeqCst);
    let _ = app.emit("automator:status", false);
    Ok(())
}

#[tauri::command]
pub async fn get_mouse_position() -> Result<(i32, i32)> {
    use enigo::{Enigo, Mouse, Settings};
    let enigo =
        Enigo::new(&Settings::default()).map_err(|e| AutomatorError::InputError(e.to_string()))?;
    let (x, y) = enigo
        .location()
        .map_err(|e| AutomatorError::InputError(e.to_string()))?;
    Ok((x, y))
}

#[tauri::command]
pub async fn get_pixel_color(x: i32, y: i32) -> Result<String> {
    let result = tauri::async_runtime::spawn_blocking(move || screen::get_color_at(x, y))
        .await
        .map_err(|e| AutomatorError::JoinError(e.to_string()))??;

    Ok(result)
}

#[tauri::command]
pub async fn execute_workflow_graph<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AutomatorState>,
    graph: WorkflowGraph,
) -> Result<()> {
    if state.is_running.load(Ordering::SeqCst) {
        return Err(AutomatorError::AlreadyRunning);
    }

    state.is_running.store(true, Ordering::SeqCst);
    let _ = app.emit("automator:status", true);

    run_graph_task(app, graph, state.is_running.clone());

    Ok(())
}

#[tauri::command]
pub async fn get_element_under_cursor() -> Result<PickedElement> {
    tauri::async_runtime::spawn_blocking(|| crate::inspector::get_element_under_cursor_impl())
        .await
        .map_err(|e| AutomatorError::JoinError(e.to_string()))?
}

#[tauri::command]
pub async fn pick_web_selector() -> Result<String> {
    let session = TabSession::connect_and_find(None).await?;
    session.pick_element().await
}
