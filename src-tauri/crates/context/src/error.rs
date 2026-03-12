//! Error types for context operations

use serde::Serialize;
use std::io::Error as IoError;
use thiserror::Error;

/// Main error type for context operations
#[derive(Debug, Error)]
pub enum ContextError {
    #[error("Clipboard error: {0}")]
    ClipboardError(String),

    #[error("Database error: {0}")]
    DbError(String),

    #[error("IO error: {0}")]
    IoError(#[from] IoError),

    #[error("Gitignore error: {0}")]
    GitignoreError(String),

    #[error("Async operation failed: {0}")]
    JoinError(String),
}

impl From<String> for ContextError {
    fn from(s: String) -> Self {
        ContextError::DbError(s)
    }
}

impl From<&str> for ContextError {
    fn from(s: &str) -> Self {
        ContextError::DbError(s.to_string())
    }
}

impl Serialize for ContextError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Result type alias for context operations
pub type Result<T> = std::result::Result<T, ContextError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn context_error_conversions_and_serialization_use_display_strings() {
        let from_string = ContextError::from("db failed".to_string());
        let from_str = ContextError::from("db failed again");
        let from_io = ContextError::from(std::io::Error::other("disk failed"));
        let clipboard = ContextError::ClipboardError("clipboard down".into());
        let gitignore = ContextError::GitignoreError("bad ignore".into());
        let join = ContextError::JoinError("join failed".into());

        assert_eq!(from_string.to_string(), "Database error: db failed");
        assert_eq!(from_str.to_string(), "Database error: db failed again");
        assert!(from_io.to_string().contains("IO error: disk failed"));
        assert_eq!(clipboard.to_string(), "Clipboard error: clipboard down");
        assert_eq!(gitignore.to_string(), "Gitignore error: bad ignore");
        assert_eq!(join.to_string(), "Async operation failed: join failed");

        let serialized = serde_json::to_string(&clipboard).expect("serialize context error");
        assert_eq!(serialized, "\"Clipboard error: clipboard down\"");
    }
}
