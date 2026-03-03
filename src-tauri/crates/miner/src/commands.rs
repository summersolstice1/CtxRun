use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Runtime, State};

use crate::core::queue::run_crawl_task;
use crate::error::{MinerError, Result};
use crate::models::MinerConfig;

// 维护爬虫的运行状态，以便我们可以通过命令停止它
pub struct MinerState {
    pub is_running: Arc<AtomicBool>,
}

impl MinerState {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[tauri::command]
pub async fn start_mining<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, MinerState>,
    config: MinerConfig,
) -> Result<String> {
    // 防止重复启动
    if state.is_running.load(Ordering::SeqCst) {
        return Err(MinerError::SystemError(
            "Mining is already in progress.".into(),
        ));
    }

    state.is_running.store(true, Ordering::SeqCst);
    let is_running_clone = state.is_running.clone();

    // 开启独立的后台线程执行爬取，防止阻塞 Tauri 主线程
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_crawl_task(app, config, is_running_clone).await {
            eprintln!("[Miner] Fatal error in crawl task: {}", e);
        }
    });

    Ok("Task queued".into())
}

#[tauri::command]
pub async fn stop_mining(state: State<'_, MinerState>) -> Result<()> {
    // 将状态设为 false，queue.rs 中的 while 循环检测到后会优雅中断
    state.is_running.store(false, Ordering::SeqCst);
    Ok(())
}
