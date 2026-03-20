#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::fs;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};
use tauri::window::Color;
use tauri::{
    AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
};
use tokio::time::sleep;
#[cfg(target_os = "windows")]
use windows::Win32::System::Threading::CREATE_NO_WINDOW;

use ctxrun_db as db;
mod agent_tools;
mod apps;
mod error;
mod monitor;
mod shortcuts;

const MAIN_WINDOW_LABEL: &str = "main";

fn ensure_main_window(app: &AppHandle) {
    match app.get_webview_window(MAIN_WINDOW_LABEL) {
        Some(window) => {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
        _ => {
            let window_builder = WebviewWindowBuilder::new(
                app,
                MAIN_WINDOW_LABEL,
                WebviewUrl::App("index.html".into()),
            )
            .title("CtxRun")
            .inner_size(800.0, 600.0)
            .background_color(Color(0, 0, 0, 0))
            .center()
            .decorations(false)
            .resizable(true)
            .visible(true);

            if let Ok(w) = window_builder.build() {
                let _ = w.set_focus();
            }
        }
    }
}

#[tauri::command]
async fn hide_main_window(
    app: AppHandle,
    window: WebviewWindow,
    delay_secs: u64,
) -> crate::error::Result<()> {
    window.hide().map_err(|e| e.to_string())?;

    if delay_secs == 0 {
        return Ok(());
    }

    let app_handle = app.clone();
    let window_label = window.label().to_string();

    tauri::async_runtime::spawn(async move {
        sleep(Duration::from_secs(delay_secs)).await;

        if let Some(w) = app_handle.get_webview_window(&window_label) {
            let is_visible = w.is_visible().unwrap_or(true);

            if !is_visible {
                let _ = w.close();
            }
        }
    });

    Ok(())
}

#[derive(serde::Serialize)]
struct SystemInfo {
    cpu_usage: f64,
    memory_usage: u64,
    memory_total: u64,
    memory_available: u64,
    uptime: u64,
}

#[tauri::command]
fn get_file_size(path: String) -> u64 {
    match fs::metadata(path) {
        Ok(meta) => meta.len(),
        Err(_) => 0,
    }
}

#[tauri::command]
fn get_system_info(system: State<'_, Arc<Mutex<System>>>) -> SystemInfo {
    let mut sys = system.lock().unwrap();

    sys.refresh_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::nothing().with_cpu_usage())
            .with_memory(MemoryRefreshKind::nothing()),
    );

    let cpu_usage = sys.global_cpu_usage() as f64;

    let memory_total = sys.total_memory();
    let memory_used = sys.used_memory();
    let memory_available = sys.available_memory();
    let uptime = System::uptime();

    SystemInfo {
        cpu_usage,
        memory_usage: memory_used,
        memory_total,
        memory_available,
        uptime,
    }
}

#[tauri::command]
async fn check_python_env() -> crate::error::Result<String> {
    tauri::async_runtime::spawn_blocking(move || -> crate::error::Result<String> {
        #[cfg(target_os = "windows")]
        let bin = "python";
        #[cfg(not(target_os = "windows"))]
        let bin = "python3";

        let mut cmd = Command::new(bin);
        cmd.arg("--version");
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW.0);
        let output = cmd.output().map_err(|_| "Not Found".to_string())?;

        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if version.is_empty() {
                Ok(String::from_utf8_lossy(&output.stderr).trim().to_string())
            } else {
                Ok(version)
            }
        } else {
            Err("Not Installed".into())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn refresh_shortcuts(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        if let Some(manager) = app.try_state::<shortcuts::ShortcutManager>() {
            manager.refresh(&app);
        }
    });
}

#[tauri::command]
fn open_folder_in_file_manager(path: String) -> crate::error::Result<()> {
    let metadata = fs::metadata(&path).map_err(|e| format!("Failed to access path: {e}"))?;
    if !metadata.is_dir() {
        return Err("Path is not a directory".into());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&path)
            .creation_flags(CREATE_NO_WINDOW.0)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {e}"))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {e}"))?;
    }

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            ensure_main_window(app);
        }))
        .plugin(ctxrun_plugin_automator::init())
        .plugin(ctxrun_plugin_context::init())
        .plugin(ctxrun_plugin_git::init())
        .plugin(ctxrun_plugin_refinery::init())
        .plugin(ctxrun_plugin_miner::init())
        .plugin(ctxrun_plugin_tool_runtime::init())
        .plugin(ctxrun_plugin_exec_runtime::init())
        .register_uri_scheme_protocol(
            "preview",
            ctxrun_hyperview::protocol::preview_protocol_handler,
        )
        .invoke_handler(tauri::generate_handler![
            hide_main_window,
            get_file_size,
            get_system_info,
            check_python_env,
            refresh_shortcuts,
            open_folder_in_file_manager,
            agent_tools::agent_read_local_file,
            agent_tools::agent_list_local_files,
            agent_tools::agent_search_local_files,
            db::prompts::get_prompts,
            db::prompts::search_prompts,
            db::prompts::import_prompt_pack,
            db::prompts::batch_import_local_prompts,
            db::prompts::get_prompt_groups,
            db::prompts::save_prompt,
            db::prompts::delete_prompt,
            db::prompts::toggle_prompt_favorite,
            db::prompts::get_prompt_counts,
            db::prompts::export_prompts_to_csv,
            db::prompts::import_prompts_from_csv,
            db::prompts::get_chat_templates,
            db::url_history::record_url_visit,
            db::url_history::search_url_history,
            db::project_config::get_project_config,
            db::project_config::save_project_config,
            db::project_config::export_project_configs,
            db::project_config::import_project_configs,
            db::secrets::add_ignored_secrets,
            db::secrets::get_ignored_secrets,
            db::secrets::delete_ignored_secret,
            db::apps::search_apps_in_db,
            apps::refresh_apps,
            apps::open_app,
            apps::launch_browser,
            db::shell_history::record_shell_command,
            db::shell_history::get_recent_shell_history,
            db::shell_history::search_shell_history,
            monitor::get_system_metrics,
            monitor::get_top_processes,
            monitor::get_active_ports,
            monitor::kill_process,
            monitor::check_file_locks,
            monitor::get_env_info,
            monitor::diagnose_network,
            monitor::get_ai_context,
            ctxrun_hyperview::get_file_meta,
        ])
        .setup(|app| {
            let system = System::new();
            app.manage(Arc::new(Mutex::new(system)));

            match db::init_db(app.handle()) {
                Ok(conn) => {
                    app.manage(db::DbState {
                        conn: Mutex::new(conn),
                    });
                }
                Err(e) => {
                    panic!(
                        "[Database] Critical Error: Failed to initialize database: {}",
                        e
                    );
                }
            }

            let shortcut_manager = shortcuts::ShortcutManager::new();
            shortcut_manager.refresh(app.handle());
            app.manage(shortcut_manager);

            let quit_i = MenuItem::with_id(app, "quit", "退出/Quit", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(if let Some(icon) = app.default_window_icon() {
                    icon.clone()
                } else {
                    return Err(Box::new(std::io::Error::new(
                        std::io::ErrorKind::NotFound,
                        "No default icon found",
                    )));
                })
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|_app, event| {
                    if event.id().as_ref() == "quit" {
                        std::process::exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        ensure_main_window(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let label = window.label();

                if label == "main" {
                    if window.is_visible().unwrap_or(true) {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                } else if label == "spotlight" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
