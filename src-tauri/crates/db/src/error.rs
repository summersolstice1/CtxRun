use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DbError {
    #[error("Database error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("CSV error: {0}")]
    Csv(#[from] csv::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Migration error: {0}")]
    Migration(String),

    #[error("Lock poisoned: {0}")]
    LockPoisoned(String),

    #[error("{0}")]
    Message(String),
}

impl From<String> for DbError {
    fn from(value: String) -> Self {
        Self::Message(value)
    }
}

impl From<&str> for DbError {
    fn from(value: &str) -> Self {
        Self::Message(value.to_string())
    }
}

impl<T> From<std::sync::PoisonError<T>> for DbError {
    fn from(value: std::sync::PoisonError<T>) -> Self {
        Self::LockPoisoned(value.to_string())
    }
}

impl Serialize for DbError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, DbError>;
