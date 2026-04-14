use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrStatus {
    pub active_model: String,
    pub active_release: Option<String>,
    pub model_dir: String,
    pub installed: bool,
    pub loaded: bool,
    pub preparing: bool,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrActivePackage {
    pub profile_id: String,
    pub release_tag: String,
    pub prepared_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrManifest {
    pub schema_version: u32,
    pub profile_id: String,
    pub title: String,
    pub version: String,
    pub generated_at: String,
    pub source: OcrManifestSource,
    pub release: OcrManifestRelease,
    pub files: Vec<OcrManifestFile>,
}

impl OcrManifest {
    pub fn release_tag(&self) -> &str {
        if self.release.tag.is_empty() {
            &self.version
        } else {
            &self.release.tag
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrManifestSource {
    pub repository: String,
    pub branch: String,
    pub path: String,
    pub commit: String,
    pub committed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrManifestRelease {
    pub repository: String,
    pub tag: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrManifestFile {
    pub name: String,
    pub size: u64,
    pub sha256: String,
    pub url: String,
    #[serde(default)]
    pub mirrors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrPrepareProgress {
    pub stage: String,
    pub release_tag: Option<String>,
    pub current_file: Option<String>,
    pub completed_files: usize,
    pub total_files: usize,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub message: Option<String>,
}
