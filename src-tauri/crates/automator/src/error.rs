use serde::Serialize;
use std::io::Error as IoError;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AutomatorError {
    #[error("Automation is already running")]
    AlreadyRunning,

    #[error("Input operation failed: {0}")]
    InputError(String),

    #[error("IO error: {0}")]
    IoError(#[from] IoError),

    #[error("Screen capture failed: {0}")]
    ScreenError(String),

    #[error("Async operation failed: {0}")]
    JoinError(String),

    #[error("Browser automation failed: {0}")]
    BrowserError(String),

    #[error("Browser utility failed: {0}")]
    BrowserUtilsError(#[from] ctxrun_browser_utils::BrowserUtilsError),

    #[error("JSON parsing error: {0}")]
    JsonError(#[from] serde_json::Error),
}

impl Serialize for AutomatorError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AutomatorError>;
