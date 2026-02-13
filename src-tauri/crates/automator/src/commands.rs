use tauri::{State, AppHandle, Emitter, Runtime};
use std::sync::atomic::Ordering;
use crate::engine::{AutomatorState, run_clicker_task};
use crate::models::ClickerConfig;

#[tauri::command]
pub async fn start_clicker<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AutomatorState>,
    config: ClickerConfig
) -> Result<(), String> {
    if state.is_running.load(Ordering::SeqCst) {
        return Ok(());
    }

    state.is_running.store(true, Ordering::SeqCst);

    let _ = app.emit("automator:status", true);

    run_clicker_task(app, config, state.is_running.clone());

    Ok(())
}

#[tauri::command]
pub async fn stop_clicker<R: Runtime>(
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