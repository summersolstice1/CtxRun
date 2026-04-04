use crate::core::driver::MinerDriver;
use crate::core::extractor::extract_page_with_timeout;
use crate::core::scope::normalize_url;
use crate::core::storage::save_markdown;
use crate::error::{MinerError, Result};
use crate::models::{PageResult, SinglePageRequest, SinglePageResult};
use chromiumoxide::Page;
use chrono::Utc;
use std::net::IpAddr;
use std::time::Duration;
use url::Url;

const DEFAULT_SINGLE_PAGE_TIMEOUT_MS: u64 = 45_000;
const MIN_SINGLE_PAGE_TIMEOUT_MS: u64 = 1_000;
const MAX_SINGLE_PAGE_TIMEOUT_MS: u64 = 120_000;

fn is_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || v4.is_multicast()
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_unique_local()
                || v6.is_unicast_link_local()
                || v6.is_multicast()
        }
    }
}

fn validate_target_url(raw: &str) -> Result<()> {
    let parsed = Url::parse(raw)
        .map_err(|e| MinerError::SystemError(format!("Invalid URL '{}': {}", raw, e)))?;

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(MinerError::SystemError(
            "Only http/https URLs are allowed.".into(),
        ));
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| MinerError::SystemError(format!("URL missing host: {}", raw)))?;

    if host.eq_ignore_ascii_case("localhost") || host.ends_with(".local") {
        return Err(MinerError::SystemError(
            "Local network targets are not allowed.".into(),
        ));
    }

    if let Ok(ip) = host.parse::<IpAddr>()
        && is_blocked_ip(ip)
    {
        return Err(MinerError::SystemError(
            "Private or loopback IP targets are not allowed.".into(),
        ));
    }

    Ok(())
}

fn resolve_timeout(timeout_ms: Option<u64>) -> (Duration, Option<String>) {
    let requested = timeout_ms.unwrap_or(DEFAULT_SINGLE_PAGE_TIMEOUT_MS);
    let clamped = requested.clamp(MIN_SINGLE_PAGE_TIMEOUT_MS, MAX_SINGLE_PAGE_TIMEOUT_MS);
    let warning = if requested != clamped {
        Some(format!(
            "timeoutMs clamped to {}ms (allowed range: {}-{}ms).",
            clamped, MIN_SINGLE_PAGE_TIMEOUT_MS, MAX_SINGLE_PAGE_TIMEOUT_MS
        ))
    } else {
        None
    };
    (Duration::from_millis(clamped), warning)
}

fn require_output_dir(request: &SinglePageRequest) -> Result<&str> {
    request
        .output_dir
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| {
            MinerError::SystemError("outputDir is required when saveToDisk is true.".into())
        })
}

/// 基于指定 Page 执行单页提取（供多页调度和公共命令复用）
pub async fn extract_single_page_with_page(
    page: &Page,
    request: &SinglePageRequest,
) -> Result<SinglePageResult> {
    let normalized_url = normalize_url(request.url.trim());
    validate_target_url(&normalized_url)?;

    let include_links = request.include_links.unwrap_or(true);
    let save_to_disk = request.save_to_disk.unwrap_or(false);
    let (timeout, timeout_warning) = resolve_timeout(request.timeout_ms);

    let page_result = extract_page_with_timeout(page, &normalized_url, timeout).await?;
    build_single_page_result(
        page_result,
        include_links,
        save_to_disk,
        request,
        timeout_warning,
    )
}

fn build_single_page_result(
    page_result: PageResult,
    include_links: bool,
    save_to_disk: bool,
    request: &SinglePageRequest,
    timeout_warning: Option<String>,
) -> Result<SinglePageResult> {
    let mut warnings = Vec::new();
    if let Some(w) = timeout_warning {
        warnings.push(w);
    }
    if !include_links {
        warnings.push("links omitted because includeLinks=false.".to_string());
    }

    let saved_path = if save_to_disk {
        let output_dir = require_output_dir(request)?;
        Some(
            save_markdown(output_dir, &page_result)?
                .to_string_lossy()
                .to_string(),
        )
    } else {
        None
    };

    let PageResult {
        url,
        title,
        markdown,
        links,
    } = page_result;

    Ok(SinglePageResult {
        url,
        title,
        markdown,
        links: if include_links { links } else { Vec::new() },
        crawled_at: Utc::now().to_rfc3339(),
        saved_path,
        warnings,
    })
}

/// 公共单页抓取入口：输入 URL，输出提取内容（可选落盘）
pub async fn extract_single_page(request: SinglePageRequest) -> Result<SinglePageResult> {
    let mut driver = MinerDriver::new().await?;

    let extraction_result = async {
        let page = driver.new_page().await?;
        extract_single_page_with_page(&page, &request).await
    }
    .await;

    driver.shutdown().await;
    extraction_result
}
