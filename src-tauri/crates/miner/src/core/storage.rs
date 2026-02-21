use std::path::{Path, PathBuf};
use chrono::Utc;
use crate::models::PageResult;
use crate::error::Result;

// 子目录名称，用于存放抓取的文档
const MINER_OUTPUT_DIR: &str = "ctxrun_docs";

/// 将 URL 安全地转换为本地文件名
fn url_to_filename(url: &str) -> String {
    let no_protocol = url.replace("https://", "").replace("http://", "");
    let mut safe_name = sanitize_filename::sanitize(&no_protocol);

    // 如果文件名太长，截断它
    if safe_name.len() > 100 {
        safe_name = safe_name[..100].to_string();
    }

    if safe_name.is_empty() {
        safe_name = "index".to_string();
    }

    format!("{}.md", safe_name.replace(' ', "_"))
}

/// 保存结果到磁盘
pub fn save_markdown(output_dir: &str, result: &PageResult) -> Result<PathBuf> {
    // 在输出目录下创建 ctxrun_docs 子目录
    let base_path = Path::new(output_dir);
    let miner_dir = base_path.join(MINER_OUTPUT_DIR);

    if !miner_dir.exists() {
        std::fs::create_dir_all(&miner_dir)?;
    }

    let filename = url_to_filename(&result.url);
    let file_path = miner_dir.join(filename);

    let now = Utc::now().to_rfc3339();

    // 构造大模型极易读取的 YAML Frontmatter
    let content = format!(
        "---\n\
        title: \"{}\"\n\
        source_url: \"{}\"\n\
        crawled_at: \"{}\"\n\
        ---\n\n\
        {}",
        result.title.replace('"', "\\\""), // 简单转义引号
        result.url,
        now,
        result.markdown
    );

    std::fs::write(&file_path, content)?;

    Ok(file_path)
}
