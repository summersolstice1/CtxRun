use std::path::Path;

use tauri::{AppHandle, Runtime};

use crate::error::{OcrServiceError, Result};

pub fn ensure_models_downloaded<R: Runtime>(_app: &AppHandle<R>, model_dir: &Path) -> Result<()> {
    Err(OcrServiceError::ModelDownloadNotImplemented(
        model_dir.to_string_lossy().to_string(),
    ))
}
