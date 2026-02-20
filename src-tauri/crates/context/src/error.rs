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
