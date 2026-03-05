use serde::{Deserialize, Serialize};

/// 爬取任务的配置参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinerConfig {
    /// 起始 URL
    pub url: String,

    // 👇 新增：严格限制爬取的 URL 前缀
    // 例如传入: "https://docs.rs/ort/2.0.0-rc.11/ort/"
    pub match_prefix: String,

    /// 最大爬取深度 (0 表示只爬当前页)
    pub max_depth: u32,
    /// 最大页面数量限制 (防止失控)
    pub max_pages: u32,
    /// 并发数 (1-10，默认 5)
    #[serde(default = "default_concurrency")]
    pub concurrency: u32,
    /// 输出目录 (绝对路径)
    pub output_dir: String,
}

fn default_concurrency() -> u32 {
    5
}

/// 爬取过程中的状态更新事件
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum MinerEvent {
    /// 进度更新
    Progress {
        current: u32,
        #[serde(rename = "totalDiscovered")]
        total_discovered: u32,
        #[serde(rename = "currentUrl")]
        current_url: String,
        status: String, // "Fetching", "Processing", "Saved"
    },
    /// 完成
    Finished {
        #[serde(rename = "totalPages")]
        total_pages: u32,
        #[serde(rename = "outputDir")]
        output_dir: String,
    },
    /// 发生错误
    Error { url: String, message: String },
}

/// 单个页面的处理结果
#[derive(Debug, Serialize, Deserialize)]
pub struct PageResult {
    pub url: String,
    pub title: String,
    pub markdown: String,
    pub links: Vec<String>, // 页面中发现的所有链接
}

/// 单页抓取请求参数（公共接口）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SinglePageRequest {
    /// 目标 URL（http/https）
    pub url: String,
    /// 单页抓取超时（毫秒，可选）
    pub timeout_ms: Option<u64>,
    /// 是否返回链接列表（默认 true）
    pub include_links: Option<bool>,
    /// 是否保存到磁盘（默认 false）
    pub save_to_disk: Option<bool>,
    /// 输出目录（当 save_to_disk=true 时必填）
    pub output_dir: Option<String>,
}

/// 单页抓取结果（可直接供 AI 消费）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SinglePageResult {
    pub url: String,
    pub title: String,
    pub markdown: String,
    pub links: Vec<String>,
    pub crawled_at: String,
    pub saved_path: Option<String>,
    pub warnings: Vec<String>,
}

/// 联网搜索请求参数（Google SERP）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchRequest {
    /// 搜索关键词
    pub query: String,
    /// 返回结果数量（1-20，默认 8）
    pub limit: Option<u32>,
    /// 起始偏移（0,10,20...）
    pub start: Option<u32>,
    /// 语言偏好（如 en, zh-CN）
    pub language: Option<String>,
    /// 国家偏好（如 US, CN）
    pub country: Option<String>,
    /// 安全搜索
    pub safe_search: Option<bool>,
    /// 搜索超时（毫秒）
    pub timeout_ms: Option<u64>,
    /// 防风控模式（默认 true）
    pub anti_bot_mode: Option<bool>,
    /// 是否返回诊断信息（用于调优 SERP 解析）
    pub debug: Option<bool>,
}

/// 单条搜索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchItem {
    pub rank: u32,
    pub title: String,
    pub url: String,
    pub snippet: String,
    pub host: String,
}

/// 搜索诊断（仅 debug=true 时返回）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchDebugItem {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

/// 搜索诊断信息（用于定位解析失败、反爬拦截等问题）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchDebugInfo {
    pub enabled: bool,
    pub attempted_engines: Vec<String>,
    pub fallback_reason: Option<String>,
    pub page_url: Option<String>,
    pub ready_state: Option<String>,
    pub result_heading_count: Option<u32>,
    pub anchor_count: Option<u32>,
    pub blocked_hint: Option<bool>,
    pub raw_items_count: u32,
    pub filtered_items_count: u32,
    pub raw_items_preview: Vec<WebSearchDebugItem>,
    pub body_text_sample: Option<String>,
    pub search_root_html_sample: Option<String>,
    pub notes: Vec<String>,
}

/// 搜索结果聚合
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchResult {
    pub engine: String,
    pub query: String,
    pub search_url: String,
    pub start: u32,
    pub limit: u32,
    pub total_found: u32,
    pub returned_count: u32,
    pub blocked: bool,
    pub page_title: String,
    pub items: Vec<WebSearchItem>,
    pub searched_at: String,
    pub warnings: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires_human_verification: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_engine: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub debug: Option<WebSearchDebugInfo>,
}
