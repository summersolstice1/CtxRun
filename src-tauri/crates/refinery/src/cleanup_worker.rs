use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Runtime};
use tokio::sync::{Mutex, mpsc};

const SCAN_INTERVAL_SECS: u64 = 3600;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefineryCleanupConfig {
    pub enabled: bool,
    pub strategy: String,
    pub days: Option<u32>,
    pub max_count: Option<u32>,
    pub keep_pinned: bool,
}

impl Default for RefineryCleanupConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            strategy: "count".to_string(),
            days: Some(30),
            max_count: Some(1000),
            keep_pinned: true,
        }
    }
}

pub struct CleanupWorker {
    config: Arc<Mutex<RefineryCleanupConfig>>,
    rx: mpsc::Receiver<()>,
}

impl CleanupWorker {
    pub fn new(config: Arc<Mutex<RefineryCleanupConfig>>) -> (Self, mpsc::Sender<()>) {
        let (tx, rx) = mpsc::channel(100);
        (Self { config, rx }, tx)
    }

    pub async fn run<R: Runtime>(mut self, app: AppHandle<R>) {
        loop {
            tokio::select! {
                Some(_) = self.rx.recv() => {
                    self.check_and_cleanup(&app).await;
                }
                _ = tokio::time::sleep(Duration::from_secs(SCAN_INTERVAL_SECS)) => {
                    self.check_and_cleanup(&app).await;
                }
            }
        }
    }

    async fn check_and_cleanup<R: Runtime>(&self, app: &AppHandle<R>) {
        let config = self.config.lock().await.clone();
        if !config.enabled {
            return;
        }

        match config.strategy.as_str() {
            "count" => {
                if let Some(max_count) = config.max_count
                    && let Err(e) =
                        super::commands::execute_count_cleanup(app, max_count, config.keep_pinned)
                {
                    eprintln!("[Refinery Cleanup] Count cleanup failed: {}", e);
                }
            }
            "time" => {
                if let Some(days) = config.days
                    && let Err(e) =
                        super::commands::execute_time_cleanup(app, days, config.keep_pinned)
                {
                    eprintln!("[Refinery Cleanup] Time cleanup failed: {}", e);
                }
            }
            "both" => {
                let count_triggered = if let Some(max_count) = config.max_count {
                    super::commands::execute_count_cleanup(app, max_count, config.keep_pinned)
                        .unwrap_or(0)
                        > 0
                } else {
                    false
                };

                if !count_triggered && let Some(days) = config.days {
                    let _ = super::commands::execute_time_cleanup(app, days, config.keep_pinned);
                }
            }
            _ => {}
        }
    }
}
