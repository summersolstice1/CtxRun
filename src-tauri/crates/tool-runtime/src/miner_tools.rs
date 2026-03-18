use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use chrono::Utc;
use ctxrun_plugin_miner::core::queue::{run_crawl_task_with_sink, CrawlEventSink};
use ctxrun_plugin_miner::core::single_page::extract_single_page;
use ctxrun_plugin_miner::core::web_search::search_web;
use ctxrun_plugin_miner::models::{MinerConfig, MinerEvent, SinglePageRequest, WebSearchRequest};
use futures::future::BoxFuture;
use futures::FutureExt;
use serde::Deserialize;
use serde::Serialize;
use serde_json::{json, Value};
use tokio::task::JoinHandle;
use uuid::Uuid;

use crate::models::{ToolAnnotations, ToolSpec};
use crate::runtime::{ApprovalRequirement, ToolExecutionContext, ToolHandler, ToolRuntimeError};

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
struct SearchWebArgs {
    query: String,
    limit: Option<u32>,
    start: Option<u32>,
    language: Option<String>,
    country: Option<String>,
    safe_search: Option<bool>,
    timeout_ms: Option<u64>,
    anti_bot_mode: Option<bool>,
    debug: Option<bool>,
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
pub(crate) struct CrawlManager {
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
            if let Err(err) = run_result && let Ok(mut status) = state_for_fail.lock() {
                status.running = false;
                status.finished_at = Some(Utc::now().to_rfc3339());
                status.error_count = status.error_count.saturating_add(1);
                status.last_error = Some(err.to_string());
                status.last_stage = Some("Error".to_string());
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

        if let Ok(runtime) = self.runtime.lock() && let Some(flag) = &runtime.stop_flag {
            flag.store(false, Ordering::SeqCst);
        }

        if let Ok(mut status) = self.state.lock() && status.running {
            status.last_stage = Some("Stopping".to_string());
        }

        self.snapshot()
    }
}

pub(crate) struct MinerExtractSinglePageTool;

impl ToolHandler for MinerExtractSinglePageTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "miner.extract_single_page".to_string(),
            title: "Extract Single Page".to_string(),
            description: "Extract clean Markdown content from a single HTTP/HTTPS page."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "url": { "type": "string", "description": "Target page URL." },
                    "timeoutMs": { "type": "integer", "minimum": 1000, "maximum": 120000, "description": "Extraction timeout in milliseconds." },
                    "includeLinks": { "type": "boolean", "description": "Whether to return discovered links." },
                    "saveToDisk": { "type": "boolean", "description": "Whether to write markdown file to disk." },
                    "outputDir": { "type": "string", "description": "Output directory, required when saveToDisk=true." }
                },
                "required": ["url"]
            }),
            output_schema: Some(json!({
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
            })),
            annotations: ToolAnnotations {
                title: Some("Extract Single Page".to_string()),
                read_only_hint: false,
                destructive_hint: false,
                idempotent_hint: true,
                open_world_hint: true,
            },
        }
    }

    fn approval_requirement(
        &self,
        arguments: &Value,
    ) -> Result<ApprovalRequirement, ToolRuntimeError> {
        let args: ExtractSinglePageArgs = serde_json::from_value(arguments.clone())?;
        if args.save_to_disk.unwrap_or(false) {
            return Ok(ApprovalRequirement::NeedsApproval {
                reason: "saveToDisk=true will write extracted markdown to disk.".to_string(),
            });
        }
        Ok(ApprovalRequirement::Skip)
    }

    fn call<'a>(
        &'a self,
        arguments: Value,
        _context: ToolExecutionContext,
    ) -> BoxFuture<'a, Result<Value, ToolRuntimeError>> {
        async move {
            let args: ExtractSinglePageArgs = serde_json::from_value(arguments)?;
            let request = SinglePageRequest {
                url: args.url,
                timeout_ms: args.timeout_ms,
                include_links: args.include_links,
                save_to_disk: args.save_to_disk,
                output_dir: args.output_dir,
            };

            let result = extract_single_page(request)
                .await
                .map_err(|err| ToolRuntimeError::Message(err.to_string()))?;
            serde_json::to_value(result).map_err(Into::into)
        }
        .boxed()
    }
}

pub(crate) struct MinerSearchWebTool;

impl ToolHandler for MinerSearchWebTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "miner.search_web".to_string(),
            title: "Search Web".to_string(),
            description:
                "Search web in local browser (Google + Bing in parallel, with Google human-verification hints)."
                    .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Search query keywords." },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 20, "description": "Maximum number of results to return." },
                    "start": { "type": "integer", "minimum": 0, "maximum": 200, "description": "Result offset." },
                    "language": { "type": "string", "description": "Language hint, e.g. en or zh-CN." },
                    "country": { "type": "string", "description": "Country hint, e.g. US or CN." },
                    "safeSearch": { "type": "boolean", "description": "Enable safe search." },
                    "timeoutMs": { "type": "integer", "minimum": 3000, "maximum": 120000, "description": "Search timeout in milliseconds." },
                    "antiBotMode": { "type": "boolean", "description": "Enable anti-bot mode (external debug browser + persistent profile)." },
                    "debug": { "type": "boolean", "description": "Include search diagnostics for parser tuning." }
                },
                "required": ["query"]
            }),
            output_schema: Some(json!({
                "type": "object",
                "properties": {
                    "engine": { "type": "string" },
                    "query": { "type": "string" },
                    "searchUrl": { "type": "string" },
                    "start": { "type": "integer" },
                    "limit": { "type": "integer" },
                    "totalFound": { "type": "integer" },
                    "returnedCount": { "type": "integer" },
                    "blocked": { "type": "boolean" },
                    "pageTitle": { "type": "string" },
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "rank": { "type": "integer" },
                                "title": { "type": "string" },
                                "url": { "type": "string" },
                                "snippet": { "type": "string" },
                                "host": { "type": "string" }
                            },
                            "required": ["rank", "title", "url", "snippet", "host"]
                        }
                    },
                    "searchedAt": { "type": "string" },
                    "warnings": { "type": "array", "items": { "type": "string" } },
                    "requiresHumanVerification": { "type": "boolean" },
                    "verificationEngine": { "type": "string" },
                    "verificationUrl": { "type": "string" },
                    "debug": {
                        "type": "object",
                        "properties": {
                            "enabled": { "type": "boolean" },
                            "attemptedEngines": { "type": "array", "items": { "type": "string" } },
                            "fallbackReason": { "type": "string" },
                            "pageUrl": { "type": "string" },
                            "readyState": { "type": "string" },
                            "resultHeadingCount": { "type": "integer" },
                            "anchorCount": { "type": "integer" },
                            "blockedHint": { "type": "boolean" },
                            "rawItemsCount": { "type": "integer" },
                            "filteredItemsCount": { "type": "integer" },
                            "rawItemsPreview": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "title": { "type": "string" },
                                        "url": { "type": "string" },
                                        "snippet": { "type": "string" }
                                    },
                                    "required": ["title", "url", "snippet"]
                                }
                            },
                            "bodyTextSample": { "type": "string" },
                            "searchRootHtmlSample": { "type": "string" },
                            "notes": { "type": "array", "items": { "type": "string" } }
                        },
                        "required": ["enabled", "attemptedEngines", "rawItemsCount", "filteredItemsCount", "rawItemsPreview", "notes"]
                    }
                },
                "required": ["engine", "query", "searchUrl", "start", "limit", "totalFound", "returnedCount", "blocked", "pageTitle", "items", "searchedAt", "warnings"]
            })),
            annotations: ToolAnnotations {
                title: Some("Search Web".to_string()),
                read_only_hint: true,
                destructive_hint: false,
                idempotent_hint: true,
                open_world_hint: true,
            },
        }
    }

    fn call<'a>(
        &'a self,
        arguments: Value,
        _context: ToolExecutionContext,
    ) -> BoxFuture<'a, Result<Value, ToolRuntimeError>> {
        async move {
            let args: SearchWebArgs = serde_json::from_value(arguments)?;
            let request = WebSearchRequest {
                query: args.query,
                limit: args.limit,
                start: args.start,
                language: args.language,
                country: args.country,
                safe_search: args.safe_search,
                timeout_ms: args.timeout_ms,
                anti_bot_mode: args.anti_bot_mode,
                debug: args.debug,
            };
            let result = search_web(request)
                .await
                .map_err(|err| ToolRuntimeError::Message(err.to_string()))?;
            serde_json::to_value(result).map_err(Into::into)
        }
        .boxed()
    }
}

pub(crate) struct MinerStartCrawlTool {
    crawl_manager: CrawlManager,
}

impl MinerStartCrawlTool {
    pub(crate) fn new(crawl_manager: CrawlManager) -> Self {
        Self { crawl_manager }
    }
}

impl ToolHandler for MinerStartCrawlTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "miner.start_crawl".to_string(),
            title: "Start Multi-page Crawl".to_string(),
            description: "Start a bounded multi-page crawl task.".to_string(),
            input_schema: json!({
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
            }),
            output_schema: None,
            annotations: ToolAnnotations {
                title: Some("Start Crawl".to_string()),
                read_only_hint: false,
                destructive_hint: false,
                idempotent_hint: false,
                open_world_hint: true,
            },
        }
    }

    fn approval_requirement(
        &self,
        _arguments: &Value,
    ) -> Result<ApprovalRequirement, ToolRuntimeError> {
        Ok(ApprovalRequirement::NeedsApproval {
            reason: "Starting crawl may write files and consume network resources.".to_string(),
        })
    }

    fn call<'a>(
        &'a self,
        arguments: Value,
        _context: ToolExecutionContext,
    ) -> BoxFuture<'a, Result<Value, ToolRuntimeError>> {
        async move {
            let args: StartCrawlArgs = serde_json::from_value(arguments)?;
            let url = args.url.trim().to_string();
            let output_dir = args.output_dir.trim().to_string();
            if url.is_empty() {
                return Err(ToolRuntimeError::InvalidArguments(
                    "url is required.".to_string(),
                ));
            }
            if output_dir.is_empty() {
                return Err(ToolRuntimeError::InvalidArguments(
                    "outputDir is required.".to_string(),
                ));
            }

            let config = MinerConfig {
                url: url.clone(),
                match_prefix: args.match_prefix.unwrap_or(url),
                max_depth: args.max_depth.unwrap_or(2),
                max_pages: args.max_pages.unwrap_or(100),
                concurrency: args.concurrency.unwrap_or(5).clamp(1, 10),
                output_dir,
            };
            let status = self
                .crawl_manager
                .start_crawl(config)
                .map_err(ToolRuntimeError::Message)?;
            serde_json::to_value(status).map_err(Into::into)
        }
        .boxed()
    }
}

pub(crate) struct MinerGetCrawlStatusTool {
    crawl_manager: CrawlManager,
}

impl MinerGetCrawlStatusTool {
    pub(crate) fn new(crawl_manager: CrawlManager) -> Self {
        Self { crawl_manager }
    }
}

impl ToolHandler for MinerGetCrawlStatusTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "miner.get_crawl_status".to_string(),
            title: "Get Crawl Status".to_string(),
            description: "Read the latest status of the active crawl task.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {}
            }),
            output_schema: None,
            annotations: ToolAnnotations {
                title: Some("Get Status".to_string()),
                read_only_hint: true,
                destructive_hint: false,
                idempotent_hint: true,
                open_world_hint: false,
            },
        }
    }

    fn call<'a>(
        &'a self,
        arguments: Value,
        _context: ToolExecutionContext,
    ) -> BoxFuture<'a, Result<Value, ToolRuntimeError>> {
        async move {
            let _: EmptyArgs = serde_json::from_value(arguments)?;
            let status = self.crawl_manager.snapshot();
            serde_json::to_value(status).map_err(Into::into)
        }
        .boxed()
    }
}

pub(crate) struct MinerStopCrawlTool {
    crawl_manager: CrawlManager,
}

impl MinerStopCrawlTool {
    pub(crate) fn new(crawl_manager: CrawlManager) -> Self {
        Self { crawl_manager }
    }
}

impl ToolHandler for MinerStopCrawlTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "miner.stop_crawl".to_string(),
            title: "Stop Crawl".to_string(),
            description: "Send a graceful stop signal to the active crawl task.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {}
            }),
            output_schema: None,
            annotations: ToolAnnotations {
                title: Some("Stop Crawl".to_string()),
                read_only_hint: false,
                destructive_hint: false,
                idempotent_hint: true,
                open_world_hint: false,
            },
        }
    }

    fn approval_requirement(
        &self,
        _arguments: &Value,
    ) -> Result<ApprovalRequirement, ToolRuntimeError> {
        Ok(ApprovalRequirement::NeedsApproval {
            reason: "Stopping a running crawl changes task execution state.".to_string(),
        })
    }

    fn call<'a>(
        &'a self,
        arguments: Value,
        _context: ToolExecutionContext,
    ) -> BoxFuture<'a, Result<Value, ToolRuntimeError>> {
        async move {
            let _: EmptyArgs = serde_json::from_value(arguments)?;
            let status = self.crawl_manager.stop_crawl();
            serde_json::to_value(status).map_err(Into::into)
        }
        .boxed()
    }
}
