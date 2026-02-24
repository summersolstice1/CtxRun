use headless_chrome::Tab;
use std::sync::Arc;
use std::time::Duration;
use crate::error::{MinerError, Result};
use crate::models::PageResult;

const READABILITY_JS: &str = include_str!("../../assets/Readability.js");
const TURNDOWN_JS: &str = include_str!("../../assets/turndown.js");
const TURNDOWN_GFM_JS: &str = include_str!("../../assets/turndown-plugin-gfm.js");
const EXTRACT_JS: &str = include_str!("../../assets/extract.js");

pub fn extract_page(tab: &Arc<Tab>, url: &str) -> Result<PageResult> {
    tab.navigate_to(url)
        .map_err(|e| MinerError::BrowserError(format!("Navigation failed: {}", e)))?;

    let _ = tab.wait_until_navigated();

    // V1 优化：移除 1500ms sleep，仅保留 100ms 让出时间片
    let _ = tab.evaluate("window.scrollTo(0, document.body.scrollHeight);", false);
    std::thread::sleep(Duration::from_millis(100));

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

    let evaluation_result = tab.evaluate(&full_script, true)
        .map_err(|e| MinerError::BrowserError(format!("Execution failed: {}", e)))?;

    if let Some(val) = evaluation_result.value {
        let val_str = val.as_str().ok_or_else(|| MinerError::ExtractionError("Expected string from evaluation".into()))?;

        let parsed: serde_json::Value = serde_json::from_str(val_str)
            .map_err(|e| MinerError::SystemError(format!("Failed to parse JSON result: {}", e)))?;

        if let Some(err_msg) = parsed.get("error").and_then(|e| e.as_str()) {
            return Err(MinerError::ExtractionError(err_msg.to_string()));
        }

        let result: PageResult = serde_json::from_value(parsed)
            .map_err(|e| MinerError::SystemError(format!("Failed to deserialize into PageResult: {}", e)))?;

        Ok(result)
    } else {
        Err(MinerError::ExtractionError("No value returned from evaluation (null)".into()))
    }
}
