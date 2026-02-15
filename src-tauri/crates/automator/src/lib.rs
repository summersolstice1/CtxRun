use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime, AppHandle, Emitter
};
use std::sync::atomic::Ordering;
use std::fs;

pub mod models;
pub mod engine;
pub mod commands;

use engine::AutomatorState;
use models::AutomatorStoreRoot;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("ctxrun-plugin-automator")
        .invoke_handler(tauri::generate_handler![
            commands::execute_workflow,
            commands::stop_workflow,
            commands::get_mouse_position
        ])
        .setup(|app, _api| {
            app.manage(AutomatorState::new());
            Ok(())
        })
        .build()
}

pub fn toggle<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AutomatorState>();

    if state.is_running.load(Ordering::SeqCst) {
        state.is_running.store(false, Ordering::SeqCst);
        let _ = app.emit("automator:status", false);
        return;
    }

    if let Ok(app_dir) = app.path().app_local_data_dir() {
        let config_path = app_dir.join("automator-config.json");

        if let Ok(content) = fs::read_to_string(config_path) {
            if let Ok(store_data) = serde_json::from_str::<AutomatorStoreRoot>(&content) {
                if let Some(workflow) = store_data.state.active_workflow {
                    state.is_running.store(true, Ordering::SeqCst);
                    let _ = app.emit("automator:status", true);

                    engine::run_workflow_task(app.clone(), workflow, state.is_running.clone());
                } else {
                    eprintln!("[Automator] No active workflow found.");
                }
            }
        }
    }
}
