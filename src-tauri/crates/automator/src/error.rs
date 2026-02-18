//! Error types for automator operations

use serde::Serialize;
use std::fmt;
use std::io::Error as IoError;

/// Main error type for automator operations
#[derive(Debug)]
pub enum AutomatorError {
    /// Workflow already running
    AlreadyRunning,

    /// Input operation failed (mouse/keyboard)
    InputError(String),

    /// IO error
    IoError(IoError),

    /// Screen capture error
    ScreenError(String),

    /// Join error from async operations
    JoinError(String),
}

impl fmt::Display for AutomatorError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AutomatorError::AlreadyRunning => write!(f, "Already running"),
            AutomatorError::InputError(e) => write!(f, "Input operation failed: {}", e),
            AutomatorError::IoError(e) => write!(f, "IO error: {}", e),
            AutomatorError::ScreenError(e) => write!(f, "Screen capture failed: {}", e),
            AutomatorError::JoinError(e) => write!(f, "Async operation failed: {}", e),
        }
    }
}

impl std::error::Error for AutomatorError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            AutomatorError::IoError(e) => Some(e),
            _ => None,
        }
    }
}

impl From<IoError> for AutomatorError {
    fn from(e: IoError) -> Self {
        AutomatorError::IoError(e)
    }
}

impl From<String> for AutomatorError {
    fn from(s: String) -> Self {
        AutomatorError::InputError(s)
    }
}

impl Serialize for AutomatorError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(&format!("{}", self))
    }
}

/// Result type alias for automator operations
pub type Result<T> = std::result::Result<T, AutomatorError>;
