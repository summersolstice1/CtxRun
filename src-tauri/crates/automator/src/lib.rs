use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime, AppHandle, Emitter // 引入 Emitter
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

// [新增] 公开给 Rust 主进程调用的切换函数
pub fn toggle<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AutomatorState>();

    // 1. 如果正在运行，则停止
    if state.is_running.load(Ordering::SeqCst) {
        state.is_running.store(false, Ordering::SeqCst);
        let _ = app.emit("automator:status", false);
        return;
    }

    // 2. 如果未运行，则从磁盘读取配置并启动
    // 前端 Zustand 保存的文件通常在 AppLocalData/automator-config.json
    if let Ok(app_dir) = app.path().app_local_data_dir() {
        let config_path = app_dir.join("automator-config.json");

        // 尝试读取并解析配置
        if let Ok(content) = fs::read_to_string(config_path) {
            if let Ok(store_data) = serde_json::from_str::<AutomatorStoreRoot>(&content) {
                let config = store_data.state.config;

                // 设置状态为运行中
                state.is_running.store(true, Ordering::SeqCst);
                let _ = app.emit("automator:status", true); // 通知前端（如果活着）
                let _ = app.emit("automator:count", 0);

                // 启动引擎
                engine::run_clicker_task(app.clone(), config, state.is_running.clone());
            } else {
                eprintln!("[Automator] Failed to parse config json.");
            }
        } else {
            eprintln!("[Automator] Config file not found. Ensure frontend has saved settings.");
        }
    }
}
