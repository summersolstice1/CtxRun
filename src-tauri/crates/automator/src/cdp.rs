use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use tokio::net::TcpStream;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message, MaybeTlsStream, WebSocketStream};
use futures_util::{SinkExt, StreamExt};
use crate::error::{AutomatorError, Result};

#[derive(Debug, Deserialize)]
struct TargetInfo {
    id: String,
    title: String,
    #[serde(rename = "type")]
    target_type: String,
    url: String,
    #[serde(rename = "webSocketDebuggerUrl")]
    ws_url: Option<String>,
}

pub struct CdpSession {
    ws_stream: WebSocketStream<MaybeTlsStream<TcpStream>>,
    msg_id: u64,
}

impl CdpSession {
    pub async fn connect(debug_port: u16, url_filter: Option<&str>) -> Result<Self> {
        let http_url = format!("http://127.0.0.1:{}/json", debug_port);
        let client = Client::new();

        let targets: Vec<TargetInfo> = client.get(&http_url)
            .send().await
            .map_err(|e| AutomatorError::CdpConnectionError(format!("Failed to query browser: {}", e)))?
            .json().await
            .map_err(|e| AutomatorError::CdpConnectionError(format!("Invalid JSON: {}", e)))?;

        let target = targets.into_iter().find(|t| {
            let is_page = t.target_type == "page";
            let has_ws = t.ws_url.is_some();
            let matches_url = match url_filter {
                Some(filter) => t.url.contains(filter) || t.title.contains(filter),
                None => true
            };
            is_page && has_ws && matches_url
        }).ok_or_else(|| AutomatorError::CdpConnectionError(
            "No matching browser tab found.".to_string()
        ))?;

        let ws_url_str = target.ws_url.as_ref().unwrap().as_str();

        let (ws_stream, _) = connect_async(ws_url_str).await
            .map_err(|e| AutomatorError::CdpConnectionError(format!("WS Error: {}", e)))?;

        Ok(Self { ws_stream, msg_id: 0 })
    }

    async fn send(&mut self, method: &str, params: Value) -> Result<Value> {
        self.msg_id += 1;
        let id = self.msg_id;
        let request = serde_json::json!({ "id": id, "method": method, "params": params });

        self.ws_stream.send(Message::Text(request.to_string().into())).await
            .map_err(|e| AutomatorError::CdpConnectionError(e.to_string()))?;

        loop {
            let msg = self.ws_stream.next().await
                .ok_or_else(|| AutomatorError::CdpConnectionError("WS closed".into()))?
                .map_err(|e| AutomatorError::CdpConnectionError(e.to_string()))?;

            if let Message::Text(text) = msg {
                if let Ok(resp) = serde_json::from_str::<Value>(&text) {
                    if let Some(resp_id) = resp.get("id").and_then(|i| i.as_u64()) {
                        if resp_id == id {
                            if let Some(err) = resp.get("error") {
                                return Err(AutomatorError::CdpProtocolError(format!("{:?}", err)));
                            }
                            return Ok(resp.get("result").cloned().unwrap_or(Value::Null));
                        }
                    }
                }
            }
        }
    }

    pub async fn wait_for_element(&mut self, selector: &str, _timeout_ms: u64) -> Result<()> {
        let js = format!("!!document.querySelector('{}')", selector);

        for _ in 0..10 {
            let res = self.send("Runtime.evaluate", serde_json::json!({
                "expression": &js,
                "returnByValue": true
            })).await?;

            let exists = res["result"]["value"].as_bool().unwrap_or(false);
            if exists {
                return Ok(());
            }

            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }

        Err(AutomatorError::CdpProtocolError(format!("Timeout (5000ms) waiting for element: {}", selector)))
    }

    pub async fn get_element_viewport_center(&mut self, selector: &str) -> Result<(i32, i32)> {
        self.wait_for_element(selector, 5000).await?;

        let scroll_js = format!(r#"
            (function() {{
                const el = document.querySelector('{}');
                if (el) el.scrollIntoView({{block: "center", inline: "center"}});
            }})()
        "#, selector);
        let _ = self.send("Runtime.evaluate", serde_json::json!({ "expression": scroll_js })).await;

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        let js = format!(r#"
            (function() {{
                const el = document.querySelector('{}');
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                return {{
                    x: Math.round(rect.left + rect.width / 2),
                    y: Math.round(rect.top + rect.height / 2)
                }};
            }})()
        "#, selector);

        let res = self.send("Runtime.evaluate", serde_json::json!({ "expression": js, "returnByValue": true })).await?;
        let val = &res["result"]["value"];

        if val.is_null() {
            return Err(AutomatorError::CdpProtocolError(format!("Element not found after wait: {}", selector)));
        }
        Ok((val["x"].as_i64().unwrap_or(0) as i32, val["y"].as_i64().unwrap_or(0) as i32))
    }

    pub async fn simulate_mouse_click(&mut self, x: i32, y: i32) -> Result<()> {
        self.send("Input.dispatchMouseEvent", serde_json::json!({
            "type": "mouseMoved", "x": x, "y": y
        })).await?;

        self.send("Input.dispatchMouseEvent", serde_json::json!({
            "type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1
        })).await?;

        self.send("Input.dispatchMouseEvent", serde_json::json!({
            "type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1
        })).await?;

        Ok(())
    }

    pub async fn simulate_text_entry(&mut self, selector: &str, text: &str) -> Result<()> {
        self.wait_for_element(selector, 5000).await?;

        let focus_js = format!(r#"
            const el = document.querySelector('{}');
            if(el) {{
                el.focus();
                el.value = '';
            }}
        "#, selector);
        self.send("Runtime.evaluate", serde_json::json!({ "expression": focus_js })).await?;

        self.send("Input.insertText", serde_json::json!({ "text": text })).await?;

        Ok(())
    }

    pub async fn simulate_key_press(&mut self, key_str: &str) -> Result<()> {
        let key_lower = key_str.to_lowercase();
        let (vkey, key_name, code_name, is_char) = match key_lower.as_str() {
            "enter" | "return" => (13, "Enter", "Enter", true),
            "tab" => (9, "Tab", "Tab", false),
            "backspace" => (8, "Backspace", "Backspace", false),
            "escape" | "esc" => (27, "Escape", "Escape", false),
            "space" => (32, " ", "Space", true),
            "/" => (191, "/", "Slash", true),
            k => {
                let c = k.chars().next().unwrap_or(' ');
                (c as u32, k, "", true)
            }
        };

        let mut down_params = serde_json::json!({
            "type": "rawKeyDown",
            "key": key_name,
            "windowsVirtualKeyCode": vkey,
            "nativeVirtualKeyCode": vkey,
        });

        if !code_name.is_empty() {
            down_params.as_object_mut().unwrap().insert("code".to_string(), serde_json::json!(code_name));
        }

        self.send("Input.dispatchKeyEvent", down_params).await?;

        if is_char {
            self.send("Input.dispatchKeyEvent", serde_json::json!({
                "type": "char",
                "text": key_name,
                "unmodifiedText": key_name,
            })).await?;
        }

        let mut up_params = serde_json::json!({
            "type": "keyUp",
            "key": key_name,
            "windowsVirtualKeyCode": vkey,
        });
        if !code_name.is_empty() {
            up_params.as_object_mut().unwrap().insert("code".to_string(), serde_json::json!(code_name));
        }
        self.send("Input.dispatchKeyEvent", up_params).await?;

        Ok(())
    }

    pub async fn pick_element(&mut self) -> Result<String> {
        let picker_js = r#"
            (function() {
                const styleId = 'ctxrun-picker-style';
                if (!document.getElementById(styleId)) {
                    const style = document.createElement('style');
                    style.id = styleId;
                    style.innerHTML = '.ctxrun-highlight { outline: 2px solid #ff0000 !important; cursor: crosshair !important; background: rgba(255, 0, 0, 0.1) !important; }';
                    document.head.appendChild(style);
                }
                let lastEl = null;
                function generateSelector(el) {
                    if (el.id) return '#' + el.id;
                    if (el.className && typeof el.className === 'string') {
                        const classes = el.className.split(' ').filter(c => c.trim() && !c.includes('ctxrun'));
                        if (classes.length > 0) return '.' + classes.join('.');
                    }
                    let path = [];
                    while (el && el.nodeType === 1) {
                        let selector = el.tagName.toLowerCase();
                        if (el.id) { selector += '#' + el.id; path.unshift(selector); break; }
                        let index = 1;
                        let sibling = el.previousElementSibling;
                        while (sibling) { if (sibling.tagName === el.tagName) index++; sibling = sibling.previousElementSibling; }
                        if (index > 1) selector += `:nth-of-type(${index})`;
                        path.unshift(selector);
                        el = el.parentElement;
                    }
                    return path.join(' > ');
                }
                window.__ctxrun_move = (e) => {
                    if (lastEl && lastEl !== e.target) { lastEl.classList.remove('ctxrun-highlight'); }
                    e.target.classList.add('ctxrun-highlight');
                    lastEl = e.target;
                };
                window.__ctxrun_click = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    const selector = generateSelector(e.target);
                    if (lastEl) lastEl.classList.remove('ctxrun-highlight');
                    document.removeEventListener('mousemove', window.__ctxrun_move, true);
                    document.removeEventListener('mousedown', window.__ctxrun_click, true);
                    const style = document.getElementById(styleId);
                    if(style) style.remove();
                    console.log('__CTXRUN_PICKED__::' + selector);
                };
                document.addEventListener('mousemove', window.__ctxrun_move, true);
                document.addEventListener('mousedown', window.__ctxrun_click, true);
            })()
        "#;
        self.send("Runtime.enable", serde_json::json!({})).await?;
        self.send("Runtime.evaluate", serde_json::json!({ "expression": picker_js, "userGesture": true })).await?;
        loop {
            let msg = self.ws_stream.next().await
                .ok_or_else(|| AutomatorError::CdpConnectionError("WebSocket closed".to_string()))?
                .map_err(|e| AutomatorError::CdpConnectionError(e.to_string()))?;

            if let Message::Text(text) = msg {
                if let Ok(event) = serde_json::from_str::<Value>(&text) {
                    if event["method"] == "Runtime.consoleAPICalled" {
                        if let Some(log_val) = event["params"]["args"][0]["value"].as_str() {
                            if log_val.starts_with("__CTXRUN_PICKED__::") {
                                let selector = log_val.replace("__CTXRUN_PICKED__::", "");
                                let _ = self.send("Runtime.disable", serde_json::json!({})).await;
                                return Ok(selector);
                            }
                        }
                    }
                }
            }
        }
    }
}
