//! Browser automation layer built on headless_chrome.
//!
//! Provides a high-level, sync API for interacting with an externally-launched
//! Chrome/Edge browser via CDP. Designed to be called from `spawn_blocking`.

use std::sync::Arc;
use std::time::Duration;
use headless_chrome::{Browser, Tab};
use headless_chrome::browser::tab::ModifierKey;
use ctxrun_browser_utils::{
    locate_browser, BrowserType as UtilsBrowserType,
    app_chrome_data_dir, is_debug_port_available, is_browser_running, kill_browser_processes,
};
use crate::error::{AutomatorError, Result};

const DEFAULT_DEBUG_PORT: u16 = 9222;
const ELEMENT_WAIT_TIMEOUT: Duration = Duration::from_secs(5);
const BROWSER_IDLE_TIMEOUT: Duration = Duration::from_secs(120);

// ---------------------------------------------------------------------------
// TabSession — operations on a single tab
// ---------------------------------------------------------------------------

/// High-level wrapper around a single browser tab for automation actions.
pub struct TabSession {
    tab: Arc<Tab>,
    _browser: Browser, // Must keep Browser alive to maintain the WebSocket connection
}

impl TabSession {
    /// Connect to the default port and find a tab matching the optional filter.
    pub fn connect_and_find(url_filter: Option<&str>) -> Result<Self> {
        // Query the /json endpoint to get list of all targets (tabs)
        let url = format!("http://127.0.0.1:{}/json", DEFAULT_DEBUG_PORT);
        let targets: Vec<serde_json::Value> = reqwest::blocking::Client::new()
            .get(&url)
            .timeout(Duration::from_secs(5))
            .send()
            .and_then(|r| r.json())
            .map_err(|e| AutomatorError::BrowserError(format!("Failed to connect to debug port: {}. Make sure Chrome is running with --remote-debugging-port={}", e, DEFAULT_DEBUG_PORT)))?;

        // Find a matching "page" type target
        let page_target = targets.iter()
            .find(|t| {
                let is_page = t["type"].as_str() == Some("page");
                let has_ws = t["webSocketDebuggerUrl"].is_string();
                let matches_filter = match url_filter {
                    Some(filter) => {
                        let url = t["url"].as_str().unwrap_or("");
                        let title = t["title"].as_str().unwrap_or("");
                        url.contains(filter) || title.contains(filter)
                    }
                    None => true
                };
                is_page && has_ws && matches_filter
            })
            .ok_or_else(|| AutomatorError::BrowserError("No matching page tab found. Please open a web page in the browser.".into()))?;

        let ws_url = page_target["webSocketDebuggerUrl"]
            .as_str()
            .ok_or_else(|| AutomatorError::BrowserError("No webSocketDebuggerUrl found in page target".into()))?
            .to_string();

        // Connect directly to the page's WebSocket
        let browser = Browser::connect_with_timeout(ws_url, BROWSER_IDLE_TIMEOUT)
            .map_err(|e| AutomatorError::BrowserError(format!("Failed to connect to page: {}", e)))?;

        // Wait a moment for the tab info to sync, then find the tab
        std::thread::sleep(Duration::from_millis(500));

        // Register any missing tabs
        let _ = browser.register_missing_tabs();

        let tab = {
            let tabs = browser.get_tabs().lock()
                .map_err(|e| AutomatorError::BrowserError(format!("Lock poisoned: {}", e)))?;
            tabs.first().cloned()
        }; // tabs lock is dropped here

        let tab = tab.ok_or_else(|| AutomatorError::BrowserError(
            "No tab available after connection. Please ensure the browser has an open page.".into()
        ))?;

        Ok(Self { tab, _browser: browser })
    }

    // -- Element interaction ------------------------------------------------

    /// Wait for an element matching `selector` to appear, then return its
    /// viewport center coordinates (x, y).
    pub fn get_element_center(&self, selector: &str) -> Result<(i32, i32)> {
        let element = self.tab
            .wait_for_element_with_custom_timeout(selector, ELEMENT_WAIT_TIMEOUT)
            .map_err(|e| AutomatorError::BrowserError(format!("Element not found '{}': {}", selector, e)))?;

        element.scroll_into_view()
            .map_err(|e| AutomatorError::BrowserError(format!("Scroll failed: {}", e)))?;

        std::thread::sleep(Duration::from_millis(80));

        let midpoint = element.get_js_midpoint()
            .map_err(|e| AutomatorError::BrowserError(format!("Midpoint failed: {}", e)))?;

        Ok((midpoint.x as i32, midpoint.y as i32))
    }

    /// Click an element by CSS selector using CDP mouse events.
    pub fn click_element(&self, selector: &str) -> Result<()> {
        let element = self.tab
            .wait_for_element_with_custom_timeout(selector, ELEMENT_WAIT_TIMEOUT)
            .map_err(|e| AutomatorError::BrowserError(format!("Element not found '{}': {}", selector, e)))?;

        element.scroll_into_view()
            .map_err(|e| AutomatorError::BrowserError(format!("Scroll failed: {}", e)))?;

        element.click()
            .map_err(|e| AutomatorError::BrowserError(format!("Click failed: {}", e)))?;

        Ok(())
    }

    /// Type text into an element by CSS selector.
    pub fn type_into_element(&self, selector: &str, text: &str) -> Result<()> {
        let element = self.tab
            .wait_for_element_with_custom_timeout(selector, ELEMENT_WAIT_TIMEOUT)
            .map_err(|e| AutomatorError::BrowserError(format!("Element not found '{}': {}", selector, e)))?;

        element.click()
            .map_err(|e| AutomatorError::BrowserError(format!("Focus click failed: {}", e)))?;

        self.tab.type_str(text)
            .map_err(|e| AutomatorError::BrowserError(format!("Type failed: {}", e)))?;

        Ok(())
    }

    /// Simulate a key press (e.g. "Enter", "Tab", "Escape").
    pub fn press_key(&self, key: &str) -> Result<()> {
        self.tab.press_key(key)
            .map_err(|e| AutomatorError::BrowserError(format!("Key press '{}' failed: {}", key, e)))?;
        Ok(())
    }

    /// Simulate a key combination like "Ctrl+A", "Ctrl+C".
    pub fn press_key_combo(&self, combo: &str) -> Result<()> {
        let parts: Vec<&str> = combo.split('+').map(|s| s.trim()).collect();
        let mut modifiers = Vec::new();
        let mut main_key = None;

        for part in &parts {
            match part.to_lowercase().as_str() {
                "ctrl" | "control" => modifiers.push(ModifierKey::Ctrl),
                "alt" => modifiers.push(ModifierKey::Alt),
                "shift" => modifiers.push(ModifierKey::Shift),
                "meta" | "cmd" | "command" => modifiers.push(ModifierKey::Meta),
                other => main_key = Some(other.to_string()),
            }
        }

        if let Some(key) = main_key {
            self.tab.press_key_with_modifiers(&key, Some(&modifiers))
                .map_err(|e| AutomatorError::BrowserError(format!("Key combo failed: {}", e)))?;
        }

        Ok(())
    }

    /// Evaluate a JavaScript expression and return the result as a string.
    pub fn evaluate_js(&self, expression: &str) -> Result<String> {
        let result = self.tab.evaluate(expression, true)
            .map_err(|e| AutomatorError::BrowserError(format!("JS eval failed: {}", e)))?;

        match result.value {
            Some(val) => Ok(val.to_string()),
            None => Ok(String::new()),
        }
    }
    /// Interactive element picker: injects a visual overlay into the page,
    /// lets the user click an element, and returns its CSS selector.
    pub fn pick_element(&self) -> Result<String> {
        let picker_js = r#"
            (function() {
                window.__ctxrun_picked_result = '';
                const styleId = '__ctxrun_picker_style';
                if (document.getElementById(styleId)) return;

                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = '.__ctxrun_hover { outline: 2px solid red !important; outline-offset: -2px; }';
                document.head.appendChild(style);

                function buildSelector(el) {
                    if (el.id) return '#' + CSS.escape(el.id);
                    let path = [];
                    let cur = el;
                    while (cur && cur !== document.body && cur !== document.documentElement) {
                        let seg = cur.tagName.toLowerCase();
                        if (cur.className && typeof cur.className === 'string') {
                            const cls = cur.className.trim().split(/\s+/)
                                .filter(c => !c.startsWith('__ctxrun')).slice(0, 2)
                                .map(c => '.' + CSS.escape(c)).join('');
                            if (cls) seg += cls;
                        }
                        if (!cur.id && cur.parentElement) {
                            const sibs = Array.from(cur.parentElement.children).filter(c => c.tagName === cur.tagName);
                            if (sibs.length > 1) seg += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
                        }
                        path.unshift(seg);
                        cur = cur.parentElement;
                    }
                    return path.join(' > ');
                }

                let lastEl = null;
                function onMove(e) {
                    if (lastEl) lastEl.classList.remove('__ctxrun_hover');
                    e.target.classList.add('__ctxrun_hover');
                    lastEl = e.target;
                    e.stopPropagation(); e.preventDefault();
                }
                function onClick(e) {
                    e.stopPropagation(); e.preventDefault();
                    if (lastEl) lastEl.classList.remove('__ctxrun_hover');
                    window.__ctxrun_picked_result = buildSelector(e.target);
                    document.removeEventListener('mousemove', onMove, true);
                    document.removeEventListener('mousedown', onClick, true);
                    const s = document.getElementById(styleId);
                    if (s) s.remove();
                }
                document.addEventListener('mousemove', onMove, true);
                document.addEventListener('mousedown', onClick, true);
            })()
        "#;

        self.tab.evaluate(picker_js, false)
            .map_err(|e| AutomatorError::BrowserError(format!("Picker injection failed: {}", e)))?;

        // Poll for result (user clicks an element in the browser)
        for _ in 0..600 {
            std::thread::sleep(Duration::from_millis(100));

            let result = self.tab.evaluate("window.__ctxrun_picked_result || ''", false)
                .map_err(|e| AutomatorError::BrowserError(format!("Poll failed: {}", e)))?;

            if let Some(val) = result.value {
                if let Some(s) = val.as_str() {
                    if !s.is_empty() {
                        let _ = self.tab.evaluate("delete window.__ctxrun_picked_result;", false);
                        return Ok(s.to_string());
                    }
                }
            }
        }

        Err(AutomatorError::BrowserError("Picker timeout (60s)".into()))
    }
}

// ---------------------------------------------------------------------------
// Browser launcher — start a new browser with debugging enabled
// ---------------------------------------------------------------------------

/// Launch a browser with `--remote-debugging-port` for automation.
pub fn launch_debug_browser(
    is_edge: bool,
    url: Option<String>,
    use_temp_profile: bool,
) -> std::result::Result<(), String> {
    use std::process::Command;

    if is_debug_port_available(DEFAULT_DEBUG_PORT) {
        return Ok(());
    }

    let target = if is_edge { UtilsBrowserType::Edge } else { UtilsBrowserType::Chrome };
    let exe_path = locate_browser(target)
        .ok_or_else(|| format!("Browser {:?} not found", target))?;

    if is_browser_running(target) {
        kill_browser_processes(target)?;
    }

    let mut cmd = Command::new(exe_path);
    cmd.arg(format!("--remote-debugging-port={}", DEFAULT_DEBUG_PORT));
    cmd.arg("--no-first-run");
    cmd.arg("--no-default-browser-check");

    let base_dir = app_chrome_data_dir();
    if use_temp_profile {
        cmd.arg(format!("--user-data-dir={}", base_dir.join("temp").to_string_lossy()));
    } else {
        cmd.arg(format!("--user-data-dir={}", base_dir.join("persistent").to_string_lossy()));
    }

    cmd.arg(url.unwrap_or_else(|| "about:blank".into()));

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x00000008;
        cmd.creation_flags(DETACHED_PROCESS);
    }

    cmd.spawn().map_err(|e| format!("Failed to launch browser: {}", e))?;

    for i in 0..10 {
        std::thread::sleep(Duration::from_millis(500));
        if is_debug_port_available(DEFAULT_DEBUG_PORT) {
            return Ok(());
        }
        if i == 9 {
            return Err("Browser started but debug port is not available after 5 seconds. This may be a Chrome profile lock issue.".into());
        }
    }

    Ok(())
}
