use tauri::{State, AppHandle, Emitter, Runtime};
use std::sync::atomic::Ordering;
use crate::engine::{AutomatorState, run_workflow_task, run_graph_task};
use crate::models::{Workflow, WorkflowGraph};

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
    #[cfg(target_os = "windows")]
    unsafe {
        use windows::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC};

        let hdc = GetDC(None);
        if hdc.is_invalid() {
            return Err("Failed to get device context".into());
        }
        let color = GetPixel(hdc, x, y);
        let _ = ReleaseDC(None, hdc);

        // COLORREF 是一个 struct wrapping u32，需要访问 .0
        let color_value = color.0;
        let r = (color_value & 0x000000FF) as u8;
        let g = ((color_value & 0x0000FF00) >> 8) as u8;
        let b = ((color_value & 0x00FF0000) >> 16) as u8;

        Ok(format!("#{:02X}{:02X}{:02X}", r, g, b))
    }
    #[cfg(not(target_os = "windows"))]
    Err("目前仅支持 Windows 颜色采集".into())
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
