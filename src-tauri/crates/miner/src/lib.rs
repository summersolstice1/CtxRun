use tauri::{
    Manager, Runtime,
    plugin::{Builder, TauriPlugin},
};

pub mod commands;
pub mod core;
pub mod error;
pub mod models;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("ctxrun-plugin-miner")
        .invoke_handler(tauri::generate_handler![
            commands::start_mining,
            commands::stop_mining,
            commands::extract_single_page
        ])
        .setup(|app, _api| {
            // 注册全局状态
            app.manage(commands::MinerState::new());
            Ok(())
        })
        .build()
}
