use chromiumoxide::Page;
use std::time::Duration;
use crate::error::{MinerError, Result};
use crate::models::PageResult;
use super::postprocess::post_process_markdown;

const READABILITY_JS: &str = include_str!("../../assets/Readability.js");
const TURNDOWN_JS: &str = include_str!("../../assets/turndown.js");
const TURNDOWN_GFM_JS: &str = include_str!("../../assets/turndown-plugin-gfm.js");
const EXTRACT_JS: &str = include_str!("../../assets/extract.js");
const EXTRACT_TIMEOUT: Duration = Duration::from_secs(45);
const RENDER_SETTLE_POLL_MS: u64 = 120;
const RENDER_SETTLE_MAX_POLLS: u32 = 12;

pub async fn extract_page(page: &Page, url: &str) -> Result<PageResult> {
    tokio::time::timeout(EXTRACT_TIMEOUT, async {
        page.goto(url)
            .await
            .map_err(|e| MinerError::BrowserError(format!("Navigation failed: {}", e)))?;

        let _ = page.evaluate("window.scrollTo(0, document.body.scrollHeight);").await;
        wait_for_render_settle(page).await;

        let full_script = format!(
            r#"
            (async function() {{
                try {{
                    let module = undefined;
                    let exports = undefined;
                    {}
                    {}
                    {}
                    {}
                    return await executeCtxRunExtraction();
                }} catch (e) {{
                    return JSON.stringify({{ error: e.toString(), stack: e.stack }});
                }}
            }})()
            "#,
            READABILITY_JS, TURNDOWN_JS, TURNDOWN_GFM_JS, EXTRACT_JS
        );

        let evaluation_result = page.evaluate(full_script)
            .await
            .map_err(|e| MinerError::BrowserError(format!("Execution failed: {}", e)))?;

        let val_str: String = evaluation_result
            .into_value()
            .map_err(|e| MinerError::ExtractionError(format!("Expected string from evaluation: {}", e)))?;

        let parsed: serde_json::Value = serde_json::from_str(&val_str)
            .map_err(|e| MinerError::SystemError(format!("Failed to parse JSON result: {}", e)))?;

        if let Some(err_msg) = parsed.get("error").and_then(|e| e.as_str()) {
            let stack = parsed
                .get("stack")
                .and_then(|s| s.as_str())
                .unwrap_or_default();
            let detail = if stack.is_empty() {
                err_msg.to_string()
            } else {
                format!("{}\n{}", err_msg, stack)
            };
            return Err(MinerError::ExtractionError(detail));
        }

        let mut result: PageResult = serde_json::from_value(parsed)
            .map_err(|e| MinerError::SystemError(format!("Failed to deserialize into PageResult: {}", e)))?;

        result.markdown = post_process_markdown(&result.markdown);

        Ok(result)
    })
    .await
    .map_err(|_| MinerError::BrowserError(format!(
        "Extraction timed out after {}s: {}",
        EXTRACT_TIMEOUT.as_secs(),
        url
    )))?
}

async fn wait_for_render_settle(page: &Page) {
    let mut stable_rounds = 0u32;
    let mut last_height: Option<f64> = None;

    for _ in 0..RENDER_SETTLE_MAX_POLLS {
        let ready_state = page
            .evaluate("document.readyState")
            .await
            .ok()
            .and_then(|v| v.into_value::<String>().ok())
            .unwrap_or_default();

        let current_height = page
            .evaluate("document.body ? document.body.scrollHeight : 0")
            .await
            .ok()
            .and_then(|v| v.into_value::<f64>().ok())
            .unwrap_or(0.0);

        let height_stable = last_height
            .map(|prev| (prev - current_height).abs() < 1.0)
            .unwrap_or(false);

        if ready_state == "complete" && height_stable {
            stable_rounds += 1;
            if stable_rounds >= 2 {
                break;
            }
        } else {
            stable_rounds = 0;
        }

        last_height = Some(current_height);
        tokio::time::sleep(Duration::from_millis(RENDER_SETTLE_POLL_MS)).await;
    }
}
