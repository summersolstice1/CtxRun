const COMMANDS: &[&str] = &[
    "start_service",
    "stop_service",
    "send_message",
    "send_file",
    "get_devices",
    "get_chat_history",
    "get_network_interfaces",
    "respond_file_request",
    "respond_connection_request",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
