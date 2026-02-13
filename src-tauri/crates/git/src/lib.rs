use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

pub mod models;
pub mod commands;
pub mod export;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("ctxrun-plugin-git")
        .invoke_handler(tauri::generate_handler![
            commands::get_git_commits,
            commands::get_git_diff,
            commands::get_git_diff_text,
            commands::export_git_diff,
        ])
        .build()
}