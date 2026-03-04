use ctxrun_db::{AppEntry, DbState};
use std::path::Path;
use tauri::State;

#[cfg(target_os = "windows")]
use walkdir::WalkDir;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// 启动浏览器并开启调试端口（用于 CDP 自动化）
#[tauri::command]
pub async fn launch_browser(
    browser: String,
    url: Option<String>,
    use_temp_profile: bool,
) -> crate::error::Result<()> {
    let is_edge = browser.to_lowercase() == "edge";
    ctxrun_plugin_automator::browser::launch_debug_browser(is_edge, url, use_temp_profile)?;
    Ok(())
}

#[tauri::command]
pub async fn refresh_apps(state: State<'_, DbState>) -> crate::error::Result<String> {
    let items = tauri::async_runtime::spawn_blocking(move || -> Vec<AppEntry> { scan_system() })
        .await
        .map_err(|e| e.to_string())?;

    let count = items.len();

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    ctxrun_db::apps::sync_scanned_apps(&conn, items).map_err(|e| e.to_string())?;

    Ok(format!("Scanned {} applications", count))
}

#[tauri::command]
pub async fn open_app(path: String, state: State<'_, DbState>) -> crate::error::Result<()> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(&["/C", "start", "", &path])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| format!("Failed to launch: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to launch: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to launch: {}", e))?;
    }

    let _ = ctxrun_db::apps::record_app_usage(state, path);

    Ok(())
}

fn scan_system() -> Vec<AppEntry> {
    let mut apps = Vec::new();

    #[cfg(target_os = "windows")]
    {
        let start_menu_common = r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs";
        let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
        let start_menu_user = format!(
            r"{}\AppData\Roaming\Microsoft\Windows\Start Menu\Programs",
            user_profile
        );

        let dirs = vec![start_menu_common, &start_menu_user];

        let ignored_dir_names = vec![
            "Windows Kits",
            "Administrative Tools",
            "Accessibility",
            "Accessories",
            "System Tools",
            "Maintenance",
            "Startup",
            "PowerShell",
            "Driver",
        ];

        let ignored_keywords = vec![
            "uninstall",
            "卸载",
            "remove",
            "help",
            "帮助",
            "documentation",
            "manual",
            "guide",
            "faq",
            "说明",
            "readme",
            "notes",
            "config",
            "配置",
            "setting",
            "设置",
            "setup",
            "install",
            "update",
            "updater",
            "升级",
            "url",
            "website",
            "homepage",
            "link",
            "网站",
            "主页",
            "license",
            "agreement",
            "协议",
            "console",
            "command prompt",
            "powershell",
            "debug",
            "diagnostic",
            "feedback",
            "report",
            "recovery",
            "safe mode",
        ];

        for dir in dirs {
            if Path::new(dir).exists() {
                for entry in WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
                    let path = entry.path();
                    let path_str = path.to_string_lossy().to_lowercase();

                    if path.extension().map_or(false, |ext| ext == "lnk") {
                        let in_ignored_dir = ignored_dir_names.iter().any(|&d| {
                            let pattern = format!("\\{}", d.to_lowercase());
                            path_str.contains(&pattern)
                        });

                        if in_ignored_dir {
                            continue;
                        }

                        let name = path.file_stem().unwrap().to_string_lossy().to_string();
                        let lower_name = name.to_lowercase();

                        let has_ignored_keyword =
                            ignored_keywords.iter().any(|&k| lower_name.contains(k));
                        if has_ignored_keyword {
                            continue;
                        }

                        apps.push(AppEntry {
                            name,
                            path: path.to_string_lossy().to_string(),
                            icon: None,
                            usage_count: 0,
                        });
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let dirs = vec![
            "/Applications",
            "/System/Applications",
            "/System/Applications/Utilities",
        ];
        let user_app = std::env::var("HOME")
            .ok()
            .map(|h| format!("{}/Applications", h));

        let mut search_dirs = dirs.clone();
        if let Some(ref ua) = user_app {
            search_dirs.push(ua);
        }

        for dir in search_dirs {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map_or(false, |ext| ext == "app") {
                        let name = path.file_stem().unwrap().to_string_lossy().to_string();

                        let lower = name.to_lowercase();
                        if lower.contains("uninstall") {
                            continue;
                        }

                        apps.push(AppEntry {
                            name,
                            path: path.to_string_lossy().to_string(),
                            icon: None,
                            usage_count: 0,
                        });
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let dirs = vec!["/usr/share/applications", "/usr/local/share/applications"];
        let home_desktop = std::env::var("HOME")
            .ok()
            .map(|h| format!("{}/.local/share/applications", h));

        let mut all_dirs = dirs.clone();
        if let Some(ref hd) = home_desktop {
            all_dirs.push(hd.as_str());
        }

        for dir in all_dirs {
            if Path::new(dir).exists() {
                if let Ok(entries) = std::fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().map_or(false, |ext| ext == "desktop") {
                            let name = path.file_stem().unwrap().to_string_lossy().to_string();
                            apps.push(AppEntry {
                                name,
                                path: path.to_string_lossy().to_string(),
                                icon: None,
                                usage_count: 0,
                            });
                        }
                    }
                }
            }
        }
    }

    apps.sort_by(|a, b| a.path.cmp(&b.path));
    apps.dedup_by(|a, b| a.path == b.path);

    apps
}
