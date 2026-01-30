use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum RefineryKind {
    #[serde(rename = "text")]
    Text,
    #[serde(rename = "image")]
    Image,
}

impl ToString for RefineryKind {
    fn to_string(&self) -> String {
        match self {
            RefineryKind::Text => "text".to_string(),
            RefineryKind::Image => "image".to_string(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RefineryMetadata {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub format: Option<String>,
    // 预留给 AI 分析的字段
    pub tokens: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RefineryItem {
    pub id: String,
    pub kind: String,           // "text" | "image"
    pub content: Option<String>, // 文本内容 或 图片路径
    pub content_hash: String,   // SHA256
    pub preview: Option<String>,
    pub source_app: Option<String>,
    pub size_info: Option<String>, // "100 chars" | "1920x1080"
    pub is_pinned: bool,
    pub metadata: String,       // JSON
    pub created_at: i64,
    pub updated_at: i64,
}
