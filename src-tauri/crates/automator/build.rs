const COMMANDS: &[&str] = &[
    "start_clicker",
    "stop_clicker",
    "get_mouse_position"
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}