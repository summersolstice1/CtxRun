use serde::Serialize;
use std::collections::HashMap;

pub mod binaries;
pub mod browsers;
pub mod common;
pub mod ides;
pub mod network;
pub mod npm;
pub mod scan_logic;
pub mod scanners;
pub mod sdks;
pub mod system;
pub mod traits;

#[derive(Debug, Serialize, Clone)]
pub struct ToolInfo {
    pub name: String,
    pub version: String,
    pub path: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Default, Serialize, Clone)]
pub struct EnvReport {
    pub system: Option<HashMap<String, String>>,
    pub binaries: Vec<ToolInfo>,
    pub browsers: Vec<ToolInfo>,
    pub ides: Vec<ToolInfo>,
    pub languages: Vec<ToolInfo>,
    pub sdks: HashMap<String, Vec<String>>,
    pub virtualization: Vec<ToolInfo>,
    pub databases: Vec<ToolInfo>,
    pub managers: Vec<ToolInfo>,
    pub utilities: Vec<ToolInfo>,
    pub npm_packages: Vec<ToolInfo>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
pub enum ProjectType {
    Tauri,
    NodeFrontend,
    Rust,
    Python,
    Java,
    Go,
    Php,
    DotNet,
    Mobile,
    Mixed,
}

#[derive(Debug, Serialize, Clone)]
pub struct AiContextReport {
    pub project_type: ProjectType,
    pub summary: String,
    pub system_info: String,
    pub toolchain: Vec<ToolInfo>,
    pub dependencies: HashMap<String, String>,
    pub markdown: String,
}
