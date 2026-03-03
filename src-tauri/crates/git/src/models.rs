use serde::{Deserialize, Serialize};

// 来自 git.rs
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GitCommit {
    pub hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GitDiffFile {
    pub path: String,
    pub status: String,
    pub old_path: Option<String>,
    pub original_content: String,
    pub modified_content: String,
    pub is_binary: bool,
    pub is_large: bool,
}

// 来自 export.rs
#[derive(Deserialize, Clone, Copy, PartialEq)]
pub enum ExportFormat {
    Markdown,
    Json,
    Xml,
    Txt,
}

#[derive(Deserialize, Clone, Copy, PartialEq, Debug)]
pub enum ExportLayout {
    Split,
    Unified,
    GitPatch,
}
