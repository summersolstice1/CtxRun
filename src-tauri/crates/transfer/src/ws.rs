use std::time::Duration;

use axum::extract::ws::{Message as WsMessage, WebSocket};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};

use crate::device::{infer_device_name, infer_device_type};
use crate::error::TransferError;
use crate::models::{
    DeviceConnectedPayload, DeviceDisconnectedPayload, TransferDevice, TransferFileStatus,
    TransferMessage, TransferMessageDirection, now_ms,
};
use crate::server::{
    EVENT_DEVICE_CONNECTED, EVENT_DEVICE_DISCONNECTED, EVENT_MESSAGE_RECEIVED,
    RunningServiceShared, emit_error,
};

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientWsMessage {
    Hello {
        #[serde(rename = "userAgent")]
        user_agent: String,
        pin: Option<String>,
    },
    Chat {
        content: String,
    },
    Ping,
    FileRequest {
        #[serde(rename = "fileId")]
        file_id: String,
        #[serde(rename = "fileName")]
        file_name: String,
        #[serde(rename = "fileSize")]
        file_size: u64,
    },
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerWsMessage {
    Session {
        #[serde(rename = "deviceId")]
        device_id: String,
        #[serde(rename = "sessionToken")]
        session_token: String,
        #[serde(rename = "deviceName")]
        device_name: String,
    },
    Chat {
        content: String,
        #[serde(rename = "timestampMs")]
        timestamp_ms: u64,
    },
    FileOffer {
        #[serde(rename = "fileId")]
        file_id: String,
        #[serde(rename = "fileName")]
        file_name: String,
        #[serde(rename = "fileSize")]
        file_size: u64,
        #[serde(rename = "downloadUrl")]
        download_url: String,
        #[serde(rename = "timestampMs")]
        timestamp_ms: u64,
    },
    FileAccept {
        #[serde(rename = "fileId")]
        file_id: String,
    },
    FileReject {
        #[serde(rename = "fileId")]
        file_id: String,
    },
    System {
        content: String,
        #[serde(rename = "timestampMs")]
        timestamp_ms: u64,
    },
    Error {
        message: String,
    },
    Pong,
}

pub async fn handle_socket<R: tauri::Runtime>(
    socket: WebSocket,
    shared: RunningServiceShared<R>,
    ip_address: String,
) {
    eprintln!("[transfer] New WS connection from {ip_address}, waiting for handshake...");
    let (mut sender, mut receiver) = socket.split();
    let hello = match tokio::time::timeout(Duration::from_secs(20), receiver.next()).await {
        Ok(Some(Ok(WsMessage::Text(text)))) => match serde_json::from_str::<ClientWsMessage>(&text)
        {
            Ok(ClientWsMessage::Hello { user_agent, pin }) => {
                if let Some(expected_pin) = shared
                    .config
                    .pin
                    .as_ref()
                    .filter(|pin| !pin.trim().is_empty())
                {
                    if pin.as_deref().map(str::trim) != Some(expected_pin.trim()) {
                        let _ = send_direct(
                            &mut sender,
                            &ServerWsMessage::Error {
                                message: "Invalid PIN.".to_string(),
                            },
                        )
                        .await;
                        return;
                    }
                }
                user_agent
            }
            Ok(_) => {
                let _ = send_direct(
                    &mut sender,
                    &ServerWsMessage::Error {
                        message: "First message must be a hello handshake.".to_string(),
                    },
                )
                .await;
                return;
            }
            Err(error) => {
                let _ = send_direct(
                    &mut sender,
                    &ServerWsMessage::Error {
                        message: format!("Failed to parse handshake: {error}"),
                    },
                )
                .await;
                return;
            }
        },
        _ => {
            let _ = send_direct(
                &mut sender,
                &ServerWsMessage::Error {
                    message: "Handshake timed out.".to_string(),
                },
            )
            .await;
            return;
        }
    };

    eprintln!("[transfer] Handshake OK from {ip_address}, user_agent: {hello}");
    let device_id = uuid::Uuid::new_v4().simple().to_string();
    let session_token = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    let device = TransferDevice {
        id: device_id.clone(),
        name: infer_device_name(&hello),
        device_type: infer_device_type(&hello),
        ip_address: ip_address.clone(),
        connected_at_ms: now_ms(),
    };

    let (outbound_tx, mut outbound_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    shared
        .device_manager
        .add_device(device.clone(), session_token.clone(), outbound_tx.clone())
        .await;

    let system_message =
        TransferMessage::system(device_id.clone(), format!("{} connected", device.name));
    shared
        .device_manager
        .append_history(&device_id, system_message)
        .await;
    shared.emit(
        EVENT_DEVICE_CONNECTED,
        &DeviceConnectedPayload {
            device: device.clone(),
        },
    );
    eprintln!(
        "[transfer] Device connected: {} ({}) from {ip_address}",
        device.name, device_id
    );

    let _ = outbound_tx.send(
        serde_json::to_string(&ServerWsMessage::Session {
            device_id: device.id.clone(),
            session_token,
            device_name: device.name.clone(),
        })
        .unwrap_or_else(|_| {
            "{\"type\":\"error\",\"message\":\"Failed to serialize session.\"}".to_string()
        }),
    );
    let _ = outbound_tx.send(
        serde_json::to_string(&ServerWsMessage::System {
            content: "Connected to CtxRun".to_string(),
            timestamp_ms: now_ms(),
        })
        .unwrap_or_else(|_| {
            "{\"type\":\"error\",\"message\":\"Failed to serialize system message.\"}".to_string()
        }),
    );

    let writer_shutdown = shared.shutdown.clone();
    let mut writer = sender;
    let writer_task = tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                _ = writer_shutdown.cancelled() => {
                    let _ = writer.send(WsMessage::Close(None)).await;
                    break;
                }
                payload = outbound_rx.recv() => {
                    let Some(payload) = payload else {
                        break;
                    };
                    if writer.send(WsMessage::Text(payload.into())).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    let shutdown = shared.shutdown.clone();
    loop {
        tokio::select! {
            _ = shutdown.cancelled() => {
                break;
            }
            next = receiver.next() => {
                let Some(next) = next else {
                    break;
                };

                match next {
                    Ok(WsMessage::Text(text)) => {
                        match serde_json::from_str::<ClientWsMessage>(&text) {
                            Ok(ClientWsMessage::Chat { content }) => {
                                let trimmed = content.trim();
                                if trimmed.is_empty() {
                                    continue;
                                }
                                let message = TransferMessage::text(
                                    device_id.clone(),
                                    TransferMessageDirection::Received,
                                    trimmed.to_string(),
                                );
                                shared.device_manager.append_history(&device_id, message.clone()).await;
                                shared.emit(EVENT_MESSAGE_RECEIVED, &message);
                            }
                            Ok(ClientWsMessage::Ping) => {
                                let _ = shared.device_manager.send_json(&device_id, &ServerWsMessage::Pong).await;
                            }
                            Ok(ClientWsMessage::FileRequest { file_id, file_name, file_size }) => {
                                let message = TransferMessage::file(
                                    device_id.clone(),
                                    TransferMessageDirection::Received,
                                    file_id.clone(),
                                    file_name,
                                    file_size,
                                    TransferFileStatus::PendingApproval,
                                );
                                shared
                                    .device_manager
                                    .append_history(&device_id, message.clone())
                                    .await;
                                shared.emit("transfer:file-request", &message);
                            }
                            Ok(ClientWsMessage::Hello { .. }) => {}
                            Err(error) => {
                                emit_error(
                                    &shared,
                                    format!("Invalid device message: {error}"),
                                    Some(device_id.clone()),
                                );
                            }
                        }
                    }
                    Ok(WsMessage::Close(_)) => break,
                    Ok(_) => {}
                    Err(error) => {
                        emit_error(
                            &shared,
                            format!("WebSocket error: {error}"),
                            Some(device_id.clone()),
                        );
                        break;
                    }
                }
            }
        }
    }

    writer_task.abort();
    shared.device_manager.remove_device(&device_id).await;
    eprintln!("[transfer] Device disconnected: {device_id}");
    shared.emit(
        EVENT_DEVICE_DISCONNECTED,
        &DeviceDisconnectedPayload {
            device_id,
            reason: "connection_closed".to_string(),
        },
    );
}

async fn send_direct(
    sender: &mut futures::stream::SplitSink<WebSocket, WsMessage>,
    payload: &ServerWsMessage,
) -> Result<(), TransferError> {
    sender
        .send(WsMessage::Text(serde_json::to_string(payload)?.into()))
        .await
        .map_err(|error| {
            TransferError::Message(format!("Failed to write websocket response: {error}"))
        })
}
