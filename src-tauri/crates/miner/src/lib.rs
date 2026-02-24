use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub mod models;
pub mod error;
pub mod commands;
pub mod core;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("ctxrun-plugin-miner")
        .invoke_handler(tauri::generate_handler![
            commands::start_mining,
            commands::stop_mining
        ])
        .setup(|app, _api| {
            // 注册全局状态
            app.manage(commands::MinerState::new());
            Ok(())
        })
        .build()
}
