use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use ctxrun_plugin_miner::core::queue::{CrawlEventSink, run_crawl_task_with_sink};
use ctxrun_plugin_miner::core::single_page::extract_single_page;
use ctxrun_plugin_miner::models::{MinerConfig, MinerEvent, SinglePageRequest};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use thiserror::Error;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;
use tokio::time::{Duration, timeout};
use uuid::Uuid;

const JSONRPC_VERSION: &str = "2.0";
const MCP_LATEST_PROTOCOL_VERSION: &str = "DRAFT-2026-v1";
const SERVER_NAME: &str = "ctxrun-miner-mcp-http";
const SERVER_TITLE: &str = "CtxRun Miner MCP (HTTP)";

const PARSE_ERROR: i64 = -32700;
const INVALID_REQUEST: i64 = -32600;
const METHOD_NOT_FOUND: i64 = -32601;
const INVALID_PARAMS: i64 = -32602;
const SERVER_NOT_INITIALIZED: i64 = -32002;
const AUTHENTICATION_ERROR: i64 = -32001;

const MCP_SESSION_HEADER: &str = "mcp-session-id";
const DEFAULT_SESSION_ID: &str = "default";
const SESSION_TTL_SECONDS: i64 = 60 * 60;
const MAX_SESSION_COUNT: usize = 512;
const DEFAULT_MCP_HOST: &str = "127.0.0.1";
const DEFAULT_MCP_PORT: u16 = 39180;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpHttpStatus {
    pub running: bool,
    pub host: String,
    pub port: u16,
    pub endpoint: String,
    pub auth_enabled: bool,
    pub allow_start: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpHttpConfigPatch {
    pub host: Option<String>,
    pub port: Option<u16>,
    pub token: Option<String>,
    pub allow_start: Option<bool>,
    pub restart_if_running: Option<bool>,
}

struct McpHttpRuntime {
    running: bool,
    host: String,
    port: u16,
    token: Option<String>,
    allow_start: bool,
    shutdown_tx: Option<oneshot::Sender<()>>,
    task: Option<JoinHandle<()>>,
}

#[derive(Clone)]
pub struct McpHttpControl {
    runtime: Arc<Mutex<McpHttpRuntime>>,
}

impl McpHttpControl {
    pub fn new_from_env() -> Self {
        let host = std::env::var("CTXRUN_MCP_HTTP_HOST")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| DEFAULT_MCP_HOST.to_string());
        let port = parse_port_env("CTXRUN_MCP_HTTP_PORT", DEFAULT_MCP_PORT);
        let token = normalize_token_env("CTXRUN_MCP_HTTP_TOKEN");
        let allow_start = parse_bool_env("CTXRUN_MCP_HTTP_ENABLED", true);

        let runtime = McpHttpRuntime {
            running: false,
            host,
            port,
            token,
            allow_start,
            shutdown_tx: None,
            task: None,
        };
        Self {
            runtime: Arc::new(Mutex::new(runtime)),
        }
    }

    fn endpoint(host: &str, port: u16) -> String {
        format!("http://{}:{}/mcp", host, port)
    }

    fn refresh_locked(runtime: &mut McpHttpRuntime) {
        let clear = runtime
            .task
            .as_ref()
            .map(|handle| handle.is_finished())
            .unwrap_or(false);
        if clear {
            runtime.task.take();
            runtime.shutdown_tx = None;
            runtime.running = false;
        }
    }

    fn snapshot_locked(runtime: &McpHttpRuntime) -> McpHttpStatus {
        McpHttpStatus {
            running: runtime.running,
            host: runtime.host.clone(),
            port: runtime.port,
            endpoint: Self::endpoint(&runtime.host, runtime.port),
            auth_enabled: runtime.token.is_some(),
            allow_start: runtime.allow_start,
        }
    }

    pub fn status(&self) -> Result<McpHttpStatus, String> {
        let mut runtime = self
            .runtime
            .lock()
            .map_err(|_| "Failed to lock MCP runtime.".to_string())?;
        Self::refresh_locked(&mut runtime);
        Ok(Self::snapshot_locked(&runtime))
    }

    pub async fn configure(&self, patch: McpHttpConfigPatch) -> Result<McpHttpStatus, String> {
        let mut should_stop = false;
        let mut should_start = false;
        let restart_if_running = patch.restart_if_running.unwrap_or(true);

        {
            let mut runtime = self
                .runtime
                .lock()
                .map_err(|_| "Failed to lock MCP runtime.".to_string())?;
            Self::refresh_locked(&mut runtime);

            let mut endpoint_related_changed = false;

            if let Some(host) = patch.host {
                let host = host.trim().to_string();
                if host.is_empty() {
                    return Err("MCP host cannot be empty.".to_string());
                }
                if runtime.host != host {
                    runtime.host = host;
                    endpoint_related_changed = true;
                }
            }

            if let Some(port) = patch.port {
                if port == 0 {
                    return Err("MCP port must be between 1 and 65535.".to_string());
                }
                if runtime.port != port {
                    runtime.port = port;
                    endpoint_related_changed = true;
                }
            }

            if let Some(token) = patch.token {
                let normalized = normalize_token_value(token);
                if runtime.token != normalized {
                    runtime.token = normalized;
                    endpoint_related_changed = true;
                }
            }

            if let Some(allow_start) = patch.allow_start {
                runtime.allow_start = allow_start;
            }

            if runtime.running {
                if !runtime.allow_start {
                    should_stop = true;
                } else if endpoint_related_changed && restart_if_running {
                    should_stop = true;
                    should_start = true;
                }
            }
        }

        if should_stop {
            let _ = self.stop().await?;
        }

        if should_start {
            return self.start().await;
        }

        self.status()
    }

    pub async fn start(&self) -> Result<McpHttpStatus, String> {
        let (host, port, token, allow_start) = {
            let mut runtime = self
                .runtime
                .lock()
                .map_err(|_| "Failed to lock MCP runtime.".to_string())?;
            Self::refresh_locked(&mut runtime);
            if runtime.running {
                return Ok(Self::snapshot_locked(&runtime));
            }
            (
                runtime.host.clone(),
                runtime.port,
                runtime.token.clone(),
                runtime.allow_start,
            )
        };

        if !allow_start {
            return Err("MCP HTTP is disabled by CTXRUN_MCP_HTTP_ENABLED.".to_string());
        }

        let bind_addr = format!("{host}:{port}");
        let listener = TcpListener::bind(&bind_addr)
            .await
            .map_err(|err| format!("Failed to bind MCP HTTP server at {}: {}", bind_addr, err))?;
        let local_addr = listener
            .local_addr()
            .map_err(|err| format!("Failed to resolve MCP HTTP local address: {}", err))?;
        let (shutdown_tx, shutdown_rx) = oneshot::channel();

        {
            let mut runtime = self
                .runtime
                .lock()
                .map_err(|_| "Failed to lock MCP runtime.".to_string())?;
            Self::refresh_locked(&mut runtime);
            if runtime.running {
                return Ok(Self::snapshot_locked(&runtime));
            }
            runtime.running = true;
            runtime.host = local_addr.ip().to_string();
            runtime.port = local_addr.port();
            runtime.shutdown_tx = Some(shutdown_tx);
        }

        let runtime_for_task = self.runtime.clone();
        let task = tokio::spawn(async move {
            if let Err(err) = run_http_server(listener, token, shutdown_rx).await {
                eprintln!("[MCP/HTTP] Server exited with error: {}", err);
            }

            if let Ok(mut runtime) = runtime_for_task.lock() {
                runtime.running = false;
                runtime.shutdown_tx = None;
                runtime.task = None;
            }
        });

        let mut runtime = self
            .runtime
            .lock()
            .map_err(|_| "Failed to lock MCP runtime.".to_string())?;
        runtime.task = Some(task);
        Ok(Self::snapshot_locked(&runtime))
    }

    pub async fn stop(&self) -> Result<McpHttpStatus, String> {
        let (shutdown_tx, mut task_handle) = {
            let mut runtime = self
                .runtime
                .lock()
                .map_err(|_| "Failed to lock MCP runtime.".to_string())?;
            Self::refresh_locked(&mut runtime);
            if !runtime.running {
                return Ok(Self::snapshot_locked(&runtime));
            }
            runtime.running = false;
            (runtime.shutdown_tx.take(), runtime.task.take())
        };

        if let Some(tx) = shutdown_tx {
            let _ = tx.send(());
        }

        if let Some(ref mut handle) = task_handle {
            if timeout(Duration::from_secs(3), &mut *handle).await.is_err() {
                handle.abort();
                let _ = handle.await;
            }
        }

        self.status()
    }
}

#[derive(Debug, Error)]
enum ServerError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone)]
struct RpcFailure {
    code: i64,
    message: String,
    data: Option<Value>,
}

impl RpcFailure {
    fn new(code: i64, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }

    fn with_data(code: i64, message: impl Into<String>, data: Value) -> Self {
        Self {
            code,
            message: message.into(),
            data: Some(data),
        }
    }
}

#[derive(Debug, Clone)]
struct SessionState {
    initialized: bool,
    protocol_version: Option<String>,
    last_seen_at: i64,
}

impl Default for SessionState {
    fn default() -> Self {
        Self {
            initialized: false,
            protocol_version: None,
            last_seen_at: Utc::now().timestamp(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CrawlStatusSnapshot {
    crawl_id: Option<String>,
    running: bool,
    started_at: Option<String>,
    finished_at: Option<String>,
    current: u32,
    total_discovered: u32,
    current_url: Option<String>,
    last_stage: Option<String>,
    attempted_pages: u32,
    saved_pages: u32,
    error_count: u32,
    last_error: Option<String>,
    output_dir: Option<String>,
    max_depth: Option<u32>,
    max_pages: Option<u32>,
    concurrency: Option<u32>,
}

#[derive(Debug, Clone, Default)]
struct CrawlStatus {
    crawl_id: Option<String>,
    running: bool,
    started_at: Option<String>,
    finished_at: Option<String>,
    current: u32,
    total_discovered: u32,
    current_url: Option<String>,
    last_stage: Option<String>,
    attempted_pages: u32,
    saved_pages: u32,
    error_count: u32,
    last_error: Option<String>,
    output_dir: Option<String>,
    max_depth: Option<u32>,
    max_pages: Option<u32>,
    concurrency: Option<u32>,
}

impl CrawlStatus {
    fn snapshot(&self) -> CrawlStatusSnapshot {
        CrawlStatusSnapshot {
            crawl_id: self.crawl_id.clone(),
            running: self.running,
            started_at: self.started_at.clone(),
            finished_at: self.finished_at.clone(),
            current: self.current,
            total_discovered: self.total_discovered,
            current_url: self.current_url.clone(),
            last_stage: self.last_stage.clone(),
            attempted_pages: self.attempted_pages,
            saved_pages: self.saved_pages,
            error_count: self.error_count,
            last_error: self.last_error.clone(),
            output_dir: self.output_dir.clone(),
            max_depth: self.max_depth,
            max_pages: self.max_pages,
            concurrency: self.concurrency,
        }
    }
}

#[derive(Debug, Default)]
struct CrawlRuntime {
    stop_flag: Option<Arc<AtomicBool>>,
    task: Option<JoinHandle<()>>,
}

#[derive(Clone, Default)]
struct CrawlManager {
    state: Arc<Mutex<CrawlStatus>>,
    runtime: Arc<Mutex<CrawlRuntime>>,
}

impl CrawlManager {
    fn snapshot(&self) -> CrawlStatusSnapshot {
        self.state
            .lock()
            .map(|state| state.snapshot())
            .unwrap_or_else(|_| CrawlStatus::default().snapshot())
    }

    fn refresh_runtime(&self) {
        if let Ok(mut runtime) = self.runtime.lock() {
            let clear = runtime
                .task
                .as_ref()
                .map(|handle| handle.is_finished())
                .unwrap_or(false);
            if clear {
                runtime.task.take();
                runtime.stop_flag = None;
            }
        }
    }

    fn apply_event(state: &Arc<Mutex<CrawlStatus>>, event: MinerEvent) {
        let Ok(mut status) = state.lock() else {
            return;
        };

        match event {
            MinerEvent::Progress {
                current,
                total_discovered,
                current_url,
                status: stage,
            } => {
                status.current = current;
                status.total_discovered = total_discovered;
                status.current_url = Some(current_url);
                status.last_stage = Some(stage.clone());
                if stage.eq_ignore_ascii_case("saved") {
                    status.saved_pages = status.saved_pages.saturating_add(1);
                }
            }
            MinerEvent::Error { url, message } => {
                status.error_count = status.error_count.saturating_add(1);
                status.current_url = Some(url);
                status.last_error = Some(message);
                status.last_stage = Some("Error".to_string());
            }
            MinerEvent::Finished {
                total_pages,
                output_dir,
            } => {
                status.running = false;
                status.finished_at = Some(Utc::now().to_rfc3339());
                status.attempted_pages = total_pages;
                status.output_dir = Some(output_dir);
                status.last_stage = Some("Finished".to_string());
            }
        }
    }

    fn start_crawl(&self, config: MinerConfig) -> Result<CrawlStatusSnapshot, String> {
        self.refresh_runtime();

        {
            let state = self
                .state
                .lock()
                .map_err(|_| "Failed to lock crawl state".to_string())?;
            if state.running {
                return Err("A crawl task is already running.".to_string());
            }
        }

        let crawl_id = Uuid::new_v4().to_string();
        {
            let mut status = self
                .state
                .lock()
                .map_err(|_| "Failed to lock crawl state".to_string())?;
            *status = CrawlStatus {
                crawl_id: Some(crawl_id.clone()),
                running: true,
                started_at: Some(Utc::now().to_rfc3339()),
                finished_at: None,
                current: 0,
                total_discovered: 0,
                current_url: Some(config.url.clone()),
                last_stage: Some("Queued".to_string()),
                attempted_pages: 0,
                saved_pages: 0,
                error_count: 0,
                last_error: None,
                output_dir: Some(config.output_dir.clone()),
                max_depth: Some(config.max_depth),
                max_pages: Some(config.max_pages),
                concurrency: Some(config.concurrency),
            };
        }

        let stop_flag = Arc::new(AtomicBool::new(true));
        let stop_flag_task = stop_flag.clone();
        let state_for_events = self.state.clone();
        let state_for_fail = self.state.clone();
        let runtime_for_cleanup = self.runtime.clone();
        let event_sink: CrawlEventSink = Arc::new(move |event: MinerEvent| {
            Self::apply_event(&state_for_events, event);
        });

        let task = tokio::spawn(async move {
            let run_result =
                run_crawl_task_with_sink(config, stop_flag_task.clone(), Some(event_sink)).await;
            if let Err(err) = run_result {
                if let Ok(mut status) = state_for_fail.lock() {
                    status.running = false;
                    status.finished_at = Some(Utc::now().to_rfc3339());
                    status.error_count = status.error_count.saturating_add(1);
                    status.last_error = Some(err.to_string());
                    status.last_stage = Some("Error".to_string());
                }
            }

            if let Ok(mut runtime) = runtime_for_cleanup.lock() {
                runtime.stop_flag = None;
                runtime.task = None;
            }
        });

        {
            let mut runtime = self
                .runtime
                .lock()
                .map_err(|_| "Failed to lock crawl runtime".to_string())?;
            runtime.stop_flag = Some(stop_flag);
            runtime.task = Some(task);
        }

        Ok(self.snapshot())
    }

    fn stop_crawl(&self) -> CrawlStatusSnapshot {
        self.refresh_runtime();

        if let Ok(runtime) = self.runtime.lock() {
            if let Some(flag) = &runtime.stop_flag {
                flag.store(false, Ordering::SeqCst);
            }
        }

        if let Ok(mut status) = self.state.lock() {
            if status.running {
                status.last_stage = Some("Stopping".to_string());
            }
        }

        self.snapshot()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InitializeParams {
    protocol_version: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CallToolParams {
    name: String,
    arguments: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtractSinglePageArgs {
    url: String,
    timeout_ms: Option<u64>,
    include_links: Option<bool>,
    save_to_disk: Option<bool>,
    output_dir: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartCrawlArgs {
    url: String,
    match_prefix: Option<String>,
    max_depth: Option<u32>,
    max_pages: Option<u32>,
    concurrency: Option<u32>,
    output_dir: String,
}

#[derive(Debug, Deserialize, Default)]
struct EmptyArgs {}

#[derive(Clone)]
struct HttpMcpState {
    sessions: Arc<tokio::sync::Mutex<HashMap<String, SessionState>>>,
    crawl_manager: CrawlManager,
    auth_token: Option<String>,
}

impl HttpMcpState {
    fn new(auth_token: Option<String>) -> Self {
        Self {
            sessions: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            crawl_manager: CrawlManager::default(),
            auth_token,
        }
    }

    fn now_timestamp() -> i64 {
        Utc::now().timestamp()
    }

    fn prune_sessions(sessions: &mut HashMap<String, SessionState>, now_ts: i64) {
        sessions.retain(|_, session| {
            now_ts.saturating_sub(session.last_seen_at) <= SESSION_TTL_SECONDS
        });

        if sessions.len() > MAX_SESSION_COUNT {
            let mut ordered = sessions
                .iter()
                .map(|(session_id, session)| (session_id.clone(), session.last_seen_at))
                .collect::<Vec<_>>();
            ordered.sort_by_key(|(_, last_seen_at)| *last_seen_at);

            let remove_count = sessions.len().saturating_sub(MAX_SESSION_COUNT);
            for (session_id, _) in ordered.into_iter().take(remove_count) {
                sessions.remove(&session_id);
            }
        }
    }

    fn touch_session(session: &mut SessionState, now_ts: i64) {
        session.last_seen_at = now_ts;
    }

    async fn get_session(&self, session_id: &str) -> SessionState {
        let mut sessions = self.sessions.lock().await;
        let now_ts = Self::now_timestamp();
        Self::prune_sessions(&mut sessions, now_ts);
        let entry = sessions.entry(session_id.to_string()).or_default();
        Self::touch_session(entry, now_ts);
        entry.clone()
    }

    async fn ensure_session(&self, session_id: &str) {
        let mut sessions = self.sessions.lock().await;
        let now_ts = Self::now_timestamp();
        Self::prune_sessions(&mut sessions, now_ts);
        let entry = sessions.entry(session_id.to_string()).or_default();
        Self::touch_session(entry, now_ts);
    }

    async fn initialize_session(&self, session_id: &str, protocol_version: String) {
        let mut sessions = self.sessions.lock().await;
        let now_ts = Self::now_timestamp();
        Self::prune_sessions(&mut sessions, now_ts);
        let entry = sessions.entry(session_id.to_string()).or_default();
        entry.initialized = true;
        entry.protocol_version = Some(protocol_version);
        Self::touch_session(entry, now_ts);
    }

    async fn handle_tools_call(&self, params: Option<Value>) -> Result<Value, RpcFailure> {
        let call: CallToolParams = parse_args(params).map_err(|msg| {
            RpcFailure::new(INVALID_PARAMS, format!("Invalid tools/call params: {msg}"))
        })?;

        match call.name.as_str() {
            "miner.extract_single_page" => {
                let args: ExtractSinglePageArgs = parse_args(call.arguments).map_err(|msg| {
                    RpcFailure::new(INVALID_PARAMS, format!("Invalid tool arguments: {msg}"))
                })?;

                let request = SinglePageRequest {
                    url: args.url,
                    timeout_ms: args.timeout_ms,
                    include_links: args.include_links,
                    save_to_disk: args.save_to_disk,
                    output_dir: args.output_dir,
                };

                match extract_single_page(request).await {
                    Ok(result) => {
                        let structured = serde_json::to_value(&result).unwrap_or_else(|_| json!({}));
                        let text = format!(
                            "URL: {}\nTitle: {}\nCrawled At: {}\n\n{}",
                            result.url, result.title, result.crawled_at, result.markdown
                        );
                        Ok(tool_success(text, Some(structured)))
                    }
                    Err(err) => Ok(tool_error(
                        format!("extract_single_page failed: {err}"),
                        Some(json!({ "error": err.to_string() })),
                    )),
                }
            }
            "miner.start_crawl" => {
                let args: StartCrawlArgs = parse_args(call.arguments).map_err(|msg| {
                    RpcFailure::new(INVALID_PARAMS, format!("Invalid tool arguments: {msg}"))
                })?;

                let url = args.url.trim().to_string();
                let output_dir = args.output_dir.trim().to_string();
                if url.is_empty() {
                    return Ok(tool_error("url is required.".to_string(), None));
                }
                if output_dir.is_empty() {
                    return Ok(tool_error("outputDir is required.".to_string(), None));
                }

                let config = MinerConfig {
                    url: url.clone(),
                    match_prefix: args.match_prefix.unwrap_or(url),
                    max_depth: args.max_depth.unwrap_or(2),
                    max_pages: args.max_pages.unwrap_or(100),
                    concurrency: args.concurrency.unwrap_or(5).clamp(1, 10),
                    output_dir,
                };

                match self.crawl_manager.start_crawl(config) {
                    Ok(status) => {
                        let structured =
                            serde_json::to_value(&status).unwrap_or_else(|_| json!({}));
                        Ok(tool_success(
                            "Crawl task started.".to_string(),
                            Some(structured),
                        ))
                    }
                    Err(msg) => Ok(tool_error(msg, None)),
                }
            }
            "miner.get_crawl_status" => {
                let _: EmptyArgs = parse_args(call.arguments).map_err(|msg| {
                    RpcFailure::new(INVALID_PARAMS, format!("Invalid tool arguments: {msg}"))
                })?;
                let status = self.crawl_manager.snapshot();
                let structured = serde_json::to_value(&status).unwrap_or_else(|_| json!({}));
                Ok(tool_success(
                    "Crawl status retrieved.".to_string(),
                    Some(structured),
                ))
            }
            "miner.stop_crawl" => {
                let _: EmptyArgs = parse_args(call.arguments).map_err(|msg| {
                    RpcFailure::new(INVALID_PARAMS, format!("Invalid tool arguments: {msg}"))
                })?;
                let status = self.crawl_manager.stop_crawl();
                let structured = serde_json::to_value(&status).unwrap_or_else(|_| json!({}));
                Ok(tool_success(
                    "Stop signal sent to crawl task.".to_string(),
                    Some(structured),
                ))
            }
            _ => Err(RpcFailure::new(
                INVALID_PARAMS,
                format!("Unknown tool: {}", call.name),
            )),
        }
    }
}

fn parse_bool_env(key: &str, default: bool) -> bool {
    std::env::var(key)
        .ok()
        .map(|value| match value.trim().to_ascii_lowercase().as_str() {
            "0" | "false" | "no" | "off" => false,
            "1" | "true" | "yes" | "on" => true,
            _ => default,
        })
        .unwrap_or(default)
}

fn parse_port_env(key: &str, default: u16) -> u16 {
    std::env::var(key)
        .ok()
        .and_then(|value| value.trim().parse::<u16>().ok())
        .filter(|port| *port > 0)
        .unwrap_or(default)
}

fn normalize_token_env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn normalize_token_value(value: String) -> Option<String> {
    let token = value.trim().to_string();
    if token.is_empty() {
        None
    } else {
        Some(token)
    }
}

fn extract_bearer_token(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(header::AUTHORIZATION)?.to_str().ok()?.trim();
    if let Some(value) = raw.strip_prefix("Bearer ") {
        return Some(value.trim().to_string());
    }
    if let Some(value) = raw.strip_prefix("bearer ") {
        return Some(value.trim().to_string());
    }
    None
}

fn is_request_authorized(headers: &HeaderMap, expected_token: Option<&str>) -> bool {
    let Some(expected) = expected_token else {
        return true;
    };
    if let Some(token) = extract_bearer_token(headers) {
        if token == expected {
            return true;
        }
    }
    if let Some(token) = headers
        .get("x-ctxrun-mcp-token")
        .and_then(|value| value.to_str().ok())
    {
        if token.trim() == expected {
            return true;
        }
    }
    false
}

fn negotiate_protocol(client_protocol: Option<&str>) -> String {
    match client_protocol {
        Some(ver) if !ver.trim().is_empty() => ver.to_string(),
        _ => MCP_LATEST_PROTOCOL_VERSION.to_string(),
    }
}

async fn handle_request(
    state: &HttpMcpState,
    session_id: &str,
    method: &str,
    params: Option<Value>,
) -> Result<Value, RpcFailure> {
    match method {
        "initialize" => {
            let init: InitializeParams = parse_args(params).map_err(|msg| {
                RpcFailure::new(
                    INVALID_PARAMS,
                    format!("Invalid initialize params: {msg}"),
                )
            })?;
            let selected = negotiate_protocol(init.protocol_version.as_deref());
            state.initialize_session(session_id, selected.clone()).await;

            Ok(json!({
                "protocolVersion": selected,
                "capabilities": {
                    "tools": {
                        "listChanged": false
                    }
                },
                "serverInfo": {
                    "name": SERVER_NAME,
                    "title": SERVER_TITLE,
                    "version": env!("CARGO_PKG_VERSION")
                },
                "instructions": "Use miner.extract_single_page for URL-to-Markdown extraction. Use crawler tools for bounded multi-page crawling."
            }))
        }
        "ping" => Ok(json!({})),
        _ => {
            let session = state.get_session(session_id).await;
            if !session.initialized {
                return Err(RpcFailure::new(
                    SERVER_NOT_INITIALIZED,
                    "Server not initialized. Call initialize first.",
                ));
            }
            match method {
                "tools/list" => Ok(json!({
                    "tools": build_tools()
                })),
                "tools/call" => state.handle_tools_call(params).await,
                _ => Err(RpcFailure::new(
                    METHOD_NOT_FOUND,
                    format!("Method not found: {method}"),
                )),
            }
        }
    }
}

fn parse_args<T: DeserializeOwned>(args: Option<Value>) -> Result<T, String> {
    let raw = args.unwrap_or_else(|| json!({}));
    serde_json::from_value(raw).map_err(|e| e.to_string())
}

fn build_tools() -> Vec<Value> {
    vec![
        json!({
            "name": "miner.extract_single_page",
            "title": "Extract Single Page",
            "description": "Extract clean Markdown content from a single HTTP/HTTPS page.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "url": { "type": "string", "description": "Target page URL." },
                    "timeoutMs": { "type": "integer", "minimum": 1000, "maximum": 120000, "description": "Extraction timeout in milliseconds." },
                    "includeLinks": { "type": "boolean", "description": "Whether to return discovered links." },
                    "saveToDisk": { "type": "boolean", "description": "Whether to write markdown file to disk." },
                    "outputDir": { "type": "string", "description": "Output directory, required when saveToDisk=true." }
                },
                "required": ["url"]
            },
            "outputSchema": {
                "type": "object",
                "properties": {
                    "url": { "type": "string" },
                    "title": { "type": "string" },
                    "markdown": { "type": "string" },
                    "links": { "type": "array", "items": { "type": "string" } },
                    "crawledAt": { "type": "string" },
                    "savedPath": { "type": ["string", "null"] },
                    "warnings": { "type": "array", "items": { "type": "string" } }
                },
                "required": ["url", "title", "markdown", "links", "crawledAt", "warnings"]
            },
            "annotations": {
                "title": "Extract Single Page",
                "readOnlyHint": false,
                "destructiveHint": false,
                "idempotentHint": true,
                "openWorldHint": true
            }
        }),
        json!({
            "name": "miner.start_crawl",
            "title": "Start Multi-page Crawl",
            "description": "Start a bounded multi-page crawl task.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "url": { "type": "string", "description": "Seed URL." },
                    "matchPrefix": { "type": "string", "description": "Only URLs with this prefix are crawled. Defaults to url." },
                    "maxDepth": { "type": "integer", "minimum": 0, "maximum": 10, "description": "Maximum crawl depth." },
                    "maxPages": { "type": "integer", "minimum": 1, "maximum": 5000, "description": "Maximum number of pages." },
                    "concurrency": { "type": "integer", "minimum": 1, "maximum": 10, "description": "Worker concurrency." },
                    "outputDir": { "type": "string", "description": "Base output directory." }
                },
                "required": ["url", "outputDir"]
            },
            "annotations": {
                "title": "Start Crawl",
                "readOnlyHint": false,
                "destructiveHint": false,
                "idempotentHint": false,
                "openWorldHint": true
            }
        }),
        json!({
            "name": "miner.get_crawl_status",
            "title": "Get Crawl Status",
            "description": "Read the latest status of the active crawl task.",
            "inputSchema": {
                "type": "object",
                "properties": {}
            },
            "annotations": {
                "title": "Get Status",
                "readOnlyHint": true,
                "destructiveHint": false,
                "idempotentHint": true,
                "openWorldHint": false
            }
        }),
        json!({
            "name": "miner.stop_crawl",
            "title": "Stop Crawl",
            "description": "Send a graceful stop signal to the active crawl task.",
            "inputSchema": {
                "type": "object",
                "properties": {}
            },
            "annotations": {
                "title": "Stop Crawl",
                "readOnlyHint": false,
                "destructiveHint": false,
                "idempotentHint": true,
                "openWorldHint": false
            }
        }),
    ]
}

fn tool_success(text: String, structured: Option<Value>) -> Value {
    let mut result = json!({
        "content": [
            {
                "type": "text",
                "text": text
            }
        ]
    });
    if let Some(structured_content) = structured {
        result["structuredContent"] = structured_content;
    }
    result
}

fn tool_error(message: String, data: Option<Value>) -> Value {
    let mut result = json!({
        "content": [
            {
                "type": "text",
                "text": message
            }
        ],
        "isError": true
    });
    if let Some(structured_content) = data {
        result["structuredContent"] = structured_content;
    }
    result
}

fn success_response(id: Value, result: Value) -> Value {
    json!({
        "jsonrpc": JSONRPC_VERSION,
        "id": id,
        "result": result
    })
}

fn error_response(id: Value, failure: RpcFailure) -> Value {
    let mut error_obj = json!({
        "code": failure.code,
        "message": failure.message
    });
    if let Some(data) = failure.data {
        error_obj["data"] = data;
    }
    json!({
        "jsonrpc": JSONRPC_VERSION,
        "id": id,
        "error": error_obj
    })
}

fn respond_with_session(
    status: StatusCode,
    payload: Option<Value>,
    session_id: Option<&str>,
) -> Response {
    let mut response = match payload {
        Some(body) => (status, Json(body)).into_response(),
        None => status.into_response(),
    };
    if let Some(session) = session_id {
        if let (Ok(name), Ok(value)) = (
            HeaderName::from_lowercase(MCP_SESSION_HEADER.as_bytes()),
            HeaderValue::from_str(session),
        ) {
            response.headers_mut().insert(name, value);
        }
    }
    response
}

async fn handle_mcp_http(
    State(state): State<HttpMcpState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !is_request_authorized(&headers, state.auth_token.as_deref()) {
        let failure = RpcFailure::new(AUTHENTICATION_ERROR, "Unauthorized");
        let payload = error_response(Value::Null, failure);
        return respond_with_session(StatusCode::UNAUTHORIZED, Some(payload), None);
    }

    let parsed: Value = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(err) => {
            let failure =
                RpcFailure::with_data(PARSE_ERROR, "Parse error", json!({ "details": err.to_string() }));
            let payload = error_response(Value::Null, failure);
            return respond_with_session(StatusCode::OK, Some(payload), None);
        }
    };

    let Some(obj) = parsed.as_object() else {
        let failure = RpcFailure::new(INVALID_REQUEST, "Invalid Request");
        let payload = error_response(Value::Null, failure);
        return respond_with_session(StatusCode::OK, Some(payload), None);
    };

    let jsonrpc = obj.get("jsonrpc").and_then(Value::as_str).unwrap_or("");
    let id = obj.get("id").cloned();
    if jsonrpc != JSONRPC_VERSION {
        let payload = error_response(
            id.unwrap_or(Value::Null),
            RpcFailure::new(INVALID_REQUEST, "jsonrpc must be \"2.0\""),
        );
        return respond_with_session(StatusCode::OK, Some(payload), None);
    }

    let Some(method) = obj.get("method").and_then(Value::as_str) else {
        let payload = error_response(
            id.unwrap_or(Value::Null),
            RpcFailure::new(INVALID_REQUEST, "Missing method"),
        );
        return respond_with_session(StatusCode::OK, Some(payload), None);
    };

    let params = obj.get("params").cloned();
    let incoming_session = headers
        .get(MCP_SESSION_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());

    let session_id = incoming_session.unwrap_or_else(|| DEFAULT_SESSION_ID.to_string());
    state.ensure_session(&session_id).await;

    if let Some(request_id) = id {
        let response = match handle_request(&state, &session_id, method, params).await {
            Ok(result) => success_response(request_id.clone(), result),
            Err(failure) => error_response(request_id, failure),
        };
        return respond_with_session(StatusCode::OK, Some(response), Some(&session_id));
    }

    if method == "notifications/initialized" {
        let protocol = state
            .get_session(&session_id)
            .await
            .protocol_version
            .unwrap_or_else(|| MCP_LATEST_PROTOCOL_VERSION.to_string());
        state.initialize_session(&session_id, protocol).await;
    }

    respond_with_session(StatusCode::ACCEPTED, None, Some(&session_id))
}

async fn healthz() -> impl IntoResponse {
    Json(json!({
        "status": "ok",
        "name": SERVER_NAME,
        "version": env!("CARGO_PKG_VERSION")
    }))
}

async fn mcp_get() -> impl IntoResponse {
    Json(json!({
        "name": SERVER_NAME,
        "title": SERVER_TITLE,
        "protocolVersion": MCP_LATEST_PROTOCOL_VERSION,
        "message": "POST JSON-RPC requests to /mcp."
    }))
}

#[tauri::command]
pub fn mcp_http_status(state: tauri::State<'_, McpHttpControl>) -> crate::error::Result<McpHttpStatus> {
    state.status().map_err(Into::into)
}

#[tauri::command]
pub async fn mcp_http_start(
    state: tauri::State<'_, McpHttpControl>,
) -> crate::error::Result<McpHttpStatus> {
    state.start().await.map_err(Into::into)
}

#[tauri::command]
pub async fn mcp_http_stop(
    state: tauri::State<'_, McpHttpControl>,
) -> crate::error::Result<McpHttpStatus> {
    state.stop().await.map_err(Into::into)
}

#[tauri::command]
pub async fn mcp_http_configure(
    state: tauri::State<'_, McpHttpControl>,
    config: McpHttpConfigPatch,
) -> crate::error::Result<McpHttpStatus> {
    state.configure(config).await.map_err(Into::into)
}

async fn run_http_server(
    listener: TcpListener,
    token: Option<String>,
    shutdown_rx: oneshot::Receiver<()>,
) -> Result<(), ServerError> {
    let local_addr = listener.local_addr()?;
    let endpoint = format!("http://{}/mcp", local_addr);
    let health_endpoint = format!("http://{}/healthz", local_addr);

    eprintln!("[MCP/HTTP] Server started at {}", endpoint);
    eprintln!("[MCP/HTTP] Health check endpoint {}", health_endpoint);
    if token.is_some() {
        eprintln!("[MCP/HTTP] Auth enabled (Bearer token required).");
    } else {
        eprintln!("[MCP/HTTP] Auth disabled. Set CTXRUN_MCP_HTTP_TOKEN to enable.");
    }

    let state = HttpMcpState::new(token);
    let app = Router::new()
        .route("/mcp", post(handle_mcp_http).get(mcp_get))
        .route("/healthz", get(healthz))
        .with_state(state);

    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        })
        .await?;
    Ok(())
}
