use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum OcrServiceError {
    #[error("OCR model directory is unavailable: {0}")]
    ModelDirectoryUnavailable(String),

    #[error("OCR models are missing in {model_dir}: {missing:?}")]
    ModelFilesMissing {
        model_dir: String,
        missing: Vec<String>,
    },

    #[error("OCR models are not prepared yet")]
    ModelsNotPrepared,

    #[error("OCR manifest fetch failed: {0}")]
    ManifestFetchFailed(String),

    #[error("OCR manifest is invalid: {0}")]
    ManifestInvalid(String),

    #[error("OCR model metadata is invalid: {0}")]
    ActivePackageInvalid(String),

    #[error("OCR model download failed for {file}: {reason}")]
    DownloadFailed { file: String, reason: String },

    #[error("OCR engine initialization failed: {0}")]
    EngineInitFailed(String),

    #[error("Image load failed: {0}")]
    ImageLoadFailed(String),

    #[error("OCR inference failed: {0}")]
    RecognitionFailed(String),

    #[error("Task execution failed: {0}")]
    JoinError(String),

    #[error("{0}")]
    Message(String),
}

impl OcrServiceError {
    pub fn missing_models(model_dir: impl Into<String>, missing: Vec<String>) -> Self {
        Self::ModelFilesMissing {
            model_dir: model_dir.into(),
            missing,
        }
    }
}

impl From<ocr_rs::OcrError> for OcrServiceError {
    fn from(value: ocr_rs::OcrError) -> Self {
        Self::RecognitionFailed(value.to_string())
    }
}

impl From<image::ImageError> for OcrServiceError {
    fn from(value: image::ImageError) -> Self {
        Self::ImageLoadFailed(value.to_string())
    }
}

impl From<std::io::Error> for OcrServiceError {
    fn from(value: std::io::Error) -> Self {
        Self::Message(value.to_string())
    }
}

impl From<serde_json::Error> for OcrServiceError {
    fn from(value: serde_json::Error) -> Self {
        Self::Message(value.to_string())
    }
}

impl From<String> for OcrServiceError {
    fn from(value: String) -> Self {
        Self::Message(value)
    }
}

impl From<&str> for OcrServiceError {
    fn from(value: &str) -> Self {
        Self::Message(value.to_string())
    }
}

impl Serialize for OcrServiceError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, OcrServiceError>;
