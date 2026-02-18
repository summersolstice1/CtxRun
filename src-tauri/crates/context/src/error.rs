//! Error types for context operations

use serde::Serialize;
use std::fmt;
use std::io::Error as IoError;

/// Main error type for context operations
#[derive(Debug)]
pub enum ContextError {
    /// Clipboard error
    ClipboardError(String),

    /// Database error
    DbError(String),

    /// IO error
    IoError(IoError),

    /// Gitignore parsing error
    GitignoreError(String),

    /// Join error from async operations
    JoinError(String),
}

impl fmt::Display for ContextError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ContextError::ClipboardError(e) => write!(f, "Clipboard error: {}", e),
            ContextError::DbError(e) => write!(f, "Database error: {}", e),
            ContextError::IoError(e) => write!(f, "IO error: {}", e),
            ContextError::GitignoreError(e) => write!(f, "Gitignore error: {}", e),
            ContextError::JoinError(e) => write!(f, "Async operation failed: {}", e),
        }
    }
}

impl std::error::Error for ContextError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            ContextError::IoError(e) => Some(e),
            _ => None,
        }
    }
}

impl From<IoError> for ContextError {
    fn from(e: IoError) -> Self {
        ContextError::IoError(e)
    }
}

impl Serialize for ContextError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(&format!("{}", self))
    }
}

/// Result type alias for context operations
pub type Result<T> = std::result::Result<T, ContextError>;
