use std::fs::File;
use std::io::Write;
use std::path::Path;
use super::core::{self, ContextStats};
use super::gitleaks::{self, SecretMatch};
use arboard::Clipboard;
use ignore::gitignore::{Gitignore, GitignoreBuilder};
use tauri::{State, Runtime};

#[tauri::command]
pub async fn calculate_context_stats<R: tauri::Runtime>(
    _app: tauri::AppHandle<R>,
    paths: Vec<String>,
    remove_comments: bool
) -> Result<ContextStats, String> {
    let stats = tauri::async_runtime::spawn_blocking(move || {
        core::calculate_stats_parallel(paths, remove_comments)
    }).await.map_err(|e| e.to_string())?;

    Ok(stats)
}

#[tauri::command]
pub async fn get_context_content<R: tauri::Runtime>(
    _app: tauri::AppHandle<R>,
    paths: Vec<String>,
    header: String,
    remove_comments: bool
) -> Result<String, String> {
    let content = tauri::async_runtime::spawn_blocking(move || {
        core::assemble_context_parallel(paths, header, remove_comments)
    }).await.map_err(|e| e.to_string())?;

    Ok(content)
}

#[tauri::command]
pub async fn copy_context_to_clipboard<R: tauri::Runtime>(
    _app: tauri::AppHandle<R>,
    paths: Vec<String>,
    header: String,
    remove_comments: bool
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let content = core::assemble_context_parallel(paths, header, remove_comments);
        let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;

        clipboard.set_text(content).map_err(|e| format!("Clipboard write failed: {}", e))?;
        Ok("Success".to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_context_to_file<R: tauri::Runtime>(
    _app: tauri::AppHandle<R>,
    paths: Vec<String>,
    header: String,
    remove_comments: bool,
    save_path: String
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let content = core::assemble_context_parallel(paths, header, remove_comments);
        let mut file = File::create(save_path).map_err(|e| format!("Failed to create file: {}", e))?;
        file.write_all(content.as_bytes()).map_err(|e| format!("Failed to write file: {}", e))?;
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

/// 探测项目根目录下是否存在任何 ignore 配置文件
#[tauri::command]
pub fn has_ignore_files(project_root: String) -> bool {
    let root = Path::new(&project_root);
    let ignore_files = [".gitignore", ".ctxrunignore", ".npmignore", ".dockerignore"];
    ignore_files.iter().any(|f| root.join(f).exists())
}

/// 批量检查路径是否被项目的 ignore 规则命中
#[tauri::command]
pub fn get_ignored_by_protocol(project_root: String, paths: Vec<String>) -> Vec<String> {
    let root = Path::new(&project_root);
    let mut builder = GitignoreBuilder::new(root);

    // 自动加载标准 ignore 文件
    let ignore_files = [".gitignore", ".ctxrunignore", ".npmignore"];
    for file in ignore_files {
        let path = root.join(file);
        if path.exists() {
            builder.add(path);
        }
    }

    let gitignore = builder.build().unwrap_or(Gitignore::empty());

    paths.into_iter()
        .filter(|p| {
            let path = Path::new(p);
            // gitignore.matched(path, is_dir) 返回的是 PartialMatch
            // 我们检查是否该文件被设置为 ignored
            gitignore.matched(path, path.is_dir()).is_ignore()
        })
        .collect()
}

/// 扫描文本中的敏感信息（密钥、密码等）
#[tauri::command]
pub async fn scan_for_secrets<R: Runtime>(
    state: State<'_, ctxrun_db::DbState>,
    content: String
) -> Result<Vec<SecretMatch>, String> {
    // 1. 获取数据库连接
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // 2. 获取已忽略的白名单 (调用 ctxrun-db 里的方法)
    let ignored_set = ctxrun_db::secrets::get_all_ignored_values_internal(&conn)
        .map_err(|e| e.to_string())?;

    // 3. 执行扫描 (在后台线程运行)
    let matches = tauri::async_runtime::spawn_blocking(move || {
        let raw_matches = gitleaks::scan_text(&content);

        if ignored_set.is_empty() {
            raw_matches
        } else {
            raw_matches.into_iter()
                .filter(|m| !ignored_set.contains(&m.value))
                .collect()
        }
    }).await.map_err(|e| e.to_string())?;

    Ok(matches)
}
