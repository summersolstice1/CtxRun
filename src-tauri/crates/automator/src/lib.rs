use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub mod models;
pub mod engine;
pub mod commands;

use engine::AutomatorState;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("ctxrun-plugin-automator") 
        .invoke_handler(tauri::generate_handler![
            commands::start_clicker,
            commands::stop_clicker,
            commands::get_mouse_position
        ])
        .setup(|app, _api| {
            app.manage(AutomatorState::new());
            Ok(())
        })
        .build()
}