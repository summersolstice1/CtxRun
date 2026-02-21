use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum MinerError {
    #[error("Browser automation error: {0}")]
    BrowserError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("URL parsing error: {0}")]
    UrlError(#[from] url::ParseError),

    #[error("Extraction failed: {0}")]
    ExtractionError(String),

    #[error("Task cancelled")]
    Cancelled,

    #[error("System error: {0}")]
    SystemError(String),
}

// 允许将错误序列化后返回给前端
impl Serialize for MinerError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, MinerError>;
