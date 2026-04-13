use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum TransferError {
    #[error("Transfer service is already running.")]
    AlreadyRunning,
    #[error("Transfer service is not running.")]
    NotRunning,
    #[error("No available LAN network interface was found.")]
    NoNetworkInterface,
    #[error("Invalid bind address: {0}")]
    InvalidBindAddress(String),
    #[error("Requested port is unavailable: {0}")]
    PortUnavailable(u16),
    #[error("Invalid session token.")]
    InvalidSession,
    #[error("Invalid session route token.")]
    InvalidRouteToken,
    #[error("Device not found: {0}")]
    DeviceNotFound(String),
    #[error("File not found: {0}")]
    FileNotFound(String),
    #[error("Bad request: {0}")]
    BadRequest(String),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Async task failed: {0}")]
    Join(String),
    #[error("{0}")]
    Message(String),
}

impl From<String> for TransferError {
    fn from(value: String) -> Self {
        Self::Message(value)
    }
}

impl From<&str> for TransferError {
    fn from(value: &str) -> Self {
        Self::Message(value.to_string())
    }
}

impl From<tokio::task::JoinError> for TransferError {
    fn from(value: tokio::task::JoinError) -> Self {
        Self::Join(value.to_string())
    }
}

impl Serialize for TransferError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl IntoResponse for TransferError {
    fn into_response(self) -> Response {
        let status = match self {
            TransferError::AlreadyRunning => StatusCode::CONFLICT,
            TransferError::NotRunning => StatusCode::BAD_REQUEST,
            TransferError::NoNetworkInterface => StatusCode::BAD_REQUEST,
            TransferError::InvalidBindAddress(_) => StatusCode::BAD_REQUEST,
            TransferError::PortUnavailable(_) => StatusCode::CONFLICT,
            TransferError::InvalidSession => StatusCode::FORBIDDEN,
            TransferError::InvalidRouteToken => StatusCode::NOT_FOUND,
            TransferError::DeviceNotFound(_) => StatusCode::NOT_FOUND,
            TransferError::FileNotFound(_) => StatusCode::NOT_FOUND,
            TransferError::BadRequest(_) => StatusCode::BAD_REQUEST,
            TransferError::Io(_) => StatusCode::INTERNAL_SERVER_ERROR,
            TransferError::Json(_) => StatusCode::BAD_REQUEST,
            TransferError::Join(_) => StatusCode::INTERNAL_SERVER_ERROR,
            TransferError::Message(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        (status, self.to_string()).into_response()
    }
}

pub type Result<T> = std::result::Result<T, TransferError>;
