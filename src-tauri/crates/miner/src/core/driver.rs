use headless_chrome::{Browser, LaunchOptions, Tab};
use std::sync::Arc;
use std::ffi::OsStr;
use ctxrun_browser_utils::{locate_browser, BrowserType};
use crate::error::{MinerError, Result};

/// 浏览器驱动器（工厂模式），负责管理浏览器生命周期并派生 Tab
pub struct MinerDriver {
    browser: Browser,
}

impl MinerDriver {
    pub fn new() -> Result<Self> {
        let mut launch_options = LaunchOptions::default();

        // 1. 调用公共组件，探测系统现有的浏览器
        let browser_path = locate_browser(BrowserType::Any)
            .ok_or_else(|| MinerError::BrowserError("未检测到本地 Chrome 或 Edge 浏览器".into()))?;

        println!("[Miner] 复用本地浏览器: {:?}", browser_path);
        launch_options.path = Some(browser_path);

        // 2. 基础无头配置
        launch_options.headless = true;
        launch_options.window_size = Some((1920, 1080));
        launch_options.idle_browser_timeout = std::time::Duration::from_secs(60);

        let temp_dir = std::env::temp_dir().join("ctxrun_miner_tmp");
        launch_options.user_data_dir = Some(temp_dir);

        // 3. 性能优化：禁用图片/字体加载，提速渲染
        launch_options.args = vec![
            "--no-sandbox",
            "--disable-extensions",
            "--disable-gpu",
            "--mute-audio",
            "--no-first-run",
            "--disable-notifications",
            "--disable-infobars",
            "--disable-popup-blocking",
            "--blink-settings=imagesEnabled=false",
            "--disable-remote-fonts",
            "--disable-web-security",
            "--disable-features=IsolateOrigins,site-per-process",
        ].into_iter().map(OsStr::new).collect::<Vec<_>>();

        let browser = Browser::new(launch_options)
            .map_err(|e| MinerError::BrowserError(format!("Failed to launch browser: {}", e)))?;

        Ok(Self { browser })
    }

    /// 派生独立的 Tab 用于并发抓取
    pub fn new_tab(&self) -> Result<Arc<Tab>> {
        self.browser.new_tab()
            .map_err(|e| MinerError::BrowserError(format!("Failed to create tab: {}", e)))
    }
}
