const COMMANDS: &[&str] = &[
    "calculate_context_stats",
    "get_context_content",
    "copy_context_to_clipboard",
    "save_context_to_file",
    "has_ignore_files",
    "get_ignored_by_protocol",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}