const COMMANDS: &[&str] = &[
    "execute_workflow",
    "execute_workflow_graph",
    "stop_workflow",
    "get_mouse_position",
    "get_pixel_color",
    "get_element_under_cursor",
    "pick_web_selector"
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
