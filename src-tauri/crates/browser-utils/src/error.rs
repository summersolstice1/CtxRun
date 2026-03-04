use thiserror::Error;

#[derive(Debug, Error)]
pub enum BrowserUtilsError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Message(String),
}

impl From<String> for BrowserUtilsError {
    fn from(value: String) -> Self {
        Self::Message(value)
    }
}

impl From<&str> for BrowserUtilsError {
    fn from(value: &str) -> Self {
        Self::Message(value.to_string())
    }
}

pub type Result<T> = std::result::Result<T, BrowserUtilsError>;
