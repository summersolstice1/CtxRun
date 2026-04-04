//! Browser automation layer built on chromiumoxide.
//!
//! Provides a high-level async API for interacting with an externally-launched
//! Chrome/Edge browser via CDP.

use std::time::Duration;

use chromiumoxide::{
    Browser, Element, Page,
    cdp::browser_protocol::{
        input::{DispatchKeyEventParams, DispatchKeyEventType},
        target::{ActivateTargetParams, TargetId, TargetInfo},
    },
    keys::{self, KeyDefinition},
};
use ctxrun_browser_utils::{
    BrowserType as UtilsBrowserType, launch_debug_browser as launch_debug_browser_shared,
};
use futures::StreamExt;
use regex::Regex;
use tauri::async_runtime::JoinHandle;
use tokio::sync::oneshot;

use crate::{
    error::{AutomatorError, Result},
    models::PickedWebTarget,
};

const DEFAULT_DEBUG_PORT: u16 = 9222;
const ELEMENT_WAIT_TIMEOUT: Duration = Duration::from_secs(5);
// Poll cadence for selector wait. Keep short enough for responsiveness without busy polling.
const ELEMENT_WAIT_POLL_INTERVAL: Duration = Duration::from_millis(120);
// Allow a short settle window after initial connect before fetching targets.
const TARGET_SYNC_WAIT: Duration = Duration::from_millis(250);
// Retry target/page acquisition to tolerate startup races in remote-debug sessions.
const TARGET_FETCH_RETRIES: usize = 8;
const TARGET_FETCH_RETRY_DELAY: Duration = Duration::from_millis(200);
const PAGE_FETCH_RETRIES: usize = 12;
const PAGE_FETCH_RETRY_DELAY: Duration = Duration::from_millis(120);
const MAX_FOCUS_CHECK_TABS: usize = 6;
const DEFAULT_NAVIGATION_TIMEOUT: Duration = Duration::from_secs(15);
const WAIT_POLL_INTERVAL: Duration = Duration::from_millis(120);
const NAVIGATION_STABLE_ROUNDS_REQUIRED: u32 = 2;
// Interactive picker waits up to 60s for a human click.
const PICKER_POLL_INTERVAL: Duration = Duration::from_millis(100);
const PICKER_MAX_POLLS: usize = 600;
const ACTIVE_PAGE_CHECK_TOKEN: &str = "__ctxrun_active__";
const ACTIVE_PAGE_CHECK_JS: &str = r#"
    (() => {
        try {
            if (typeof document === 'undefined') return '';
            const visible = document.visibilityState === 'visible';
            const focused = typeof document.hasFocus === 'function' ? document.hasFocus() : false;
            return (visible && focused) ? '__ctxrun_active__' : '';
        } catch (_) {
            return '';
        }
    })()
"#;

#[derive(Debug, Clone, Copy)]
pub enum NavigationWaitUntil {
    DomContentLoaded,
    Load,
    NetworkIdle,
}

#[derive(Debug, Clone, Copy)]
pub enum SelectorWaitState {
    Attached,
    Visible,
    Hidden,
}

#[derive(Debug, Clone, Copy)]
pub enum UrlMatchMode {
    Contains,
    Equals,
    Regex,
}

#[derive(Debug, Clone, Copy)]
pub enum TabSwitchStrategy {
    LastOpened,
    Index,
    UrlContains,
    TitleContains,
}

// ---------------------------------------------------------------------------
// TabSession — operations on a single tab
// ---------------------------------------------------------------------------

/// High-level wrapper around a single browser tab for automation actions.
pub struct TabSession {
    page: Page,
    _browser: Browser, // Keep browser alive to maintain CDP connection
    handler_task: Option<JoinHandle<()>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

impl Drop for TabSession {
    fn drop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(task) = self.handler_task.take() {
            task.abort();
        }
    }
}

struct BrowserConnection {
    browser: Option<Browser>,
    handler_task: Option<JoinHandle<()>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

impl BrowserConnection {
    async fn connect() -> Result<Self> {
        let debug_url = format!("http://127.0.0.1:{DEFAULT_DEBUG_PORT}");
        let (browser, mut handler) = Browser::connect(debug_url).await.map_err(|e| {
            AutomatorError::BrowserError(format!(
                "Failed to connect to debug port: {}. Make sure Chrome is running with --remote-debugging-port={}",
                e, DEFAULT_DEBUG_PORT
            ))
        })?;

        let (shutdown_tx, mut shutdown_rx) = oneshot::channel();
        let handler_task = tauri::async_runtime::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => {
                        break;
                    }
                    event = handler.next() => {
                        match event {
                            Some(Ok(_)) => {}
                            Some(Err(err)) => {
                                eprintln!("[Automator] Browser handler stopped: {}", err);
                                break;
                            }
                            None => break,
                        }
                    }
                }
            }
        });

        Ok(Self {
            browser: Some(browser),
            handler_task: Some(handler_task),
            shutdown_tx: Some(shutdown_tx),
        })
    }

    fn browser_ref(&self, context: &str) -> Result<&Browser> {
        self.browser.as_ref().ok_or_else(|| {
            AutomatorError::BrowserError(format!("Browser connection unavailable {}", context))
        })
    }

    fn browser_mut(&mut self, context: &str) -> Result<&mut Browser> {
        self.browser.as_mut().ok_or_else(|| {
            AutomatorError::BrowserError(format!("Browser connection unavailable {}", context))
        })
    }

    fn into_tab_session(mut self, page: Page) -> Result<TabSession> {
        let browser = self.browser.take().ok_or_else(|| {
            AutomatorError::BrowserError(
                "Browser connection unavailable while creating tab session".into(),
            )
        })?;
        Ok(TabSession {
            page,
            _browser: browser,
            handler_task: self.handler_task.take(),
            shutdown_tx: self.shutdown_tx.take(),
        })
    }
}

impl Drop for BrowserConnection {
    fn drop(&mut self) {
        cleanup_handler_task(&mut self.shutdown_tx, &mut self.handler_task);
    }
}

impl TabSession {
    /// Connect to the debug port and find a tab matching the optional filter.
    pub async fn connect_and_find(url_filter: Option<&str>) -> Result<Self> {
        let normalized_filter = url_filter.and_then(|raw| {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        });

        let mut connection = BrowserConnection::connect().await?;

        tokio::time::sleep(TARGET_SYNC_WAIT).await;

        let browser = connection.browser_mut("while finding target")?;
        let target = match find_target_with_retry(browser, normalized_filter).await {
            Ok(target) => target,
            Err(err) => {
                cleanup_handler_task(&mut connection.shutdown_tx, &mut connection.handler_task);
                return Err(err);
            }
        };
        let browser = connection.browser_ref("while attaching page")?;
        let page = match get_page_with_retry(browser, target.target_id).await {
            Ok(page) => page,
            Err(err) => {
                cleanup_handler_task(&mut connection.shutdown_tx, &mut connection.handler_task);
                return Err(err);
            }
        };
        let _ = page.bring_to_front().await;

        connection.into_tab_session(page)
    }

    // -- Tab/session management ---------------------------------------------

    /// Open a new tab in the debug browser and bring it to front.
    pub async fn open_new_tab(url: Option<&str>) -> Result<()> {
        let connection = BrowserConnection::connect().await?;
        tokio::time::sleep(TARGET_SYNC_WAIT).await;

        let target_url = sanitize_optional_string(url).unwrap_or_else(|| "about:blank".to_string());
        let browser = connection.browser_ref("while opening new tab")?;
        let page = browser
            .new_page(target_url.as_str())
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Failed to open new tab: {}", e)))?;

        let _ = page.bring_to_front().await;
        Ok(())
    }

    /// Switch to another existing tab and bring it to front.
    pub async fn switch_tab(
        strategy: Option<&str>,
        index: Option<u32>,
        value: Option<&str>,
    ) -> Result<()> {
        let mut connection = BrowserConnection::connect().await?;
        tokio::time::sleep(TARGET_SYNC_WAIT).await;

        let browser = connection.browser_mut("while switching tab")?;
        let candidates = fetch_page_targets_with_retry(browser, None).await?;
        let selected = select_tab_for_switch(&candidates, strategy, index, value)?;
        let browser = connection.browser_ref("while attaching switched tab")?;
        focus_target_with_retry(browser, selected).await?;
        tokio::time::sleep(Duration::from_millis(120)).await;

        Ok(())
    }

    /// Bring the current active tab to front to ensure browser window focus.
    pub async fn focus_current_tab(url_filter: Option<&str>) -> Result<()> {
        let session = Self::connect_and_find(url_filter).await?;
        session.page.bring_to_front().await.map_err(|e| {
            AutomatorError::BrowserError(format!("Failed to focus current tab: {}", e))
        })?;
        Ok(())
    }

    // -- Element interaction ------------------------------------------------

    /// Wait for an element matching `selector` to appear, then return its
    /// viewport center coordinates (x, y).
    pub async fn get_element_center(&self, selector: &str) -> Result<(i32, i32)> {
        let element = wait_for_element(&self.page, selector, ELEMENT_WAIT_TIMEOUT).await?;

        element
            .scroll_into_view()
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Scroll failed: {}", e)))?;

        tokio::time::sleep(Duration::from_millis(80)).await;

        let point = element
            .clickable_point()
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Midpoint failed: {}", e)))?;

        Ok((point.x.round() as i32, point.y.round() as i32))
    }

    /// Click an element by CSS selector using CDP mouse events.
    pub async fn click_element(&self, selector: &str) -> Result<()> {
        enforce_same_tab_click_navigation(&self.page, selector).await;

        let element = wait_for_element(&self.page, selector, ELEMENT_WAIT_TIMEOUT).await?;

        element
            .click()
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Click failed: {}", e)))?;

        Ok(())
    }

    /// Type text into an element by CSS selector.
    pub async fn type_into_element(&self, selector: &str, text: &str) -> Result<()> {
        let element = wait_for_element(&self.page, selector, ELEMENT_WAIT_TIMEOUT).await?;

        element
            .click()
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Focus click failed: {}", e)))?;

        element
            .type_str(text)
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Type failed: {}", e)))?;

        Ok(())
    }

    /// Fill an input-like element by selector. Clears existing value by default.
    pub async fn fill_element(&self, selector: &str, text: &str, clear_first: bool) -> Result<()> {
        let selector_literal = serde_json::to_string(selector).map_err(|e| {
            AutomatorError::BrowserError(format!("Failed to encode selector for fill: {}", e))
        })?;
        let text_literal = serde_json::to_string(text).map_err(|e| {
            AutomatorError::BrowserError(format!("Failed to encode text for fill: {}", e))
        })?;
        let clear_literal = if clear_first { "true" } else { "false" };

        let script = format!(
            r#"(() => {{
                try {{
                    const el = document.querySelector({selector});
                    if (!el) return false;
                    const supportsValue = ('value' in el);
                    if (typeof el.focus === 'function') {{
                        el.focus();
                    }}
                    if (supportsValue && {clear}) {{
                        el.value = '';
                        el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    }}
                    if (supportsValue) {{
                        el.value = {text};
                        el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                        el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                        return true;
                    }}
                    return false;
                }} catch (_) {{
                    return false;
                }}
            }})()"#,
            selector = selector_literal,
            text = text_literal,
            clear = clear_literal
        );

        let js_applied = self
            .page
            .evaluate(script)
            .await
            .ok()
            .and_then(|result| result.into_value::<bool>().ok())
            .unwrap_or(false);

        if js_applied {
            return Ok(());
        }

        let element = wait_for_element(&self.page, selector, ELEMENT_WAIT_TIMEOUT).await?;
        element
            .click()
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Fill focus click failed: {}", e)))?;

        if clear_first {
            let _ = self.press_key_combo("Ctrl+A").await;
            let _ = self.press_key("Backspace").await;
        }

        element
            .type_str(text)
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Fill type failed: {}", e)))?;

        Ok(())
    }

    /// Navigate current tab to URL and wait for requested readiness state.
    pub async fn navigate_to(
        &self,
        url: &str,
        wait_until: Option<&str>,
        timeout: Option<Duration>,
    ) -> Result<()> {
        self.page
            .goto(url)
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Navigation failed: {}", e)))?;
        self.wait_for_navigation_ready(wait_until, timeout).await
    }

    /// Wait until selector reaches a target state.
    pub async fn wait_for_selector_state(
        &self,
        selector: &str,
        state: Option<&str>,
        timeout: Option<Duration>,
    ) -> Result<()> {
        let desired_state = parse_selector_wait_state(state);
        let timeout = timeout.unwrap_or(DEFAULT_NAVIGATION_TIMEOUT);

        if matches!(desired_state, SelectorWaitState::Attached) {
            let _ = wait_for_element(&self.page, selector, timeout).await?;
            return Ok(());
        }

        let selector_literal = serde_json::to_string(selector).map_err(|e| {
            AutomatorError::BrowserError(format!("Failed to encode selector for wait: {}", e))
        })?;
        let script = format!(
            r#"(() => {{
                try {{
                    const el = document.querySelector({selector});
                    if (!el) return 'missing';
                    const style = window.getComputedStyle(el);
                    const rect = el.getBoundingClientRect();
                    const visible = !!style &&
                        style.display !== 'none' &&
                        style.visibility !== 'hidden' &&
                        rect.width > 0 &&
                        rect.height > 0;
                    return visible ? 'visible' : 'hidden';
                }} catch (_) {{
                    return 'missing';
                }}
            }})()"#,
            selector = selector_literal
        );

        let deadline = tokio::time::Instant::now() + timeout;
        loop {
            let current_state = self
                .page
                .evaluate(script.clone())
                .await
                .ok()
                .and_then(|result| result.into_value::<String>().ok())
                .unwrap_or_else(|| "missing".to_string());

            if selector_wait_state_matches(desired_state, &current_state) {
                return Ok(());
            }

            if tokio::time::Instant::now() >= deadline {
                return Err(AutomatorError::BrowserError(format!(
                    "Timeout waiting selector '{}' to become {:?} (last state: {})",
                    selector, desired_state, current_state
                )));
            }

            tokio::time::sleep(WAIT_POLL_INTERVAL).await;
        }
    }

    /// Wait until current URL matches condition.
    pub async fn wait_for_url_match(
        &self,
        value: &str,
        mode: Option<&str>,
        timeout: Option<Duration>,
    ) -> Result<()> {
        let mode = parse_url_match_mode(mode);
        let timeout = timeout.unwrap_or(DEFAULT_NAVIGATION_TIMEOUT);
        let deadline = tokio::time::Instant::now() + timeout;

        loop {
            let current = self.current_url().await?;
            if url_matches(&current, value, mode) {
                return Ok(());
            }

            if tokio::time::Instant::now() >= deadline {
                return Err(AutomatorError::BrowserError(format!(
                    "Timeout waiting URL {:?} '{}'. Last URL: {}",
                    mode, value, current
                )));
            }

            tokio::time::sleep(WAIT_POLL_INTERVAL).await;
        }
    }

    /// Return current page URL.
    pub async fn current_url(&self) -> Result<String> {
        let value = self
            .page
            .evaluate("window.location.href")
            .await
            .map_err(|e| {
                AutomatorError::BrowserError(format!("Failed to read current URL: {}", e))
            })?;
        Ok(value.into_value::<String>().unwrap_or_default())
    }

    /// Assert that selector exists within timeout.
    pub async fn assert_selector_exists(
        &self,
        selector: &str,
        timeout: Option<Duration>,
    ) -> Result<bool> {
        Ok(self
            .wait_for_selector_state(selector, Some("attached"), timeout)
            .await
            .is_ok())
    }

    /// Assert that URL matches expected value with mode.
    pub async fn assert_url_matches(&self, value: &str, mode: Option<&str>) -> Result<bool> {
        let current = self.current_url().await?;
        Ok(url_matches(&current, value, parse_url_match_mode(mode)))
    }

    /// Assert that element text (or full body text) contains substring.
    pub async fn assert_text_contains(
        &self,
        selector: Option<&str>,
        expected: &str,
    ) -> Result<bool> {
        let selector_literal =
            serde_json::to_string(&sanitize_optional_string(selector)).map_err(|e| {
                AutomatorError::BrowserError(format!(
                    "Failed to encode selector for text assert: {}",
                    e
                ))
            })?;
        let expected_literal = serde_json::to_string(expected).map_err(|e| {
            AutomatorError::BrowserError(format!(
                "Failed to encode expected text for assert: {}",
                e
            ))
        })?;

        let script = format!(
            r#"(() => {{
                try {{
                    const selector = {selector};
                    const needle = ({expected} || '').toLowerCase();
                    let content = '';
                    if (selector) {{
                        const el = document.querySelector(selector);
                        if (!el) return false;
                        content = (el.innerText || el.textContent || '').toLowerCase();
                    }} else {{
                        content = ((document.body && (document.body.innerText || document.body.textContent)) || '').toLowerCase();
                    }}
                    return content.includes(needle);
                }} catch (_) {{
                    return false;
                }}
            }})()"#,
            selector = selector_literal,
            expected = expected_literal
        );

        let result = self.page.evaluate(script).await.map_err(|e| {
            AutomatorError::BrowserError(format!("Text assert evaluation failed: {}", e))
        })?;

        Ok(result.into_value::<bool>().unwrap_or(false))
    }

    async fn wait_for_navigation_ready(
        &self,
        wait_until: Option<&str>,
        timeout: Option<Duration>,
    ) -> Result<()> {
        let mode = parse_navigation_wait_until(wait_until);
        let timeout = timeout.unwrap_or(DEFAULT_NAVIGATION_TIMEOUT);
        let deadline = tokio::time::Instant::now() + timeout;
        let mut stable_rounds = 0u32;
        let mut last_height: Option<f64> = None;

        loop {
            let ready_state = self
                .page
                .evaluate("document.readyState")
                .await
                .ok()
                .and_then(|v| v.into_value::<String>().ok())
                .unwrap_or_default();

            let current_height = self
                .page
                .evaluate("document.body ? document.body.scrollHeight : 0")
                .await
                .ok()
                .and_then(|v| v.into_value::<f64>().ok())
                .unwrap_or(0.0);

            let dom_ready = ready_state == "interactive" || ready_state == "complete";
            let load_ready = ready_state == "complete";
            let height_stable = last_height
                .map(|prev| (prev - current_height).abs() < 1.0)
                .unwrap_or(false);

            let ready = match mode {
                NavigationWaitUntil::DomContentLoaded => dom_ready,
                NavigationWaitUntil::Load => load_ready,
                NavigationWaitUntil::NetworkIdle => {
                    if load_ready && height_stable {
                        stable_rounds += 1;
                    } else {
                        stable_rounds = 0;
                    }
                    stable_rounds >= NAVIGATION_STABLE_ROUNDS_REQUIRED
                }
            };

            if ready {
                return Ok(());
            }

            if tokio::time::Instant::now() >= deadline {
                return Err(AutomatorError::BrowserError(format!(
                    "Timeout waiting for navigation readiness {:?}",
                    mode
                )));
            }

            last_height = Some(current_height);
            tokio::time::sleep(WAIT_POLL_INTERVAL).await;
        }
    }

    /// Simulate a key press (e.g. "Enter", "Tab", "Escape").
    pub async fn press_key(&self, key: &str) -> Result<()> {
        let normalized = normalize_key_name(key);
        let key_def = resolve_key_definition(&normalized)
            .ok_or_else(|| AutomatorError::BrowserError(format!("Unsupported key '{}'", key)))?;
        let key_down = build_key_event(key_def, 0, true)
            .map_err(|e| AutomatorError::BrowserError(format!("Key press build failed: {}", e)))?;
        let key_up = build_key_event(key_def, 0, false)
            .map_err(|e| AutomatorError::BrowserError(format!("Key press build failed: {}", e)))?;

        self.page.execute(key_down).await.map_err(|e| {
            AutomatorError::BrowserError(format!("Key press '{}' failed: {}", key, e))
        })?;
        self.page.execute(key_up).await.map_err(|e| {
            AutomatorError::BrowserError(format!("Key press '{}' failed: {}", key, e))
        })?;

        Ok(())
    }

    /// Simulate a key combination like "Ctrl+A", "Ctrl+C".
    pub async fn press_key_combo(&self, combo: &str) -> Result<()> {
        let mut modifiers = 0i64;
        let mut main_key = None;

        for part in combo.split('+').map(str::trim).filter(|s| !s.is_empty()) {
            if let Some(bit) = modifier_to_bit(part) {
                modifiers |= bit;
            } else {
                main_key = Some(normalize_key_name(part));
            }
        }

        let key = main_key.ok_or_else(|| {
            AutomatorError::BrowserError(format!("Key combo '{}' has no main key", combo))
        })?;

        let key_def = resolve_key_definition(&key).ok_or_else(|| {
            AutomatorError::BrowserError(format!("Unsupported key in combo '{}': {}", combo, key))
        })?;

        let key_down = build_key_event(key_def, modifiers, true)
            .map_err(|e| AutomatorError::BrowserError(format!("Key combo build failed: {}", e)))?;
        let key_up = build_key_event(key_def, modifiers, false)
            .map_err(|e| AutomatorError::BrowserError(format!("Key combo build failed: {}", e)))?;

        self.page
            .execute(key_down)
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Key combo failed: {}", e)))?;
        self.page
            .execute(key_up)
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Key combo failed: {}", e)))?;

        Ok(())
    }

    /// Evaluate a JavaScript expression and return the result as a string.
    pub async fn evaluate_js(&self, expression: &str) -> Result<String> {
        let result = self
            .page
            .evaluate(expression)
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("JS eval failed: {}", e)))?;

        match result.value() {
            Some(val) => Ok(val.to_string()),
            None => Ok(String::new()),
        }
    }

    /// Interactive element picker: injects a visual overlay into the page,
    /// lets the user click an element, and returns robust selector candidates.
    pub async fn pick_element_profile(&self) -> Result<PickedWebTarget> {
        let picker_js = r#"
            (function() {
                window.__ctxrun_picked_result = '';
                const styleId = '__ctxrun_picker_style';
                if (document.getElementById(styleId)) return;

                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = '.__ctxrun_hover { outline: 2px solid red !important; outline-offset: -2px; }';
                document.head.appendChild(style);

                function cssEscapeSafe(value) {
                    try {
                        if (window.CSS && typeof window.CSS.escape === 'function') {
                            return window.CSS.escape(String(value));
                        }
                    } catch (_) {}
                    return String(value).replace(/[^a-zA-Z0-9_\-]/g, '\\$&');
                }

                function quoteAttr(value) {
                    return JSON.stringify(String(value));
                }

                function countMatches(selector) {
                    try {
                        return document.querySelectorAll(selector).length;
                    } catch (_) {
                        return 0;
                    }
                }

                function uniquePush(list, selector) {
                    if (!selector || typeof selector !== 'string') return;
                    const s = selector.trim();
                    if (!s || list.includes(s)) return;
                    list.push(s);
                }

                function buildCssPath(el) {
                    if (el.id) return '#' + cssEscapeSafe(el.id);
                    let path = [];
                    let cur = el;
                    while (cur && cur !== document.body && cur !== document.documentElement) {
                        let seg = cur.tagName.toLowerCase();
                        if (cur.className && typeof cur.className === 'string') {
                            const cls = cur.className.trim().split(/\s+/)
                                .filter(c => !c.startsWith('__ctxrun')).slice(0, 2)
                                .map(c => '.' + cssEscapeSafe(c)).join('');
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

                function buildCandidates(el) {
                    const candidates = [];
                    const tag = (el.tagName || '').toLowerCase();

                    if (el.id) {
                        uniquePush(candidates, '#' + cssEscapeSafe(el.id));
                    }

                    const dataAttrs = ['data-testid', 'data-test-id', 'data-test', 'data-qa', 'data-cy'];
                    for (const attr of dataAttrs) {
                        const value = el.getAttribute ? el.getAttribute(attr) : null;
                        if (!value) continue;
                        uniquePush(candidates, '[' + attr + '=' + quoteAttr(value) + ']');
                        if (tag) {
                            uniquePush(candidates, tag + '[' + attr + '=' + quoteAttr(value) + ']');
                        }
                    }

                    const role = el.getAttribute ? el.getAttribute('role') : null;
                    const ariaLabel = el.getAttribute ? el.getAttribute('aria-label') : null;
                    if (ariaLabel) {
                        uniquePush(candidates, '[aria-label=' + quoteAttr(ariaLabel) + ']');
                        if (role) {
                            uniquePush(candidates, '[role=' + quoteAttr(role) + '][aria-label=' + quoteAttr(ariaLabel) + ']');
                        }
                        if (tag) {
                            uniquePush(candidates, tag + '[aria-label=' + quoteAttr(ariaLabel) + ']');
                        }
                    }

                    const name = el.getAttribute ? el.getAttribute('name') : null;
                    if (name) {
                        uniquePush(candidates, '[name=' + quoteAttr(name) + ']');
                        if (tag) {
                            uniquePush(candidates, tag + '[name=' + quoteAttr(name) + ']');
                        }
                    }

                    const placeholder = el.getAttribute ? el.getAttribute('placeholder') : null;
                    if (placeholder && (tag === 'input' || tag === 'textarea')) {
                        uniquePush(candidates, tag + '[placeholder=' + quoteAttr(placeholder) + ']');
                    }

                    if (tag === 'a') {
                        const href = el.getAttribute ? el.getAttribute('href') : null;
                        if (href && href.length <= 200) {
                            uniquePush(candidates, 'a[href=' + quoteAttr(href) + ']');
                        }
                    }

                    if (tag === 'button') {
                        const btnType = el.getAttribute ? el.getAttribute('type') : null;
                        if (btnType) {
                            uniquePush(candidates, 'button[type=' + quoteAttr(btnType) + ']');
                        }
                    }

                    if (tag && el.className && typeof el.className === 'string') {
                        const cls = el.className.trim().split(/\s+/)
                            .filter(c => c && !c.startsWith('__ctxrun'))
                            .slice(0, 2)
                            .map(c => '.' + cssEscapeSafe(c))
                            .join('');
                        if (cls) {
                            uniquePush(candidates, tag + cls);
                        }
                    }

                    const cssPath = buildCssPath(el);
                    if (cssPath) {
                        uniquePush(candidates, cssPath);
                    }

                    const uniqueCandidates = [];
                    const nonUniqueCandidates = [];
                    for (const selector of candidates) {
                        const count = countMatches(selector);
                        if (count === 1) uniqueCandidates.push(selector);
                        else if (count > 1) nonUniqueCandidates.push(selector);
                    }

                    const ordered = uniqueCandidates.concat(nonUniqueCandidates).slice(0, 12);
                    const primary = ordered[0] || '';
                    let strategy = 'css';
                    if (primary.startsWith('#')) strategy = 'id';
                    else if (primary.includes('data-testid') || primary.includes('data-test-id') || primary.includes('data-test') || primary.includes('data-qa') || primary.includes('data-cy')) strategy = 'testid';
                    else if (primary.includes('[aria-label=')) strategy = 'ariaLabel';
                    else if (primary.includes('[name=')) strategy = 'name';

                    return {
                        primarySelector: primary,
                        selectorCandidates: ordered,
                        strategy: strategy
                    };
                }

                let lastEl = null;
                function onMove(e) {
                    const current = e.target instanceof Element ? e.target : null;
                    if (!current) return;
                    if (lastEl && lastEl.classList) lastEl.classList.remove('__ctxrun_hover');
                    current.classList.add('__ctxrun_hover');
                    lastEl = current;
                    e.stopPropagation(); e.preventDefault();
                }
                function onClick(e) {
                    e.stopPropagation(); e.preventDefault();
                    if (lastEl && lastEl.classList) lastEl.classList.remove('__ctxrun_hover');
                    const target = e.target instanceof Element ? e.target : null;
                    if (!target) return;
                    const picked = buildCandidates(target);
                    if (!picked || !picked.primarySelector) return;
                    window.__ctxrun_picked_result = JSON.stringify(picked);
                    document.removeEventListener('mousemove', onMove, true);
                    document.removeEventListener('mousedown', onClick, true);
                    const s = document.getElementById(styleId);
                    if (s) s.remove();
                }
                document.addEventListener('mousemove', onMove, true);
                document.addEventListener('mousedown', onClick, true);
            })()
        "#;

        self.page
            .evaluate(picker_js)
            .await
            .map_err(|e| AutomatorError::BrowserError(format!("Picker injection failed: {}", e)))?;

        // Poll for result (user clicks an element in the browser)
        for _ in 0..PICKER_MAX_POLLS {
            tokio::time::sleep(PICKER_POLL_INTERVAL).await;

            let result = self
                .page
                .evaluate("window.__ctxrun_picked_result || ''")
                .await
                .map_err(|e| AutomatorError::BrowserError(format!("Poll failed: {}", e)))?;

            let picked_json = result.into_value::<String>().unwrap_or_default();
            if !picked_json.is_empty() {
                let mut picked = match serde_json::from_str::<PickedWebTarget>(&picked_json) {
                    Ok(value) => value,
                    Err(_) => continue,
                };
                let primary = picked.primary_selector.trim().to_string();
                if primary.is_empty() {
                    continue;
                }
                let mut normalized = Vec::new();
                normalized.push(primary.clone());
                for candidate in picked.selector_candidates {
                    let trimmed = candidate.trim();
                    if trimmed.is_empty() || normalized.iter().any(|item| item == trimmed) {
                        continue;
                    }
                    normalized.push(trimmed.to_string());
                }
                picked.primary_selector = primary;
                picked.selector_candidates = normalized;
                let _ = self
                    .page
                    .evaluate("delete window.__ctxrun_picked_result;")
                    .await;
                return Ok(picked);
            }
        }

        Err(AutomatorError::BrowserError("Picker timeout (60s)".into()))
    }

    /// Compatibility wrapper: returns the primary selector only.
    pub async fn pick_element(&self) -> Result<String> {
        let picked = self.pick_element_profile().await?;
        Ok(picked.primary_selector)
    }
}

fn modifier_to_bit(value: &str) -> Option<i64> {
    match value.to_ascii_lowercase().as_str() {
        "alt" => Some(1),
        "ctrl" | "control" => Some(2),
        "meta" | "cmd" | "command" => Some(4),
        "shift" => Some(8),
        _ => None,
    }
}

fn normalize_key_name(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "return" => "Enter".to_string(),
        "space" => " ".to_string(),
        "esc" => "Escape".to_string(),
        "del" => "Delete".to_string(),
        "page up" => "PageUp".to_string(),
        "page down" => "PageDown".to_string(),
        "arrow up" | "up" => "ArrowUp".to_string(),
        "arrow down" | "down" => "ArrowDown".to_string(),
        "arrow left" | "left" => "ArrowLeft".to_string(),
        "arrow right" | "right" => "ArrowRight".to_string(),
        "cmd" | "command" => "Meta".to_string(),
        "ctrl" => "Control".to_string(),
        _ => raw.trim().to_string(),
    }
}

fn resolve_key_definition(name: &str) -> Option<&'static KeyDefinition> {
    let normalized = normalize_key_name(name);
    keys::get_key_definition(&normalized).or_else(|| {
        if normalized.len() == 1 {
            keys::get_key_definition(normalized.to_ascii_lowercase())
                .or_else(|| keys::get_key_definition(normalized.to_ascii_uppercase()))
        } else {
            None
        }
    })
}

fn build_key_event(
    key_def: &'static KeyDefinition,
    modifiers: i64,
    is_key_down: bool,
) -> Result<DispatchKeyEventParams> {
    let mut builder = DispatchKeyEventParams::builder()
        .modifiers(modifiers)
        .key(key_def.key)
        .code(key_def.code)
        .windows_virtual_key_code(key_def.key_code)
        .native_virtual_key_code(key_def.key_code)
        .location(key_location(key_def.code));

    let event_type = if is_key_down {
        if let Some(text) = key_def.text {
            builder = builder.text(text);
            DispatchKeyEventType::KeyDown
        } else if key_def.key.len() == 1 {
            builder = builder.text(key_def.key);
            DispatchKeyEventType::KeyDown
        } else {
            DispatchKeyEventType::RawKeyDown
        }
    } else {
        DispatchKeyEventType::KeyUp
    };

    builder
        .r#type(event_type)
        .build()
        .map_err(|e| AutomatorError::BrowserError(e.to_string()))
}

fn key_location(code: &str) -> i64 {
    if code.ends_with("Left") {
        1
    } else if code.ends_with("Right") {
        2
    } else {
        0
    }
}

fn cleanup_handler_task(
    shutdown_tx: &mut Option<oneshot::Sender<()>>,
    handler_task: &mut Option<JoinHandle<()>>,
) {
    if let Some(tx) = shutdown_tx.take() {
        let _ = tx.send(());
    }
    if let Some(task) = handler_task.take() {
        task.abort();
    }
}

async fn wait_for_element(page: &Page, selector: &str, timeout: Duration) -> Result<Element> {
    let deadline = tokio::time::Instant::now() + timeout;

    loop {
        match page.find_element(selector).await {
            Ok(element) => return Ok(element),
            Err(err) => {
                if tokio::time::Instant::now() >= deadline {
                    return Err(AutomatorError::BrowserError(format!(
                        "Element not found '{}': {}",
                        selector, err
                    )));
                }

                tokio::time::sleep(ELEMENT_WAIT_POLL_INTERVAL).await;
            }
        }
    }
}

async fn fetch_page_targets_with_retry(
    browser: &mut Browser,
    url_filter: Option<&str>,
) -> Result<Vec<TargetInfo>> {
    for attempt in 0..TARGET_FETCH_RETRIES {
        let targets = browser.fetch_targets().await.map_err(|e| {
            AutomatorError::BrowserError(format!("Failed to fetch browser targets: {}", e))
        })?;

        let candidates: Vec<TargetInfo> = targets
            .into_iter()
            .filter(|t| matches_target(t, url_filter))
            .collect();

        if !candidates.is_empty() {
            return Ok(candidates);
        }

        if attempt + 1 < TARGET_FETCH_RETRIES {
            tokio::time::sleep(TARGET_FETCH_RETRY_DELAY).await;
        }
    }

    Err(AutomatorError::BrowserError(
        "No matching page tab found. Please open a web page in the browser.".into(),
    ))
}

async fn find_target_with_retry(
    browser: &mut Browser,
    url_filter: Option<&str>,
) -> Result<TargetInfo> {
    let candidates = fetch_page_targets_with_retry(browser, url_filter).await?;
    choose_best_target(browser, &candidates, url_filter)
        .await
        .ok_or_else(|| {
            AutomatorError::BrowserError(
                "No matching page tab found. Please open a web page in the browser.".into(),
            )
        })
}

fn matches_target(target: &TargetInfo, url_filter: Option<&str>) -> bool {
    if target.r#type != "page" {
        return false;
    }

    if target.url.starts_with("devtools://") {
        return false;
    }

    // Extension/internal background pages can appear in target lists but are not
    // user-facing tabs for workflow switching or element operations.
    if target.url.starts_with("chrome-extension://") || target.url.starts_with("edge-extension://")
    {
        return false;
    }

    match url_filter {
        Some(filter) => {
            let query = filter.to_ascii_lowercase();
            target.url.to_ascii_lowercase().contains(&query)
                || target.title.to_ascii_lowercase().contains(&query)
        }
        None => true,
    }
}

async fn choose_best_target(
    browser: &Browser,
    candidates: &[TargetInfo],
    url_filter: Option<&str>,
) -> Option<TargetInfo> {
    if candidates.is_empty() {
        return None;
    }

    if let Some(active) = find_active_candidate(browser, candidates).await {
        return Some(active);
    }

    candidates
        .iter()
        .enumerate()
        .max_by_key(|(idx, target)| score_target(target, *idx, url_filter))
        .map(|(_, target)| target.clone())
}

async fn find_active_candidate(browser: &Browser, candidates: &[TargetInfo]) -> Option<TargetInfo> {
    for target in candidates.iter().rev().take(MAX_FOCUS_CHECK_TABS) {
        let page = match get_page_with_retry(browser, target.target_id.clone()).await {
            Ok(page) => page,
            Err(_) => continue,
        };

        if is_page_active(&page).await {
            return Some(target.clone());
        }
    }

    None
}

async fn is_page_active(page: &Page) -> bool {
    match page.evaluate(ACTIVE_PAGE_CHECK_JS).await {
        Ok(result) => result
            .into_value::<String>()
            .map(|value| value == ACTIVE_PAGE_CHECK_TOKEN)
            .unwrap_or(false),
        Err(_) => false,
    }
}

fn score_target(target: &TargetInfo, index: usize, url_filter: Option<&str>) -> i64 {
    let mut score = index as i64; // Keep a weak preference for newer entries in the returned order.

    if target.attached {
        score += 40;
    }
    if target.opener_id.is_some() {
        score += 30;
    }
    if target.url.starts_with("http://") || target.url.starts_with("https://") {
        score += 40;
    }
    if target.url.starts_with("about:blank") {
        score -= 15;
    }
    if target.url.starts_with("chrome://") || target.url.starts_with("edge://") {
        score -= 25;
    }
    if matches!(target.subtype.as_deref(), Some("prerender")) {
        score -= 40;
    }

    if let Some(filter) = url_filter {
        let query = filter.to_ascii_lowercase();
        let url = target.url.to_ascii_lowercase();
        let title = target.title.to_ascii_lowercase();
        if url.contains(&query) {
            score += 20;
        }
        if title.contains(&query) {
            score += 10;
        }
    }

    score
}

fn select_tab_for_switch<'a>(
    candidates: &'a [TargetInfo],
    strategy: Option<&str>,
    index: Option<u32>,
    value: Option<&str>,
) -> Result<&'a TargetInfo> {
    let strategy = parse_tab_switch_strategy(strategy);
    let normalized_value = sanitize_optional_string(value).unwrap_or_default();
    let value_query = normalized_value.to_ascii_lowercase();

    let found = match strategy {
        TabSwitchStrategy::LastOpened => candidates.last(),
        TabSwitchStrategy::Index => {
            let idx = index.unwrap_or(0) as usize;
            candidates.get(idx)
        }
        TabSwitchStrategy::UrlContains => {
            if value_query.is_empty() {
                None
            } else {
                candidates
                    .iter()
                    .rev()
                    .find(|target| target.url.to_ascii_lowercase().contains(&value_query))
            }
        }
        TabSwitchStrategy::TitleContains => {
            if value_query.is_empty() {
                None
            } else {
                candidates
                    .iter()
                    .rev()
                    .find(|target| target.title.to_ascii_lowercase().contains(&value_query))
            }
        }
    };

    found.ok_or_else(|| {
        AutomatorError::BrowserError(format!(
            "Unable to switch tab with strategy {:?} (value='{}', index={:?})",
            strategy, normalized_value, index
        ))
    })
}

fn parse_navigation_wait_until(value: Option<&str>) -> NavigationWaitUntil {
    match value.unwrap_or("load").trim().to_ascii_lowercase().as_str() {
        "domcontentloaded" | "dom-content-loaded" | "dom_content_loaded" => {
            NavigationWaitUntil::DomContentLoaded
        }
        "networkidle" | "network-idle" | "network_idle" => NavigationWaitUntil::NetworkIdle,
        _ => NavigationWaitUntil::Load,
    }
}

fn parse_selector_wait_state(value: Option<&str>) -> SelectorWaitState {
    match value
        .unwrap_or("visible")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "attached" => SelectorWaitState::Attached,
        "hidden" => SelectorWaitState::Hidden,
        _ => SelectorWaitState::Visible,
    }
}

fn selector_wait_state_matches(expected: SelectorWaitState, current: &str) -> bool {
    match expected {
        SelectorWaitState::Attached => current != "missing",
        SelectorWaitState::Visible => current == "visible",
        SelectorWaitState::Hidden => current == "hidden" || current == "missing",
    }
}

fn parse_url_match_mode(value: Option<&str>) -> UrlMatchMode {
    match value
        .unwrap_or("contains")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "equals" | "equal" => UrlMatchMode::Equals,
        "regex" | "regexp" => UrlMatchMode::Regex,
        _ => UrlMatchMode::Contains,
    }
}

fn url_matches(current: &str, expected: &str, mode: UrlMatchMode) -> bool {
    match mode {
        UrlMatchMode::Contains => current
            .to_ascii_lowercase()
            .contains(&expected.to_ascii_lowercase()),
        UrlMatchMode::Equals => current == expected,
        UrlMatchMode::Regex => Regex::new(expected)
            .map(|regex| regex.is_match(current))
            .unwrap_or(false),
    }
}

fn parse_tab_switch_strategy(value: Option<&str>) -> TabSwitchStrategy {
    match value
        .unwrap_or("lastOpened")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "index" => TabSwitchStrategy::Index,
        "urlcontains" | "url_contains" | "url-contains" => TabSwitchStrategy::UrlContains,
        "titlecontains" | "title_contains" | "title-contains" => TabSwitchStrategy::TitleContains,
        _ => TabSwitchStrategy::LastOpened,
    }
}

fn sanitize_optional_string(value: Option<&str>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

async fn enforce_same_tab_click_navigation(page: &Page, selector: &str) {
    let selector_literal = match serde_json::to_string(selector) {
        Ok(value) => value,
        Err(_) => return,
    };

    let script = format!(
        r#"(() => {{
            try {{
                const el = document.querySelector({selector});
                if (!el) return false;

                if (el instanceof HTMLAnchorElement) {{
                    el.setAttribute('target', '_self');
                    const rel = (el.getAttribute('rel') || '')
                        .split(/\s+/)
                        .filter(Boolean)
                        .filter((item) => item !== 'noopener' && item !== 'noreferrer');
                    if (rel.length > 0) {{
                        el.setAttribute('rel', rel.join(' '));
                    }} else {{
                        el.removeAttribute('rel');
                    }}
                }}

                const form = typeof el.closest === 'function' ? el.closest('form[target]') : null;
                if (form) {{
                    form.setAttribute('target', '_self');
                }}

                return true;
            }} catch (_) {{
                return false;
            }}
        }})()"#,
        selector = selector_literal
    );

    let _ = page.evaluate(script).await;
}

async fn get_page_with_retry(browser: &Browser, target_id: TargetId) -> Result<Page> {
    let mut last_error = None;

    for attempt in 0..PAGE_FETCH_RETRIES {
        match browser.get_page(target_id.clone()).await {
            Ok(page) => return Ok(page),
            Err(err) => {
                last_error = Some(err.to_string());
                if attempt + 1 < PAGE_FETCH_RETRIES {
                    tokio::time::sleep(PAGE_FETCH_RETRY_DELAY).await;
                }
            }
        }
    }

    Err(AutomatorError::BrowserError(format!(
        "Failed to attach to selected page: {}",
        last_error.unwrap_or_else(|| "unknown error".into())
    )))
}

async fn focus_target_with_retry(browser: &Browser, target: &TargetInfo) -> Result<()> {
    let mut last_error = None;

    for attempt in 0..PAGE_FETCH_RETRIES {
        // Preferred path: ask CDP to activate/focus the target directly.
        match browser
            .execute(ActivateTargetParams::new(target.target_id.clone()))
            .await
        {
            Ok(_) => return Ok(()),
            Err(err) => {
                last_error = Some(err.to_string());
            }
        }

        // Compatibility fallback for targets that can still be attached as pages.
        match browser.get_page(target.target_id.clone()).await {
            Ok(page) => match page.bring_to_front().await {
                Ok(_) => return Ok(()),
                Err(err) => {
                    last_error = Some(err.to_string());
                }
            },
            Err(err) => {
                if last_error.is_none() {
                    last_error = Some(err.to_string());
                }
            }
        }

        if attempt + 1 < PAGE_FETCH_RETRIES {
            tokio::time::sleep(PAGE_FETCH_RETRY_DELAY).await;
        }
    }

    Err(AutomatorError::BrowserError(format!(
        "Failed to focus selected tab: {}",
        last_error.unwrap_or_else(|| "unknown error".into())
    )))
}

// ---------------------------------------------------------------------------
// Browser launcher — start a new browser with debugging enabled
// ---------------------------------------------------------------------------

/// Launch a browser with `--remote-debugging-port` for automation.
pub fn launch_debug_browser(
    is_edge: bool,
    url: Option<String>,
    use_temp_profile: bool,
) -> Result<()> {
    let target = if is_edge {
        UtilsBrowserType::Edge
    } else {
        UtilsBrowserType::Chrome
    };
    launch_debug_browser_shared(target, DEFAULT_DEBUG_PORT, url, use_temp_profile)
        .map_err(|err| AutomatorError::BrowserError(err.to_string()))
}
