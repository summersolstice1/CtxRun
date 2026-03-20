fn main() {
    tauri_plugin::Builder::new(&[
        "request_exec",
        "approve_exec",
        "write_exec",
        "resize_exec",
        "terminate_exec",
    ])
    .build();
}
