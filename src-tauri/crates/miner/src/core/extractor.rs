// src-tauri/crates/miner/src/core/extractor.rs
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
    println!("[Miner] Navigating to: {}", url);

    tab.navigate_to(url)
        .map_err(|e| MinerError::BrowserError(format!("Navigation failed: {}", e)))?;

    if let Err(e) = tab.wait_until_navigated() {
        println!("[Miner] Wait navigated timeout: {}", e);
    }

    // 深度等待，确保 SPA 页面渲染完毕
    std::thread::sleep(Duration::from_millis(2000));
    let _ = tab.evaluate("window.scrollTo(0, document.body.scrollHeight);", false);
    std::thread::sleep(Duration::from_millis(500));

    // 使用 IIFE 包裹所有逻辑，并将 module/exports 设为 undefined，防止冲突
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
                // 若出现异常，包装为带有 error 字段的 JSON 字符串返回
                return JSON.stringify({{ error: e.toString(), stack: e.stack }});
            }}
        }})()
        "#,
        READABILITY_JS, TURNDOWN_JS, TURNDOWN_GFM_JS, EXTRACT_JS
    );

    let evaluation_result = tab.evaluate(&full_script, true)
        .map_err(|e| MinerError::BrowserError(format!("Execution failed: {}", e)))?;

    // 解析返回值
    if let Some(val) = evaluation_result.value {
        // 因为我们在 JS 中返回的是 JSON.stringify()，所以这里一定是个 String
        let val_str = val.as_str().ok_or_else(|| MinerError::ExtractionError("Expected string from evaluation".into()))?;

        // 反序列化 JSON 字符串
        let parsed: serde_json::Value = serde_json::from_str(val_str)
            .map_err(|e| MinerError::SystemError(format!("Failed to parse JSON result: {}", e)))?;

        // 检查 JS 内部是否抛出了错误
        if let Some(err_msg) = parsed.get("error").and_then(|e| e.as_str()) {
            return Err(MinerError::ExtractionError(err_msg.to_string()));
        }

        // 成功转换为模型
        let result: PageResult = serde_json::from_value(parsed)
            .map_err(|e| MinerError::SystemError(format!("Failed to deserialize into PageResult: {}", e)))?;

        Ok(result)
    } else {
        Err(MinerError::ExtractionError("No value returned from evaluation (null)".into()))
    }
}
