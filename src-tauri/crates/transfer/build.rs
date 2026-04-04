const COMMANDS: &[&str] = &[
    "start_service",
    "stop_service",
    "send_message",
    "send_file",
    "get_devices",
    "get_chat_history",
    "get_network_interfaces",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
