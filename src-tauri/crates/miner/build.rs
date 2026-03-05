const COMMANDS: &[&str] = &[
    "start_mining",
    "stop_mining",
    "extract_single_page",
    "search_web",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
