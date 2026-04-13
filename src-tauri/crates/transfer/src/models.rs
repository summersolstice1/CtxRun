use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum UrlMode {
    Fixed,
    #[default]
    Random,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceConfig {
    pub url_mode: UrlMode,
    pub port: Option<u16>,
    pub bind_address: Option<String>,
    pub save_dir: Option<String>,
}

impl Default for ServiceConfig {
    fn default() -> Self {
        Self {
            url_mode: UrlMode::Random,
            port: None,
            bind_address: None,
            save_dir: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceInfo {
    pub url: String,
    pub port: u16,
    pub bind_address: String,
    pub qr_matrix: Vec<Vec<bool>>,
    pub url_mode: UrlMode,
    pub save_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferNetworkInterface {
    pub id: String,
    pub name: String,
    pub addresses: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferDevice {
    pub id: String,
    pub name: String,
    pub device_type: String,
    pub ip_address: String,
    pub connected_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TransferMessageKind {
    Text,
    File,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TransferMessageDirection {
    Sent,
    Received,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TransferFileStatus {
    Pending,
    PendingApproval,
    Rejected,
    Transferring,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferMessage {
    pub id: String,
    pub device_id: String,
    pub kind: TransferMessageKind,
    pub direction: TransferMessageDirection,
    pub content: Option<String>,
    pub file_name: Option<String>,
    pub file_size: Option<u64>,
    pub file_id: Option<String>,
    pub saved_path: Option<String>,
    pub status: Option<TransferFileStatus>,
    pub progress_percent: Option<f32>,
    pub timestamp_ms: u64,
}

impl TransferMessage {
    pub fn text(
        device_id: impl Into<String>,
        direction: TransferMessageDirection,
        content: impl Into<String>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().simple().to_string(),
            device_id: device_id.into(),
            kind: TransferMessageKind::Text,
            direction,
            content: Some(content.into()),
            file_name: None,
            file_size: None,
            file_id: None,
            saved_path: None,
            status: None,
            progress_percent: None,
            timestamp_ms: now_ms(),
        }
    }

    pub fn system(device_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4().simple().to_string(),
            device_id: device_id.into(),
            kind: TransferMessageKind::System,
            direction: TransferMessageDirection::System,
            content: Some(content.into()),
            file_name: None,
            file_size: None,
            file_id: None,
            saved_path: None,
            status: None,
            progress_percent: None,
            timestamp_ms: now_ms(),
        }
    }

    pub fn file(
        device_id: impl Into<String>,
        direction: TransferMessageDirection,
        file_id: impl Into<String>,
        file_name: impl Into<String>,
        file_size: u64,
        status: TransferFileStatus,
    ) -> Self {
        let file_id = file_id.into();
        Self {
            id: file_id.clone(),
            device_id: device_id.into(),
            kind: TransferMessageKind::File,
            direction,
            content: None,
            file_name: Some(file_name.into()),
            file_size: Some(file_size),
            file_id: Some(file_id),
            saved_path: None,
            status: Some(status),
            progress_percent: Some(0.0),
            timestamp_ms: now_ms(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    pub device_id: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendFileRequest {
    pub device_id: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendFileResponse {
    pub file_id: String,
    pub file_name: String,
    pub file_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetChatHistoryRequest {
    pub device_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    pub message: String,
    pub device_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileProgressPayload {
    pub device_id: String,
    pub file_id: String,
    pub file_name: String,
    pub direction: TransferMessageDirection,
    pub status: TransferFileStatus,
    pub transferred_bytes: u64,
    pub total_bytes: u64,
    pub progress_percent: f32,
    pub speed_bytes_per_sec: u64,
    pub saved_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceConnectedPayload {
    pub device: TransferDevice,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceDisconnectedPayload {
    pub device_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsEnvelope {
    #[serde(rename = "type")]
    pub message_type: String,
    pub payload: serde_json::Value,
}

pub fn now_ms() -> u64 {
    Utc::now().timestamp_millis().max(0) as u64
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionRequestPayload {
    pub device_id: String,
    pub name: String,
    pub device_type: String,
    pub ip_address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionRequestCancelledPayload {
    pub device_id: String,
    pub reason: String,
}
