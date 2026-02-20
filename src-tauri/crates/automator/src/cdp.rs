use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use tokio::net::TcpStream;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message, MaybeTlsStream, WebSocketStream};
use futures_util::{SinkExt, StreamExt};
use crate::error::{AutomatorError, Result};

#[derive(Debug, Deserialize)]
struct TargetInfo {
    #[allow(dead_code)]
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
            .map_err(|e| AutomatorError::CdpConnectionError(format!("Invalid JSON from browser: {}", e)))?;

        let target = targets.into_iter().find(|t| {
            let is_page = t.target_type == "page";
            let has_ws = t.ws_url.is_some();
            let matches_url = match url_filter {
                Some(filter) => t.url.contains(filter) || t.title.contains(filter),
                None => true
            };
            is_page && has_ws && matches_url
        }).ok_or_else(|| AutomatorError::CdpConnectionError(
            "No matching browser tab found. Is Chrome running with --remote-debugging-port=9222?".to_string()
        ))?;

        println!("[CDP] Connecting to: {} ({})", target.title, target.url);

        let ws_url = target.ws_url.as_ref().unwrap();

        let (ws_stream, _) = connect_async(ws_url.as_str()).await
            .map_err(|e| AutomatorError::CdpConnectionError(format!("WebSocket handshake failed: {}", e)))?;

        Ok(Self {
            ws_stream,
            msg_id: 0,
        })
    }

    async fn send(&mut self, method: &str, params: Value) -> Result<Value> {
        self.msg_id += 1;
        let id = self.msg_id;

        let request = serde_json::json!({
            "id": id,
            "method": method,
            "params": params
        });

        self.ws_stream.send(Message::Text(request.to_string().into())).await
            .map_err(|e| AutomatorError::CdpConnectionError(format!("WS Send failed: {}", e)))?;

        loop {
            let msg = self.ws_stream.next().await
                .ok_or_else(|| AutomatorError::CdpConnectionError("WebSocket closed unexpectedly".to_string()))?
                .map_err(|e| AutomatorError::CdpConnectionError(format!("WS Read failed: {}", e)))?;

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

    pub async fn get_element_viewport_center(&mut self, selector: &str) -> Result<(i32, i32)> {
        let js = format!(r#"
            (function() {{
                const el = document.querySelector('{}');
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                return {{
                    x: Math.round(rect.left + rect.width / 2),
                    y: Math.round(rect.top + rect.height / 2),
                    visible: (rect.width > 0 && rect.height > 0)
                }};
            }})()
        "#, selector);

        let res = self.send("Runtime.evaluate", serde_json::json!({
            "expression": js,
            "returnByValue": true
        })).await?;

        let value = &res["result"]["value"];
        if value.is_null() {
            return Err(AutomatorError::CdpProtocolError(format!("Element not found in DOM: {}", selector)));
        }

        let x = value["x"].as_i64().unwrap_or(0) as i32;
        let y = value["y"].as_i64().unwrap_or(0) as i32;

        Ok((x, y))
    }

    pub async fn js_click(&mut self, selector: &str) -> Result<()> {
        let js = format!(r#"
            (function() {{
                const el = document.querySelector('{}');
                if (!el) return false;
                el.click();
                return true;
            }})()
        "#, selector);

        let res = self.send("Runtime.evaluate", serde_json::json!({
            "expression": js,
            "returnByValue": true
        })).await?;

        let success = res["result"]["value"].as_bool().unwrap_or(false);
        if !success {
             return Err(AutomatorError::CdpProtocolError(format!("JS Click failed (Element not found?): {}", selector)));
        }

        Ok(())
    }

    pub async fn js_type(&mut self, selector: &str, text: &str) -> Result<()> {
        let js = format!(r#"
            (function() {{
                const el = document.querySelector('{}');
                if (el) {{
                    el.focus();
                    el.value = '{}';
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    return true;
                }}
                return false;
            }})()
        "#, selector, text);

        let res = self.send("Runtime.evaluate", serde_json::json!({
            "expression": js,
            "returnByValue": true
        })).await?;

        let success = res["result"]["value"].as_bool().unwrap_or(false);
        if !success {
             return Err(AutomatorError::CdpProtocolError(format!("JS Type failed: {}", selector)));
        }
        Ok(())
    }

    /// 6. 开启 Web 元素拾取模式 (高亮 + 点击捕获)
    /// 这是一个阻塞方法，直到用户在浏览器中点击了某个元素才返回
    pub async fn pick_element(&mut self) -> Result<String> {
        // 1. 定义注入的 JS 代码：高亮 + 计算 Selector
        let picker_js = r#"
            (function() {
                // 样式：高亮红框
                const styleId = 'ctxrun-picker-style';
                if (!document.getElementById(styleId)) {
                    const style = document.createElement('style');
                    style.id = styleId;
                    style.innerHTML = '.ctxrun-highlight { outline: 2px solid #ff0000 !important; cursor: crosshair !important; background: rgba(255, 0, 0, 0.1) !important; }';
                    document.head.appendChild(style);
                }

                let lastEl = null;

                // 简单的 Selector 生成器 (优先 ID > Class > Tag)
                function generateSelector(el) {
                    if (el.id) return '#' + el.id;
                    if (el.className && typeof el.className === 'string') {
                        const classes = el.className.split(' ').filter(c => c.trim() && !c.includes('ctxrun'));
                        if (classes.length > 0) return '.' + classes.join('.');
                    }
                    // 简单的层级回溯
                    let path = [];
                    while (el && el.nodeType === 1) {
                        let selector = el.tagName.toLowerCase();
                        if (el.id) {
                            selector += '#' + el.id;
                            path.unshift(selector);
                            break;
                        }
                        let index = 1;
                        let sibling = el.previousElementSibling;
                        while (sibling) {
                            if (sibling.tagName === el.tagName) index++;
                            sibling = sibling.previousElementSibling;
                        }
                        if (index > 1) selector += `:nth-of-type(${index})`;
                        path.unshift(selector);
                        el = el.parentElement;
                    }
                    return path.join(' > ');
                }

                // 鼠标移动监听：添加高亮
                window.__ctxrun_move = (e) => {
                    if (lastEl && lastEl !== e.target) {
                        lastEl.classList.remove('ctxrun-highlight');
                    }
                    e.target.classList.add('ctxrun-highlight');
                    lastEl = e.target;
                };

                // 鼠标点击监听：捕获并返回
                window.__ctxrun_click = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const selector = generateSelector(e.target);

                    // 清理现场
                    if (lastEl) lastEl.classList.remove('ctxrun-highlight');
                    document.removeEventListener('mousemove', window.__ctxrun_move, true);
                    document.removeEventListener('mousedown', window.__ctxrun_click, true);
                    const style = document.getElementById(styleId);
                    if(style) style.remove();

                    // 关键：通过 console.log 发送魔术字符串，Rust 端监听 ConsoleAPICalled 事件
                    console.log('__CTXRUN_PICKED__::' + selector);
                };

                document.addEventListener('mousemove', window.__ctxrun_move, true);
                document.addEventListener('mousedown', window.__ctxrun_click, true);
            })()
        "#;

        // 2. 开启 Runtime 域以监听 console.log
        self.send("Runtime.enable", serde_json::json!({})).await?;

        // 3. 注入 JS
        self.send("Runtime.evaluate", serde_json::json!({
            "expression": picker_js,
            "userGesture": true
        })).await?;

        println!("[CDP] 🖱️ Web 拾取器已注入，等待用户点击...");

        // 4. 循环监听 WebSocket 事件，直到捕获到特定日志
        loop {
            let msg = self.ws_stream.next().await
                .ok_or_else(|| AutomatorError::CdpConnectionError("WebSocket closed unexpectedly".to_string()))?
                .map_err(|e| AutomatorError::CdpConnectionError(format!("WS Read failed: {}", e)))?;

            if let Message::Text(text) = msg {
                if let Ok(event) = serde_json::from_str::<Value>(&text) {
                    // 监听 Runtime.consoleAPICalled 事件
                    if event["method"] == "Runtime.consoleAPICalled" {
                        if let Some(args) = event["params"]["args"].as_array() {
                            if let Some(log_val) = args.first().and_then(|a| a["value"].as_str()) {
                                if log_val.starts_with("__CTXRUN_PICKED__::") {
                                    let selector = log_val.replace("__CTXRUN_PICKED__::", "");

                                    // 捡到了！关闭 Runtime 监听并返回
                                    let _ = self.send("Runtime.disable", serde_json::json!({})).await;
                                    println!("[CDP] ✅ 捕获到 Selector: {}", selector);
                                    return Ok(selector);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
