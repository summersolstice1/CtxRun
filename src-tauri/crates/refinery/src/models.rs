use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum RefineryKind {
    #[serde(rename = "text")]
    Text,
    #[serde(rename = "image")]
    Image,
    #[serde(rename = "mixed")]
    Mixed,
}

impl ToString for RefineryKind {
    fn to_string(&self) -> String {
        match self {
            RefineryKind::Text => "text".to_string(),
            RefineryKind::Image => "image".to_string(),
            RefineryKind::Mixed => "mixed".to_string(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RefineryMetadata {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub format: Option<String>,
    pub tokens: Option<usize>,
    pub image_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RefineryItem {
    pub id: String,
    pub kind: String,
    pub content: Option<String>,
    pub content_hash: String,
    pub preview: Option<String>,
    pub source_app: Option<String>,
    pub url: Option<String>,
    pub size_info: Option<String>,
    pub is_pinned: bool,
    pub metadata: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub title: Option<String>,
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub is_manual: bool,
    #[serde(default)]
    pub is_edited: bool,
}
