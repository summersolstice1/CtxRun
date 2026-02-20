//! Error types for refinery operations

use image::ImageError;
use rusqlite::Error as DbError;
use serde::Serialize;
use std::io::Error as IoError;
use std::sync::PoisonError;
use tauri::Error as TauriError;
use thiserror::Error;

/// Main error type for refinery operations
#[derive(Debug, Error)]
pub enum RefineryError {
    #[error("Clipboard error: {0}")]
    ClipboardError(String),

    #[error("Tauri error: {0}")]
    TauriError(String),

    #[error("Database error: {0}")]
    DbError(#[from] DbError),

    #[error("IO error: {0}")]
    IoError(#[from] IoError),

    #[error("Image error: {0}")]
    ImageError(#[from] ImageError),

    #[error("{0}")]
    String(String),

    #[error("Async operation failed: {0}")]
    JoinError(String),
}

impl From<String> for RefineryError {
    fn from(s: String) -> Self {
        RefineryError::String(s)
    }
}

impl From<&str> for RefineryError {
    fn from(s: &str) -> Self {
        RefineryError::String(s.to_string())
    }
}

impl From<TauriError> for RefineryError {
    fn from(e: TauriError) -> Self {
        RefineryError::TauriError(e.to_string())
    }
}

impl<T> From<PoisonError<T>> for RefineryError {
    fn from(e: PoisonError<T>) -> Self {
        RefineryError::String(format!("Mutex lock failed: {}", e))
    }
}

impl Serialize for RefineryError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Result type alias for refinery operations
pub type Result<T> = std::result::Result<T, RefineryError>;
