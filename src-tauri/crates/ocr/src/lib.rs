use std::sync::Mutex;

use tauri::{
    Manager, Runtime,
    plugin::{Builder, TauriPlugin},
};

pub mod commands;
pub mod download;
pub mod error;
pub mod models;
pub mod paths;
pub mod service;

use ctxrun_runtime_utils::{BackgroundTaskHandle, PeriodicTaskOptions, spawn_periodic};
use service::OcrService;

pub use error::{OcrServiceError, Result};

pub struct OcrState {
    service: OcrService,
    _idle_reaper: Mutex<BackgroundTaskHandle>,
}

impl OcrState {
    pub fn new() -> Self {
        let service = OcrService::new();
        let reaper_service = service.clone();
        let reaper = spawn_periodic(
            PeriodicTaskOptions::new(service.idle_reaper_interval()),
            move || {
                let reaper_service = reaper_service.clone();
                async move {
                    reaper_service.release_if_idle();
                }
            },
        );

        Self {
            service,
            _idle_reaper: Mutex::new(reaper),
        }
    }

    pub fn service(&self) -> OcrService {
        self.service.clone()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("ctxrun-plugin-ocr")
        .invoke_handler(tauri::generate_handler![
            commands::ocr_get_status,
            commands::ocr_prepare,
            commands::ocr_recognize_file,
            commands::ocr_recognize_bytes,
            commands::ocr_release
        ])
        .setup(|app, _api| {
            app.manage(OcrState::new());
            Ok(())
        })
        .build()
}
