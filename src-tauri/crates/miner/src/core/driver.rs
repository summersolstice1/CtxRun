use std::time::Duration;
use chromiumoxide::{Browser, BrowserConfig, Page};
use futures::StreamExt;
use tauri::async_runtime::JoinHandle;
use ctxrun_browser_utils::{locate_browser, BrowserType};
use crate::error::{MinerError, Result};

const BROWSER_LAUNCH_RETRIES: usize = 3;
const BROWSER_LAUNCH_RETRY_DELAY_MS: u64 = 400;
const HANDLER_SHUTDOWN_TIMEOUT_SECS: u64 = 3;

/// 浏览器驱动器（工厂模式），负责管理浏览器生命周期并派生 Page
pub struct MinerDriver {
    browser: Browser,
    handler_task: Option<JoinHandle<()>>,
}

impl MinerDriver {
    pub async fn new() -> Result<Self> {
        // 1. 调用公共组件，探测系统现有的浏览器
        let browser_path = locate_browser(BrowserType::Any)
            .ok_or_else(|| MinerError::BrowserError("未检测到本地 Chrome 或 Edge 浏览器".into()))?;

        println!("[Miner] 复用本地浏览器: {:?}", browser_path);

        let temp_dir = std::env::temp_dir().join("ctxrun_miner_tmp");
        let config = BrowserConfig::builder()
            .chrome_executable(&browser_path)
            .new_headless_mode()
            .window_size(1920, 1080)
            .launch_timeout(Duration::from_secs(20))
            .request_timeout(Duration::from_secs(20))
            .user_data_dir(&temp_dir)
            .no_sandbox()
            .arg("disable-gpu")
            .arg("no-first-run")
            .arg("disable-notifications")
            .arg("disable-infobars")
            .arg("disable-popup-blocking")
            .arg(("blink-settings", "imagesEnabled=false"))
            .arg("disable-remote-fonts")
            .arg("disable-web-security")
            .arg(("disable-features", "IsolateOrigins,site-per-process"))
            .build()
            .map_err(|e| MinerError::BrowserError(format!("Failed to build browser config: {}", e)))?;

        let mut launch_result = None;
        let mut last_error = String::new();
        for attempt in 1..=BROWSER_LAUNCH_RETRIES {
            match Browser::launch(config.clone()).await {
                Ok((browser, handler)) => {
                    launch_result = Some((browser, handler));
                    break;
                }
                Err(e) => {
                    last_error = e.to_string();
                    if attempt < BROWSER_LAUNCH_RETRIES {
                        tokio::time::sleep(Duration::from_millis(BROWSER_LAUNCH_RETRY_DELAY_MS)).await;
                    }
                }
            }
        }

        let (browser, mut handler) = launch_result.ok_or_else(|| {
            MinerError::BrowserError(format!(
                "Failed to launch browser after {} attempts: {}",
                BROWSER_LAUNCH_RETRIES, last_error
            ))
        })?;

        let handler_task = tauri::async_runtime::spawn(async move {
            while let Some(event) = handler.next().await {
                if let Err(err) = event {
                    eprintln!("[Miner] Browser handler stopped: {}", err);
                    break;
                }
            }
        });

        Ok(Self {
            browser,
            handler_task: Some(handler_task),
        })
    }

    /// 派生独立的 Page 用于并发抓取
    pub async fn new_page(&self) -> Result<Page> {
        self.browser
            .new_page("about:blank")
            .await
            .map_err(|e| MinerError::BrowserError(format!("Failed to create page: {}", e)))
    }

    pub async fn shutdown(&mut self) {
        if let Err(e) = self.browser.close().await {
            eprintln!("[Miner] Browser close failed: {}", e);
        }

        if let Err(e) = self.browser.wait().await {
            eprintln!("[Miner] Browser wait failed: {}", e);
        }

        if let Some(mut task) = self.handler_task.take() {
            if tokio::time::timeout(Duration::from_secs(HANDLER_SHUTDOWN_TIMEOUT_SECS), &mut task)
                .await
                .is_err()
            {
                task.abort();
                let _ = task.await;
            }
        }
    }
}

impl Drop for MinerDriver {
    fn drop(&mut self) {
        if let Some(task) = self.handler_task.take() {
            task.abort();
        }
    }
}
