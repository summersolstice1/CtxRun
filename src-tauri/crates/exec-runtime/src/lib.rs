use tauri::{
    Manager, Runtime,
    plugin::{Builder, TauriPlugin},
};

pub mod commands;
mod manager;
pub mod models;
mod safety;
mod utils;

pub type Result<T> = std::result::Result<T, String>;
pub use manager::ExecRuntime;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("ctxrun-plugin-exec-runtime")
        .invoke_handler(tauri::generate_handler![
            commands::request_exec,
            commands::approve_exec,
            commands::write_exec,
            commands::resize_exec,
            commands::terminate_exec,
        ])
        .setup(|app, _api| {
            app.manage(ExecRuntime::default());
            Ok(())
        })
        .build()
}
