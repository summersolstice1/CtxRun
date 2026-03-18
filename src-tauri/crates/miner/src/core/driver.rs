use crate::error::{MinerError, Result};
use chromiumoxide::{Browser, BrowserConfig, Page};
use ctxrun_browser_utils::{
    launch_debug_browser as launch_debug_browser_shared, locate_browser, BrowserType,
};
use futures::StreamExt;
use std::path::PathBuf;
use std::time::Duration;
use tauri::async_runtime::JoinHandle;

const BROWSER_LAUNCH_RETRIES: usize = 3;
const BROWSER_LAUNCH_RETRY_DELAY_MS: u64 = 400;
const HANDLER_SHUTDOWN_TIMEOUT_SECS: u64 = 3;
const SEARCH_DEBUG_PORT: u16 = 9222;
const SEARCH_DEBUG_CONNECT_RETRIES: usize = 5;
const SEARCH_DEBUG_CONNECT_RETRY_MS: u64 = 250;

#[derive(Debug, Clone, Copy, Default)]
pub struct DriverLaunchOptions {
    pub anti_bot_mode: bool,
}

fn build_direct_launch_config(browser_path: &PathBuf) -> Result<BrowserConfig> {
    let temp_dir = std::env::temp_dir().join("ctxrun_miner_tmp");
    BrowserConfig::builder()
        .chrome_executable(browser_path)
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
        .map_err(|e| MinerError::BrowserError(format!("Failed to build browser config: {}", e)))
}

/// 浏览器驱动器（工厂模式），负责管理浏览器生命周期并派生 Page
pub struct MinerDriver {
    browser: Browser,
    handler_task: Option<JoinHandle<()>>,
    owns_browser: bool,
}

impl MinerDriver {
    pub async fn new() -> Result<Self> {
        Self::new_with_options(DriverLaunchOptions::default()).await
    }

    pub async fn new_for_search(anti_bot_mode: bool) -> Result<Self> {
        Self::new_with_options(DriverLaunchOptions { anti_bot_mode }).await
    }

    async fn new_with_options(options: DriverLaunchOptions) -> Result<Self> {
        let (browser, mut handler, owns_browser) = if options.anti_bot_mode {
            launch_debug_browser_shared(BrowserType::Chrome, SEARCH_DEBUG_PORT, None, false)
                .map_err(|err| MinerError::BrowserError(err.to_string()))?;
            let debug_url = format!("http://127.0.0.1:{SEARCH_DEBUG_PORT}");

            let mut connect_result = None;
            let mut last_error = String::new();
            for attempt in 1..=SEARCH_DEBUG_CONNECT_RETRIES {
                match Browser::connect(debug_url.clone()).await {
                    Ok((browser, handler)) => {
                        connect_result = Some((browser, handler));
                        break;
                    }
                    Err(err) => {
                        last_error = err.to_string();
                        if attempt < SEARCH_DEBUG_CONNECT_RETRIES {
                            tokio::time::sleep(Duration::from_millis(
                                SEARCH_DEBUG_CONNECT_RETRY_MS,
                            ))
                            .await;
                        }
                    }
                }
            }

            let (browser, handler) = connect_result.ok_or_else(|| {
                MinerError::BrowserError(format!(
                    "Failed to connect debug browser on port {} after {} attempts: {}",
                    SEARCH_DEBUG_PORT, SEARCH_DEBUG_CONNECT_RETRIES, last_error
                ))
            })?;
            (browser, handler, true)
        } else {
            let browser_path = locate_browser(BrowserType::Any).ok_or_else(|| {
                MinerError::BrowserError("未检测到本地 Chrome 或 Edge 浏览器".into())
            })?;
            println!("[Miner] 复用本地浏览器: {:?}", browser_path);

            let config = build_direct_launch_config(&browser_path)?;
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
                            tokio::time::sleep(Duration::from_millis(
                                BROWSER_LAUNCH_RETRY_DELAY_MS,
                            ))
                            .await;
                        }
                    }
                }
            }

            let (browser, handler) = launch_result.ok_or_else(|| {
                MinerError::BrowserError(format!(
                    "Failed to launch browser after {} attempts: {}",
                    BROWSER_LAUNCH_RETRIES, last_error
                ))
            })?;
            (browser, handler, true)
        };

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
            owns_browser,
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
        if self.owns_browser {
            if let Err(e) = self.browser.close().await {
                eprintln!("[Miner] Browser close failed: {}", e);
            }

            if let Err(e) = self.browser.wait().await {
                eprintln!("[Miner] Browser wait failed: {}", e);
            }
        }

        if let Some(mut task) = self.handler_task.take()
            && tokio::time::timeout(
                Duration::from_secs(HANDLER_SHUTDOWN_TIMEOUT_SECS),
                &mut task,
            )
            .await
            .is_err()
        {
            task.abort();
            let _ = task.await;
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
