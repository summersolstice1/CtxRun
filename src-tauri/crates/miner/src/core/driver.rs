// src-tauri/crates/miner/src/core/driver.rs

use headless_chrome::{Browser, LaunchOptions, Tab};
use std::sync::Arc;
use std::ffi::OsStr;
use crate::error::{MinerError, Result};
use crate::models::PageResult;
use super::extractor::extract_page;

pub struct MinerDriver {
    // 只有在调用 MinerDriver::new() 时，浏览器进程才会被启动
    browser: Browser,
}

impl MinerDriver {
    /// 初始化无头浏览器
    pub fn new() -> Result<Self> {
        let mut launch_options = LaunchOptions::default();
        launch_options.headless = true; // 后台隐式运行
        launch_options.window_size = Some((1280, 800));
        launch_options.idle_browser_timeout = std::time::Duration::from_secs(60);

        // 使用系统临时目录，任务结束一段时间后系统会自动清理
        let temp_dir = std::env::temp_dir().join("ctxrun_miner_tmp");
        launch_options.user_data_dir = Some(temp_dir);

        // 禁用多余功能，减少启动时的资源负载
        launch_options.args = vec![
            "--no-sandbox",
            "--disable-extensions",
            "--disable-gpu",
            "--mute-audio",
            "--no-first-run",
            "--disable-notifications",
        ].into_iter().map(|s| OsStr::new(s)).collect::<Vec<_>>();

        // 只有在这里才真正消耗系统资源启动浏览器
        let browser = Browser::new(launch_options)
            .map_err(|e| MinerError::BrowserError(format!("Failed to launch browser: {}", e)))?;

        Ok(Self { browser })
    }

    /// 获取或创建 Tab
    pub fn get_tab(&self) -> Result<Arc<Tab>> {
        self.browser.new_tab()
            .map_err(|e| MinerError::BrowserError(format!("Failed to create tab: {}", e)))
    }

    /// 处理单个 URL
    pub fn process_url(&self, url: &str) -> Result<PageResult> {
        let tab = self.get_tab()?;
        extract_page(&tab, url)
    }
}

// 当 MinerDriver 被释放时，Browser 也会被释放
// Browser 被释放会自动向 Chrome 发送退出指令，进程关闭
