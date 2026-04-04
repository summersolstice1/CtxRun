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

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn refinery_error_conversions_and_serialization_match_display_output() {
        let sqlite = RefineryError::from(
            Connection::open_in_memory()
                .expect("open in-memory db")
                .execute("SELECT * FROM missing_table", [])
                .expect_err("missing table should fail"),
        );
        let io = RefineryError::from(std::io::Error::other("disk failed"));
        let image = RefineryError::from(
            image::load_from_memory(b"not-an-image").expect_err("invalid image bytes"),
        );
        let clipboard = RefineryError::ClipboardError("clipboard down".into());
        let join = RefineryError::JoinError("join failed".into());
        let from_string = RefineryError::from("message".to_string());
        let from_str = RefineryError::from("message-ref");
        let tauri = RefineryError::from(tauri::Error::AssetNotFound("missing.txt".into()));

        let poisoned = {
            let mutex = std::sync::Mutex::new(());
            let _ = std::panic::catch_unwind(|| {
                let _guard = mutex.lock().expect("lock mutex");
                panic!("poison");
            });
            let err = mutex.lock().expect_err("mutex should be poisoned");
            RefineryError::from(err)
        };

        assert!(sqlite.to_string().contains("Database error:"));
        assert_eq!(io.to_string(), "IO error: disk failed");
        assert!(image.to_string().contains("Image error:"));
        assert_eq!(clipboard.to_string(), "Clipboard error: clipboard down");
        assert_eq!(join.to_string(), "Async operation failed: join failed");
        assert_eq!(from_string.to_string(), "message");
        assert_eq!(from_str.to_string(), "message-ref");
        assert_eq!(
            tauri.to_string(),
            "Tauri error: asset not found: missing.txt"
        );
        assert!(poisoned.to_string().contains("Mutex lock failed:"));

        let serialized = serde_json::to_string(&clipboard).expect("serialize refinery error");
        assert_eq!(serialized, "\"Clipboard error: clipboard down\"");
    }
}
