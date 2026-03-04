use std::net::TcpStream;
use std::path::PathBuf;
use std::time::Duration;

pub mod error;
pub use error::{BrowserUtilsError, Result};

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
        let program_files =
            std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string());
        let program_files_x86 = std::env::var("ProgramFiles(x86)")
            .unwrap_or_else(|_| r"C:\Program Files (x86)".to_string());
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();

        if browser_type == BrowserType::Chrome {
            // 优先检查标准安装路径
            paths.push(PathBuf::from(&program_files).join(r"Google\Chrome\Application\chrome.exe"));
            paths.push(
                PathBuf::from(&program_files_x86).join(r"Google\Chrome\Application\chrome.exe"),
            );
            if !local_app_data.is_empty() {
                paths.push(
                    PathBuf::from(&local_app_data).join(r"Google\Chrome\Application\chrome.exe"),
                );
            }
            // 兜底：尝试 PATH 中的 chrome（用户可能手动添加）
            if let Ok(p) = which::which("chrome") {
                paths.push(p);
            }
        }

        if browser_type == BrowserType::Edge {
            paths
                .push(PathBuf::from(&program_files).join(r"Microsoft\Edge\Application\msedge.exe"));
            paths.push(
                PathBuf::from(&program_files_x86).join(r"Microsoft\Edge\Application\msedge.exe"),
            );
            // 兜底：尝试 PATH 中的 msedge
            if let Ok(p) = which::which("msedge") {
                paths.push(p);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if browser_type == BrowserType::Chrome {
            paths.push(PathBuf::from(
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            ));
            // 兜底：尝试 PATH 中的
            if let Ok(p) = which::which("Google Chrome") {
                paths.push(p);
            }
        }
        if browser_type == BrowserType::Edge {
            paths.push(PathBuf::from(
                "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            ));
            // 兜底：尝试 PATH 中的
            if let Ok(p) = which::which("Microsoft Edge") {
                paths.push(p);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if browser_type == BrowserType::Chrome {
            if let Ok(p) = which::which("google-chrome") {
                paths.push(p);
            }
            if let Ok(p) = which::which("google-chrome-stable") {
                paths.push(p);
            }
            if let Ok(p) = which::which("chromium") {
                paths.push(p);
            }
            if let Ok(p) = which::which("chromium-browser") {
                paths.push(p);
            }
        }
        if browser_type == BrowserType::Edge {
            if let Ok(p) = which::which("microsoft-edge") {
                paths.push(p);
            }
            if let Ok(p) = which::which("microsoft-edge-stable") {
                paths.push(p);
            }
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

// ---------------------------------------------------------------------------
// Browser process management utilities
// ---------------------------------------------------------------------------

const APP_ID: &str = "com.ctxrun";

/// Get the Chrome user data directory under app's own data dir.
pub fn app_chrome_data_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
        PathBuf::from(local_app_data)
            .join(APP_ID)
            .join("chrome_user_data")
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        PathBuf::from(home)
            .join("Library/Application Support")
            .join(APP_ID)
            .join("chrome_user_data")
    }
    #[cfg(target_os = "linux")]
    {
        let config = std::env::var("XDG_DATA_HOME").unwrap_or_else(|_| {
            format!("{}/.local/share", std::env::var("HOME").unwrap_or_default())
        });
        PathBuf::from(config).join(APP_ID).join("chrome_user_data")
    }
}

/// Check if a CDP debug port is responding.
pub fn is_debug_port_available(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", port).parse().unwrap(),
        Duration::from_secs(1),
    )
    .is_ok()
}

/// Check if a browser process is running.
pub fn is_browser_running(browser_type: BrowserType) -> bool {
    let name = browser_process_name(browser_type);
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("tasklist")
            .args(["/FI", &format!("IMAGENAME eq {}", name), "/NH"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).contains(name))
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("pgrep")
            .arg("-x")
            .arg(name)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}

/// Kill all running browser processes of the given type.
pub fn kill_browser_processes(browser_type: BrowserType) -> Result<()> {
    let name = browser_process_name(browser_type);
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("taskkill")
            .args(["/F", "/IM", name])
            .output()
            .map_err(|e| BrowserUtilsError::Message(format!("Failed to kill browser: {}", e)))?;
        std::thread::sleep(Duration::from_millis(1000));
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("pkill")
            .arg(name)
            .output()
            .map_err(|e| BrowserUtilsError::Message(format!("Failed to kill browser: {}", e)))?;
        std::thread::sleep(Duration::from_millis(1000));
    }
    Ok(())
}

fn browser_process_name(browser_type: BrowserType) -> &'static str {
    #[cfg(target_os = "windows")]
    {
        match browser_type {
            BrowserType::Edge => "msedge.exe",
            _ => "chrome.exe",
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        match browser_type {
            BrowserType::Edge => "msedge",
            _ => "chrome",
        }
    }
}
