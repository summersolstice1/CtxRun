const COMMANDS: &[&str] = &[
    "calculate_context_stats",
    "get_context_content",
    "copy_context_to_clipboard",
    "save_context_to_file",
    "scan_project_tree",
    "has_ignore_files",
    "get_ignored_by_protocol",
    "scan_for_secrets",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
