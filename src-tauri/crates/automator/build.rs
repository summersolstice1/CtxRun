const COMMANDS: &[&str] = &[
    "execute_workflow",
    "stop_workflow",
    "get_mouse_position"
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
