use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BrowserType {
    Chrome,
    Edge,
    /// 自动探测，优先 Chrome，其次 Edge
    Any,
}

/// 智能探测本地 Chromium 内核浏览器路径
pub fn locate_browser(browser_type: BrowserType) -> Option<PathBuf> {
    // 对于 Any 类型，按照优先级顺序查找（Chrome > Edge）
    if browser_type == BrowserType::Any {
        if let Some(path) = locate_browser(BrowserType::Chrome) {
            return Some(path);
        }
        return locate_browser(BrowserType::Edge);
    }

    let mut paths = Vec::new();

    #[cfg(target_os = "windows")]
    {
        let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string());
        let program_files_x86 = std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| r"C:\Program Files (x86)".to_string());
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();

        if browser_type == BrowserType::Chrome {
            // 优先检查标准安装路径
            paths.push(PathBuf::from(&program_files).join(r"Google\Chrome\Application\chrome.exe"));
            paths.push(PathBuf::from(&program_files_x86).join(r"Google\Chrome\Application\chrome.exe"));
            if !local_app_data.is_empty() {
                paths.push(PathBuf::from(&local_app_data).join(r"Google\Chrome\Application\chrome.exe"));
            }
            // 兜底：尝试 PATH 中的 chrome（用户可能手动添加）
            if let Ok(p) = which::which("chrome") { paths.push(p); }
        }

        if browser_type == BrowserType::Edge {
            paths.push(PathBuf::from(&program_files).join(r"Microsoft\Edge\Application\msedge.exe"));
            paths.push(PathBuf::from(&program_files_x86).join(r"Microsoft\Edge\Application\msedge.exe"));
            // 兜底：尝试 PATH 中的 msedge
            if let Ok(p) = which::which("msedge") { paths.push(p); }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if browser_type == BrowserType::Chrome {
            paths.push(PathBuf::from("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"));
            // 兜底：尝试 PATH 中的
            if let Ok(p) = which::which("Google Chrome") { paths.push(p); }
        }
        if browser_type == BrowserType::Edge {
            paths.push(PathBuf::from("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"));
            // 兜底：尝试 PATH 中的
            if let Ok(p) = which::which("Microsoft Edge") { paths.push(p); }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if browser_type == BrowserType::Chrome {
            if let Ok(p) = which::which("google-chrome") { paths.push(p); }
            if let Ok(p) = which::which("google-chrome-stable") { paths.push(p); }
            if let Ok(p) = which::which("chromium") { paths.push(p); }
            if let Ok(p) = which::which("chromium-browser") { paths.push(p); }
        }
        if browser_type == BrowserType::Edge {
            if let Ok(p) = which::which("microsoft-edge") { paths.push(p); }
            if let Ok(p) = which::which("microsoft-edge-stable") { paths.push(p); }
        }
    }

    // 返回第一个存在的路径
    paths.into_iter().find(|p| p.exists())
}

/// 查找系统中所有可用的浏览器
/// 返回 Vec<(BrowserType, PathBuf)>，按优先级排序（Chrome > Edge）
pub fn locate_all_browsers() -> Vec<(BrowserType, PathBuf)> {
    let mut result = Vec::new();

    // 优先 Chrome
    if let Some(path) = locate_browser(BrowserType::Chrome) {
        result.push((BrowserType::Chrome, path));
    }

    // 其次 Edge
    if let Some(path) = locate_browser(BrowserType::Edge) {
        result.push((BrowserType::Edge, path));
    }

    result
}
