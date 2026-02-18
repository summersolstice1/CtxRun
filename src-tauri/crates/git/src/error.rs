//! Error types for git operations
//!
//! This module defines errors that can occur during git operations.
//! Errors implement serde::Serialize to be compatible with Tauri commands.

use git2::Error as Git2Error;
use serde::Serialize;
use std::io::Error as IoError;
use thiserror::Error;

/// Main error type for git operations
///
/// The error message is automatically serialized as a string when returned
/// to the frontend via Tauri commands.
#[derive(Debug, Error)]
pub enum GitError {
    /// Generic git2 error
    #[error("Git operation failed: {0}")]
    GitError(#[from] Git2Error),

    /// Generic IO error
    #[error("IO error: {0}")]
    IoError(#[from] IoError),

    /// No files selected for export
    #[error("No files selected for export")]
    NoFilesSelected,

    /// Join error from async operations
    #[error("Async operation failed: {0}")]
    JoinError(String),
}

impl Serialize for GitError {
    /// Serialize error as a string message
    ///
    /// Tauri commands require errors to implement Serialize.
    /// We serialize the Display representation of the error.
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

/// Result type alias for git operations
///
/// Usage: `pub fn my_function() -> Result<Value, GitError>`
pub type Result<T> = std::result::Result<T, GitError>;
