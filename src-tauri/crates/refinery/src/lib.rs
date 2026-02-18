use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;

pub mod models;
pub mod storage;
pub mod worker;
pub mod commands;
pub mod cleanup_worker;
pub mod error;

pub use error::{RefineryError, Result};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("ctxrun-plugin-refinery")
        .invoke_handler(tauri::generate_handler![
            commands::get_refinery_history,
            commands::get_refinery_item_detail,
            commands::get_refinery_statistics,
            commands::toggle_refinery_pin,
            commands::delete_refinery_items,
            commands::clear_refinery_history,
            commands::copy_refinery_text,
            commands::copy_refinery_image,
            commands::create_note,
            commands::update_note,
            commands::spotlight_paste,
            commands::update_cleanup_config,
            commands::manual_cleanup,
        ])
        .setup(|app, _api| {
            let cleanup_config = Arc::new(TokioMutex::new(
                cleanup_worker::RefineryCleanupConfig::default()
            ));
            
            app.manage(commands::CleanupConfigState(cleanup_config.clone()));
            
            let (cleanup_worker, cleanup_sender) = cleanup_worker::CleanupWorker::new(cleanup_config);
            
            // 修复点：直接克隆 AppHandle
            tauri::async_runtime::spawn(cleanup_worker.run(app.clone()));
            worker::init_listener(app.clone(), Some(cleanup_sender));

            Ok(())
        })
        .build()
}