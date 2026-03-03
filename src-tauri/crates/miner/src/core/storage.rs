//! Miner storage module - hierarchical file storage mirroring URL structure.

use chrono::Utc;
use std::path::{Path, PathBuf};
use url::Url;

use crate::error::{MinerError, Result};
use crate::models::PageResult;

const MINER_OUTPUT_DIR: &str = "ctxrun_docs";

fn html_to_markdown_path(path: &str) -> String {
    if path.ends_with(".html") {
        path.trim_end_matches(".html").to_string() + ".md"
    } else if path.ends_with(".htm") {
        path.trim_end_matches(".htm").to_string() + ".md"
    } else if !path.contains('.') {
        let trimmed = path.trim_end_matches('/');
        if trimmed.is_empty() {
            "index.md".to_string()
        } else {
            format!("{}/index.md", trimmed)
        }
    } else {
        format!("{}.md", path)
    }
}

fn sanitize_path_segment(segment: &str) -> String {
    let sanitized = sanitize_filename::sanitize(segment);
    if sanitized.is_empty() || sanitized == "." {
        "index".to_string()
    } else {
        sanitized
    }
}

fn url_to_filepath(url: &str) -> Result<PathBuf> {
    let parsed = Url::parse(url)
        .map_err(|e| MinerError::SystemError(format!("Invalid URL '{}': {}", url, e)))?;

    let domain = parsed
        .host_str()
        .ok_or_else(|| MinerError::SystemError(format!("URL missing host: {}", url)))?;

    let path = parsed.path();
    let markdown_path = html_to_markdown_path(path);

    let mut relative_path = PathBuf::from(domain);

    for segment in markdown_path.split('/') {
        if !segment.is_empty() {
            relative_path.push(sanitize_path_segment(segment));
        }
    }

    if relative_path.extension().is_none() && relative_path.file_name().is_some() {
        relative_path.push("index.md");
    }

    Ok(relative_path)
}

pub fn save_markdown(output_dir: &str, result: &PageResult) -> Result<PathBuf> {
    let base_path = Path::new(output_dir);
    let miner_dir = base_path.join(MINER_OUTPUT_DIR);

    let relative_path = url_to_filepath(&result.url)?;
    let file_path = miner_dir.join(&relative_path);

    if let Some(parent_dir) = file_path.parent() {
        std::fs::create_dir_all(parent_dir).map_err(|e| {
            MinerError::SystemError(format!(
                "Failed to create directory '{}': {}",
                parent_dir.display(),
                e
            ))
        })?;
    }

    let now = Utc::now().to_rfc3339();
    let content = build_markdown_content(result, &now);

    std::fs::write(&file_path, content).map_err(|e| {
        MinerError::SystemError(format!(
            "Failed to write file '{}': {}",
            file_path.display(),
            e
        ))
    })?;

    Ok(file_path)
}

fn build_markdown_content(result: &PageResult, crawled_at: &str) -> String {
    let escaped_title = result.title.replace('\\', "\\\\").replace('"', "\\\"");

    format!(
        "---\n\
         title: \"{}\"\n\
         source_url: \"{}\"\n\
         crawled_at: \"{}\"\n\
         ---\n\n\
         {}",
        escaped_title, result.url, crawled_at, result.markdown
    )
}
