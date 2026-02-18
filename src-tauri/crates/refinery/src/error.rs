//! Error types for refinery operations

use image::ImageError;
use rusqlite::Error as DbError;
use serde::Serialize;
use std::fmt;
use std::io::Error as IoError;
use std::sync::PoisonError;
use tauri::Error as TauriError;

/// Main error type for refinery operations
#[derive(Debug)]
pub enum RefineryError {
    /// Clipboard error
    ClipboardError(String),

    /// Tauri error
    TauriError(String),

    /// Database error
    DbError(DbError),

    /// IO error
    IoError(IoError),

    /// Image processing error
    ImageError(ImageError),

    /// Generic string error (for backward compatibility)
    String(String),

    /// Join error from async operations
    JoinError(String),
}

// Manual Display implementation
impl fmt::Display for RefineryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RefineryError::ClipboardError(e) => write!(f, "Clipboard error: {}", e),
            RefineryError::TauriError(e) => write!(f, "Tauri error: {}", e),
            RefineryError::DbError(e) => write!(f, "Database error: {}", e),
            RefineryError::IoError(e) => write!(f, "IO error: {}", e),
            RefineryError::ImageError(e) => write!(f, "Image error: {}", e),
            RefineryError::String(e) => write!(f, "{}", e),
            RefineryError::JoinError(e) => write!(f, "Async operation failed: {}", e),
        }
    }
}

impl std::error::Error for RefineryError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            RefineryError::DbError(e) => Some(e),
            RefineryError::IoError(e) => Some(e),
            RefineryError::ImageError(e) => Some(e),
            _ => None,
        }
    }
}

impl From<DbError> for RefineryError {
    fn from(e: DbError) -> Self {
        RefineryError::DbError(e)
    }
}

impl From<IoError> for RefineryError {
    fn from(e: IoError) -> Self {
        RefineryError::IoError(e)
    }
}

impl From<ImageError> for RefineryError {
    fn from(e: ImageError) -> Self {
        RefineryError::ImageError(e)
    }
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
        serializer.serialize_str(&format!("{}", self))
    }
}

/// Result type alias for refinery operations
pub type Result<T> = std::result::Result<T, RefineryError>;
