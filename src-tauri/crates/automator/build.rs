const COMMANDS: &[&str] = &[
    "execute_workflow",
    "execute_workflow_graph",
    "stop_workflow",
    "get_mouse_position",
    "get_pixel_color"
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
