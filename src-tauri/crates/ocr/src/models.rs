use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrStatus {
    pub active_model: String,
    pub model_dir: String,
    pub installed: bool,
    pub loaded: bool,
    pub missing_files: Vec<String>,
    pub idle_ttl_secs: u64,
    pub idle_expires_in_ms: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrRecognizeFileRequest {
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrRecognizeBytesRequest {
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrRecognitionResponse {
    pub model_profile: String,
    pub full_text: String,
    pub lines: Vec<OcrLine>,
    pub line_count: usize,
    pub elapsed_ms: u64,
    pub image_width: u32,
    pub image_height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrLine {
    pub text: String,
    pub confidence: f32,
    pub bbox: OcrBoundingBox,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrBoundingBox {
    pub left: i32,
    pub top: i32,
    pub width: u32,
    pub height: u32,
    pub score: f32,
    pub points: Option<Vec<OcrPoint>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrPoint {
    pub x: f32,
    pub y: f32,
}
