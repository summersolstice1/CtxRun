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

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn db_error_conversions_and_serialization_preserve_display_text() {
        let sqlite_error = Connection::open_in_memory()
            .expect("open in-memory db")
            .execute("SELECT * FROM missing_table", [])
            .expect_err("missing table should fail");
        let sqlite = DbError::from(sqlite_error);
        let io = DbError::from(std::io::Error::other("disk failed"));
        let json = DbError::from(serde_json::from_str::<serde_json::Value>("{").expect_err("bad json"));
        let csv = DbError::from(csv::Error::from(std::io::Error::other("csv failed")));
        let migration = DbError::Migration("migration failed".into());
        let from_string = DbError::from("message".to_string());
        let from_str = DbError::from("message-ref");

        let poisoned = {
            let mutex = std::sync::Mutex::new(());
            let _ = std::panic::catch_unwind(|| {
                let _guard = mutex.lock().expect("lock mutex");
                panic!("poison");
            });
            let err = mutex.lock().expect_err("mutex should be poisoned");
            DbError::from(err)
        };

        assert!(sqlite.to_string().contains("Database error:"));
        assert_eq!(io.to_string(), "IO error: disk failed");
        assert!(json.to_string().contains("JSON error:"));
        assert!(csv.to_string().contains("CSV error:"));
        assert_eq!(migration.to_string(), "Migration error: migration failed");
        assert_eq!(from_string.to_string(), "message");
        assert_eq!(from_str.to_string(), "message-ref");
        assert!(poisoned.to_string().contains("Lock poisoned:"));

        let serialized = serde_json::to_string(&migration).expect("serialize db error");
        assert_eq!(serialized, "\"Migration error: migration failed\"");
    }
}
