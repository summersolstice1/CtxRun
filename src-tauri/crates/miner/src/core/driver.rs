// src-tauri/crates/miner/src/core/driver.rs

use headless_chrome::{Browser, LaunchOptions, Tab};
use std::sync::Arc;
use std::ffi::OsStr;
use crate::error::{MinerError, Result};
use crate::models::PageResult;
use super::extractor::extract_page;

pub struct MinerDriver {
    // 保持 Browser 的引用以维持进程存活
    _browser: Browser,
    // 我们全程只复用这就一个 Tab
    tab: Arc<Tab>,
}

impl MinerDriver {
    /// 初始化无头浏览器
    pub fn new() -> Result<Self> {
        let mut launch_options = LaunchOptions::default();

        // 确保真的是 Headless，这样就不会弹窗了
        launch_options.headless = true;

        // 设定一个合理的窗口大小，防止响应式布局导致某些元素被隐藏
        launch_options.window_size = Some((1920, 1080));

        launch_options.idle_browser_timeout = std::time::Duration::from_secs(60);

        // 使用系统临时目录
        let temp_dir = std::env::temp_dir().join("ctxrun_miner_tmp");
        launch_options.user_data_dir = Some(temp_dir);

        // 禁用多余功能，优化性能
        launch_options.args = vec![
            "--no-sandbox",
            "--disable-extensions",
            "--disable-gpu",
            "--mute-audio",
            "--no-first-run",
            "--disable-notifications",
            "--disable-infobars",
            "--disable-popup-blocking",
        ].into_iter().map(|s| OsStr::new(s)).collect::<Vec<_>>();

        let browser = Browser::new(launch_options)
            .map_err(|e| MinerError::BrowserError(format!("Failed to launch browser: {}", e)))?;

        // 核心修复：只获取第一个 Tab（或者新建一个），之后全程复用它
        let tab = browser.new_tab()
            .map_err(|e| MinerError::BrowserError(format!("Failed to create initial tab: {}", e)))?;

        Ok(Self {
            _browser: browser,
            tab
        })
    }

    /// 处理单个 URL (复用同一个 Tab)
    pub fn process_url(&self, url: &str) -> Result<PageResult> {
        // 直接传递 self.tab，不再 new_tab
        extract_page(&self.tab, url)
    }
}

// 当 MinerDriver 被释放时，Browser 也会被释放
// Browser 被释放会自动向 Chrome 发送退出指令，进程关闭
