use tauri::{
    Manager, Runtime,
    plugin::{Builder, TauriPlugin},
};

pub mod commands;
pub mod device;
pub mod error;
pub mod mobile;
pub mod models;
pub mod network;
pub mod qr;
pub mod server;
pub mod transfer;
pub mod ws;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("ctxrun-plugin-transfer")
        .invoke_handler(tauri::generate_handler![
            commands::start_service,
            commands::stop_service,
            commands::send_message,
            commands::send_file,
            commands::get_devices,
            commands::get_chat_history,
            commands::get_network_interfaces,
            commands::respond_file_request,
            commands::respond_connection_request
        ])
        .setup(|app, _api| {
            app.manage(commands::TransferState::<R>::new());
            Ok(())
        })
        .build()
}
