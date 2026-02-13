use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

pub mod core;
pub mod processing;
pub mod tokenizer;
pub mod commands;
pub mod gitleaks;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("ctxrun-plugin-context") 
        .invoke_handler(tauri::generate_handler![
            commands::calculate_context_stats,
            commands::get_context_content,
            commands::copy_context_to_clipboard,
            commands::save_context_to_file,
            commands::has_ignore_files,
            commands::get_ignored_by_protocol,
            commands::scan_for_secrets,
        ])
        .build()
}