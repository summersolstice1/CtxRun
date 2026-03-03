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
