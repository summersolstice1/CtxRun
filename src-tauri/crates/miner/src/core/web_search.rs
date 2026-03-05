use std::collections::HashSet;
use std::time::Duration;

use chromiumoxide::cdp::browser_protocol::network::CookieParam;
use chromiumoxide::Page;
use chrono::Utc;
use serde::Deserialize;
use tokio::time::sleep;
use url::Url;

use crate::core::driver::MinerDriver;
use crate::error::{MinerError, Result};
use crate::models::{
    WebSearchDebugInfo, WebSearchDebugItem, WebSearchItem, WebSearchRequest, WebSearchResult,
};

const GOOGLE_SEARCH_URL: &str = "https://www.google.com/search";
const BING_SEARCH_URL: &str = "https://www.bing.com/search";

const DEFAULT_SEARCH_LIMIT: u32 = 8;
const MIN_SEARCH_LIMIT: u32 = 1;
const MAX_SEARCH_LIMIT: u32 = 20;
const MAX_SEARCH_START: u32 = 200;
const MAX_QUERY_CHARS: usize = 512;

const DEFAULT_SEARCH_TIMEOUT_MS: u64 = 45_000;
const MIN_SEARCH_TIMEOUT_MS: u64 = 3_000;
const MAX_SEARCH_TIMEOUT_MS: u64 = 120_000;
const DEFAULT_ANTI_BOT_MODE: bool = true;

const SERP_READY_POLL_MS: u64 = 180;
const SERP_READY_MAX_POLLS: u32 = 30;
const ANTI_BOT_PRE_NAV_DELAY_MS: u64 = 420;
const ANTI_BOT_POST_NAV_DELAY_MS: u64 = 620;
const HUMAN_VERIFICATION_POLL_MS: u64 = 900;
const HUMAN_VERIFICATION_MAX_POLLS: u32 = 300;
const DEBUG_SAMPLE_TEXT_CHARS: usize = 800;
const DEBUG_SAMPLE_HTML_CHARS: usize = 2_000;
const DEBUG_ITEMS_PREVIEW_LIMIT: usize = 10;
const SEARCH_STEALTH_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
const SEARCH_STEALTH_INIT_SCRIPT: &str = r#"
(() => {
  try {
    const proto = Object.getPrototypeOf(navigator);
    Object.defineProperty(proto, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    Object.defineProperty(navigator, 'language', { get: () => 'zh-CN' });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en-US', 'en'] });
    window.chrome = window.chrome || { runtime: {} };
    const originalQuery = navigator.permissions && navigator.permissions.query;
    if (originalQuery) {
      navigator.permissions.query = (parameters) => (
        parameters && parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery.call(navigator.permissions, parameters)
      );
    }
  } catch (_) {}
})();
"#;

const SEARCH_EXTRACT_SCRIPT: &str = r#"
(async () => {
  try {
    const compact = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const bodyText = compact(document.body?.innerText || '').toLowerCase();
    const blocked = (
      location.host === 'sorry.google.com' ||
      location.pathname.startsWith('/sorry') ||
      location.host.startsWith('consent.google.') ||
      bodyText.includes('our systems have detected unusual traffic') ||
      bodyText.includes('unusual traffic from your computer network') ||
      bodyText.includes('not a robot') ||
      bodyText.includes('captcha')
    );

    const decodeResultUrl = (rawHref) => {
      if (!rawHref) return null;
      try {
        const parsed = new URL(rawHref, location.origin);
        if (parsed.hostname.endsWith('google.com') && parsed.pathname === '/url') {
          const target = parsed.searchParams.get('q');
          if (target) {
            return target;
          }
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return null;
        }
        if (parsed.hostname.endsWith('google.com')) {
          return null;
        }
        return parsed.toString();
      } catch {
        return null;
      }
    };

    const snippetSelectors = [
      'div.VwiC3b',
      'span.aCOpRe',
      'div[data-sncf="1"]',
      'div.IsZvec',
      'div.yXK7lf',
      'div.s3v9rd',
    ];

    const findSnippet = (anchor) => {
      const root = anchor.closest('div.MjjYud, div.g, div.Gx5Zad, div.tF2Cxc, div.kvH3mc') || anchor.parentElement || anchor;
      for (const selector of snippetSelectors) {
        const node = root.querySelector(selector);
        const text = compact(node?.textContent || '');
        if (text) return text;
      }
      return '';
    };

    const searchRoot = document.querySelector('#search') || document.body || document;
    const anchors = Array.from(searchRoot.querySelectorAll('a[href]'));
    const bodySample = compact(document.body?.innerText || '').slice(0, 1200);
    const searchRootHtmlSample = compact(
      searchRoot && 'outerHTML' in searchRoot ? (searchRoot.outerHTML || '') : ''
    ).slice(0, 2600);
    const seen = new Set();
    const items = [];

    for (const anchor of anchors) {
      const heading = anchor.querySelector('h3');
      if (!heading) continue;
      const title = compact(heading.textContent || '');
      if (!title) continue;
      const url = decodeResultUrl(anchor.getAttribute('href') || anchor.href || '');
      if (!url || seen.has(url)) continue;
      seen.add(url);

      let host = '';
      try {
        host = new URL(url).host;
      } catch {}

      items.push({
        title,
        url,
        snippet: findSnippet(anchor),
        host,
      });
    }

    return JSON.stringify({
      blocked,
      pageUrl: location.href,
      pageTitle: compact(document.title || ''),
      readyState: document.readyState || '',
      resultHeadingCount: document.querySelectorAll('#search a[href] h3').length,
      anchorCount: anchors.length,
      bodySample,
      searchRootHtmlSample,
      items,
    });
  } catch (error) {
    return JSON.stringify({
      error: String(error),
      stack: error && typeof error === 'object' && 'stack' in error ? String(error.stack || '') : '',
    });
  }
})()
"#;

const BING_SEARCH_EXTRACT_SCRIPT: &str = r#"
(async () => {
  try {
    const compact = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const bodyText = compact(document.body?.innerText || '').toLowerCase();
    const blocked = (
      bodyText.includes('enter the characters you see') ||
      bodyText.includes('unusual traffic') ||
      bodyText.includes('verify you are human') ||
      !!document.querySelector('#b_captcha, .b_captcha')
    );

    const searchRoot = document.querySelector('#b_results') || document.body || document;
    const nodes = Array.from(searchRoot.querySelectorAll('li.b_algo'));
    const anchors = Array.from(searchRoot.querySelectorAll('a[href]'));
    const bodySample = compact(document.body?.innerText || '').slice(0, 1200);
    const searchRootHtmlSample = compact(
      searchRoot && 'outerHTML' in searchRoot ? (searchRoot.outerHTML || '') : ''
    ).slice(0, 2600);
    const items = [];
    const seen = new Set();

    for (const node of nodes) {
      const anchor = node.querySelector('h2 a[href], a[href]');
      if (!anchor) continue;
      const url = (anchor.getAttribute('href') || anchor.href || '').trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);

      const title = compact(anchor.textContent || '');
      if (!title) continue;

      const snippet = compact(
        node.querySelector('.b_caption p, .b_caption, p')?.textContent || ''
      );

      let host = '';
      try {
        host = new URL(url).host;
      } catch {}

      items.push({ title, url, snippet, host });
    }

    return JSON.stringify({
      blocked,
      pageUrl: location.href,
      pageTitle: compact(document.title || ''),
      readyState: document.readyState || '',
      resultHeadingCount: nodes.length,
      anchorCount: anchors.length,
      bodySample,
      searchRootHtmlSample,
      items,
    });
  } catch (error) {
    return JSON.stringify({
      error: String(error),
      stack: error && typeof error === 'object' && 'stack' in error ? String(error.stack || '') : '',
    });
  }
})()
"#;

#[derive(Debug)]
struct NormalizedSearchRequest {
    query: String,
    limit: u32,
    start: u32,
    language: Option<String>,
    country: Option<String>,
    safe_search: bool,
    anti_bot_mode: bool,
    debug: bool,
    timeout: Duration,
    search_url: String,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchEvalItem {
    title: String,
    url: String,
    snippet: String,
    host: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchEvalPayload {
    blocked: Option<bool>,
    page_url: Option<String>,
    page_title: Option<String>,
    ready_state: Option<String>,
    result_heading_count: Option<u32>,
    anchor_count: Option<u32>,
    body_sample: Option<String>,
    search_root_html_sample: Option<String>,
    items: Option<Vec<SearchEvalItem>>,
    error: Option<String>,
    stack: Option<String>,
}

fn compact_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut output = String::new();
    for (index, ch) in value.chars().enumerate() {
        if index >= max_chars {
            output.push('…');
            break;
        }
        output.push(ch);
    }
    output
}

fn truncate_and_compact(value: &str, max_chars: usize) -> String {
    truncate_chars(&compact_whitespace(value), max_chars)
}

fn build_raw_items_preview(items: &[SearchEvalItem]) -> Vec<WebSearchDebugItem> {
    items
        .iter()
        .take(DEBUG_ITEMS_PREVIEW_LIMIT)
        .map(|item| WebSearchDebugItem {
            title: truncate_and_compact(&item.title, 220),
            url: truncate_chars(item.url.trim(), 320),
            snippet: truncate_and_compact(&item.snippet, 320),
        })
        .collect()
}

fn build_debug_info(
    request: &NormalizedSearchRequest,
    engine: &str,
    payload: &SearchEvalPayload,
    blocked: bool,
    raw_items_count: u32,
    filtered_items_count: u32,
    raw_items_preview: Vec<WebSearchDebugItem>,
    mut notes: Vec<String>,
) -> Option<WebSearchDebugInfo> {
    if !request.debug {
        return None;
    }

    notes.retain(|note| !note.trim().is_empty());

    Some(WebSearchDebugInfo {
        enabled: true,
        attempted_engines: vec![engine.to_string()],
        fallback_reason: None,
        page_url: payload.page_url.clone(),
        ready_state: payload.ready_state.clone(),
        result_heading_count: payload.result_heading_count,
        anchor_count: payload.anchor_count,
        blocked_hint: Some(blocked),
        raw_items_count,
        filtered_items_count,
        raw_items_preview,
        body_text_sample: payload
            .body_sample
            .as_deref()
            .map(|value| truncate_and_compact(value, DEBUG_SAMPLE_TEXT_CHARS)),
        search_root_html_sample: payload
            .search_root_html_sample
            .as_deref()
            .map(|value| truncate_chars(value, DEBUG_SAMPLE_HTML_CHARS)),
        notes,
    })
}

fn push_unique_warning(warnings: &mut Vec<String>, message: impl Into<String>) {
    let message = message.into();
    if !warnings.iter().any(|existing| existing == &message) {
        warnings.push(message);
    }
}

async fn apply_search_anti_bot_patches(page: &Page) -> Vec<String> {
    let mut notes = Vec::new();

    if let Err(err) = page
        .set_user_agent(SEARCH_STEALTH_USER_AGENT.to_string())
        .await
    {
        notes.push(format!("set_user_agent failed: {err}"));
    }

    if let Err(err) = page
        .evaluate_on_new_document(SEARCH_STEALTH_INIT_SCRIPT)
        .await
    {
        notes.push(format!("inject stealth init script failed: {err}"));
    }

    notes
}

fn normalize_language(value: Option<String>) -> Result<Option<String>> {
    let Some(raw) = value else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.len() > 16
        || !trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
    {
        return Err(MinerError::SystemError(
            "language must be ASCII letters/numbers/hyphen and <=16 chars.".into(),
        ));
    }
    Ok(Some(trimmed.to_string()))
}

fn normalize_country(value: Option<String>) -> Result<Option<String>> {
    let Some(raw) = value else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.len() != 2 || !trimmed.chars().all(|ch| ch.is_ascii_alphabetic()) {
        return Err(MinerError::SystemError(
            "country must be a 2-letter ISO code, e.g. US or CN.".into(),
        ));
    }
    Ok(Some(trimmed.to_ascii_uppercase()))
}

fn resolve_timeout(timeout_ms: Option<u64>) -> (Duration, Option<String>) {
    let requested = timeout_ms.unwrap_or(DEFAULT_SEARCH_TIMEOUT_MS);
    let clamped = requested.clamp(MIN_SEARCH_TIMEOUT_MS, MAX_SEARCH_TIMEOUT_MS);
    let warning = if requested != clamped {
        Some(format!(
            "timeoutMs clamped to {}ms (allowed range: {}-{}ms).",
            clamped, MIN_SEARCH_TIMEOUT_MS, MAX_SEARCH_TIMEOUT_MS
        ))
    } else {
        None
    };
    (Duration::from_millis(clamped), warning)
}

fn build_google_search_url(request: &NormalizedSearchRequest) -> Result<String> {
    let mut url = Url::parse(GOOGLE_SEARCH_URL)
        .map_err(|err| MinerError::SystemError(format!("Invalid Google search base URL: {err}")))?;

    {
        let mut query_pairs = url.query_pairs_mut();
        query_pairs.append_pair("q", &request.query);
        query_pairs.append_pair("num", &request.limit.to_string());
        query_pairs.append_pair("safe", if request.safe_search { "active" } else { "off" });
        query_pairs.append_pair("pws", "0");
        query_pairs.append_pair("nfpr", "1");
        query_pairs.append_pair("ie", "UTF-8");
        query_pairs.append_pair("oe", "UTF-8");
        if request.start > 0 {
            query_pairs.append_pair("start", &request.start.to_string());
        }
        if let Some(language) = request.language.as_deref() {
            query_pairs.append_pair("hl", language);
        }
        if let Some(country) = request.country.as_deref() {
            query_pairs.append_pair("gl", country);
            query_pairs.append_pair("cr", &format!("country{country}"));
        }
    }

    Ok(url.to_string())
}

fn build_bing_search_url(request: &NormalizedSearchRequest) -> Result<String> {
    let mut url = Url::parse(BING_SEARCH_URL)
        .map_err(|err| MinerError::SystemError(format!("Invalid Bing search base URL: {err}")))?;
    {
        let mut query_pairs = url.query_pairs_mut();
        query_pairs.append_pair("q", &request.query);
        query_pairs.append_pair("count", &request.limit.to_string());
        if request.start > 0 {
            query_pairs.append_pair("first", &(request.start + 1).to_string());
        }
        if let Some(language) = request.language.as_deref() {
            query_pairs.append_pair("setlang", language);
        }
        if let Some(country) = request.country.as_deref() {
            query_pairs.append_pair("cc", country);
        }
        query_pairs.append_pair("ensearch", "0");
    }
    Ok(url.to_string())
}

fn normalize_request(request: WebSearchRequest) -> Result<NormalizedSearchRequest> {
    let query = request.query.trim();
    if query.is_empty() {
        return Err(MinerError::SystemError("query is required.".into()));
    }
    if query.chars().count() > MAX_QUERY_CHARS {
        return Err(MinerError::SystemError(format!(
            "query is too long (max {MAX_QUERY_CHARS} characters)."
        )));
    }

    let mut warnings = Vec::new();
    let requested_limit = request.limit.unwrap_or(DEFAULT_SEARCH_LIMIT);
    let limit = requested_limit.clamp(MIN_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    if requested_limit != limit {
        warnings.push(format!(
            "limit clamped to {limit} (allowed range: {MIN_SEARCH_LIMIT}-{MAX_SEARCH_LIMIT})."
        ));
    }

    let requested_start = request.start.unwrap_or(0);
    let start = requested_start.min(MAX_SEARCH_START);
    if requested_start != start {
        warnings.push(format!(
            "start clamped to {start} (maximum {MAX_SEARCH_START})."
        ));
    }

    let (timeout, timeout_warning) = resolve_timeout(request.timeout_ms);
    if let Some(warning) = timeout_warning {
        warnings.push(warning);
    }

    let language = normalize_language(request.language)?;
    let country = normalize_country(request.country)?;
    let safe_search = request.safe_search.unwrap_or(false);
    let anti_bot_mode = request.anti_bot_mode.unwrap_or(DEFAULT_ANTI_BOT_MODE);
    let debug = request.debug.unwrap_or(false);

    let mut normalized = NormalizedSearchRequest {
        query: compact_whitespace(query),
        limit,
        start,
        language,
        country,
        safe_search,
        anti_bot_mode,
        debug,
        timeout,
        search_url: String::new(),
        warnings,
    };
    normalized.search_url = build_google_search_url(&normalized)?;
    Ok(normalized)
}

async fn wait_for_serp_ready(page: &Page) {
    for _ in 0..SERP_READY_MAX_POLLS {
        let ready_state = page
            .evaluate("document.readyState")
            .await
            .ok()
            .and_then(|value| value.into_value::<String>().ok())
            .unwrap_or_default();
        let result_count = page
            .evaluate("document.querySelectorAll('#search a[href] h3').length")
            .await
            .ok()
            .and_then(|value| value.into_value::<u64>().ok())
            .unwrap_or(0);
        let likely_blocked = page
            .evaluate(
                "(document.body && document.body.innerText || '').toLowerCase().includes('unusual traffic')",
            )
            .await
            .ok()
            .and_then(|value| value.into_value::<bool>().ok())
            .unwrap_or(false);

        if ready_state == "complete" && (result_count > 0 || likely_blocked) {
            break;
        }
        sleep(Duration::from_millis(SERP_READY_POLL_MS)).await;
    }
}

async fn apply_google_consent_cookie(page: &Page) -> Option<String> {
    let cookie = match CookieParam::builder()
        .name("CONSENT")
        .value("YES+")
        .domain(".google.com")
        .path("/")
        .url("https://www.google.com/")
        .secure(true)
        .build()
    {
        Ok(cookie) => cookie,
        Err(err) => {
            return Some(format!("failed to build Google CONSENT cookie: {err}"));
        }
    };

    match page.set_cookie(cookie).await {
        Ok(_) => None,
        Err(err) => Some(format!("failed to set Google CONSENT cookie: {err}")),
    }
}

async fn is_google_verification_cleared(page: &Page) -> Result<bool> {
    let evaluation_result = page.evaluate(SEARCH_EXTRACT_SCRIPT).await.map_err(|err| {
        MinerError::BrowserError(format!(
            "Google verification check script execution failed: {err}"
        ))
    })?;
    let raw_payload: String = evaluation_result.into_value().map_err(|err| {
        MinerError::ExtractionError(format!(
            "Expected JSON string from Google verification check script: {err}"
        ))
    })?;
    let parsed_payload: SearchEvalPayload = serde_json::from_str(&raw_payload).map_err(|err| {
        MinerError::SystemError(format!(
            "Failed to parse Google verification check payload: {err}"
        ))
    })?;
    if let Some(error) = parsed_payload.error {
        let stack = parsed_payload.stack.unwrap_or_default();
        let detail = if stack.trim().is_empty() {
            error
        } else {
            format!("{error}\n{stack}")
        };
        return Err(MinerError::ExtractionError(detail));
    }

    Ok(!parsed_payload.blocked.unwrap_or(false))
}

async fn wait_for_google_human_verification(page: &Page) -> Result<()> {
    for _ in 0..HUMAN_VERIFICATION_MAX_POLLS {
        if is_google_verification_cleared(page).await? {
            return Ok(());
        }
        sleep(Duration::from_millis(HUMAN_VERIFICATION_POLL_MS)).await;
    }

    Err(MinerError::BrowserError(
        "Google human verification was not completed in time.".to_string(),
    ))
}

fn normalize_result_url(raw: &str) -> Option<String> {
    let parsed = Url::parse(raw).ok()?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return None;
    }
    Some(parsed.to_string())
}

fn normalize_host(raw_url: &str, host_hint: Option<String>) -> String {
    let parsed_host = Url::parse(raw_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string));
    parsed_host
        .or(host_hint.filter(|value| !value.trim().is_empty()))
        .unwrap_or_default()
}

async fn run_google_search(
    page: &Page,
    request: &NormalizedSearchRequest,
) -> Result<WebSearchResult> {
    if request.anti_bot_mode {
        sleep(Duration::from_millis(ANTI_BOT_PRE_NAV_DELAY_MS)).await;
    }

    page.goto(&request.search_url)
        .await
        .map_err(|err| MinerError::BrowserError(format!("Navigation failed: {err}")))?;

    if request.anti_bot_mode {
        sleep(Duration::from_millis(ANTI_BOT_POST_NAV_DELAY_MS)).await;
    }

    wait_for_serp_ready(page).await;

    let evaluation_result = page.evaluate(SEARCH_EXTRACT_SCRIPT).await.map_err(|err| {
        MinerError::BrowserError(format!("Search script execution failed: {err}"))
    })?;

    let raw_payload: String = evaluation_result.into_value().map_err(|err| {
        MinerError::ExtractionError(format!("Expected JSON string from search script: {err}"))
    })?;

    let parsed_payload: SearchEvalPayload = serde_json::from_str(&raw_payload).map_err(|err| {
        MinerError::SystemError(format!("Failed to parse search script payload: {err}"))
    })?;

    if let Some(error) = parsed_payload.error {
        let stack = parsed_payload.stack.unwrap_or_default();
        let detail = if stack.trim().is_empty() {
            error
        } else {
            format!("{error}\n{stack}")
        };
        return Err(MinerError::ExtractionError(detail));
    }

    let extracted_items = parsed_payload.items.clone().unwrap_or_default();
    let raw_items_count = extracted_items.len() as u32;
    let raw_items_preview = build_raw_items_preview(&extracted_items);
    let total_found = raw_items_count;
    let mut seen_urls = HashSet::new();
    let mut items = Vec::new();

    for item in extracted_items {
        if items.len() >= request.limit as usize {
            break;
        }
        let normalized_url = match normalize_result_url(item.url.trim()) {
            Some(url) => url,
            None => continue,
        };
        if !seen_urls.insert(normalized_url.clone()) {
            continue;
        }

        let title = compact_whitespace(item.title.trim());
        if title.is_empty() {
            continue;
        }

        let snippet = compact_whitespace(item.snippet.trim());
        let host = normalize_host(&normalized_url, item.host);
        let rank = request.start + (items.len() as u32) + 1;

        items.push(WebSearchItem {
            rank,
            title,
            url: normalized_url,
            snippet,
            host,
        });
    }

    let blocked = parsed_payload.blocked.unwrap_or(false);
    let mut warnings = request.warnings.clone();
    if blocked {
        warnings
            .push("Google may require consent/captcha verification for this request.".to_string());
    }
    if items.is_empty() {
        warnings.push("No parsable web results were found on the returned SERP.".to_string());
    }
    let filtered_items_count = items.len() as u32;
    let page_title = parsed_payload.page_title.clone().unwrap_or_default();

    let mut debug_notes = Vec::new();
    if blocked {
        debug_notes.push("Google blocked hint detected from SERP content.".to_string());
    }
    if items.is_empty() {
        debug_notes.push("Google extraction returned zero normalized items.".to_string());
    }

    Ok(WebSearchResult {
        engine: "google".to_string(),
        query: request.query.clone(),
        search_url: request.search_url.clone(),
        start: request.start,
        limit: request.limit,
        total_found,
        returned_count: items.len() as u32,
        blocked,
        page_title,
        items,
        searched_at: Utc::now().to_rfc3339(),
        warnings,
        requires_human_verification: None,
        verification_engine: None,
        verification_url: None,
        debug: build_debug_info(
            request,
            "google",
            &parsed_payload,
            blocked,
            raw_items_count,
            filtered_items_count,
            raw_items_preview,
            debug_notes,
        ),
    })
}

async fn run_bing_search(
    page: &Page,
    request: &NormalizedSearchRequest,
) -> Result<WebSearchResult> {
    let search_url = build_bing_search_url(request)?;
    if request.anti_bot_mode {
        sleep(Duration::from_millis(ANTI_BOT_PRE_NAV_DELAY_MS)).await;
    }

    page.goto(&search_url)
        .await
        .map_err(|err| MinerError::BrowserError(format!("Navigation failed: {err}")))?;

    if request.anti_bot_mode {
        sleep(Duration::from_millis(ANTI_BOT_POST_NAV_DELAY_MS)).await;
    }

    wait_for_serp_ready(page).await;

    let evaluation_result = page
        .evaluate(BING_SEARCH_EXTRACT_SCRIPT)
        .await
        .map_err(|err| {
            MinerError::BrowserError(format!("Search script execution failed: {err}"))
        })?;
    let raw_payload: String = evaluation_result.into_value().map_err(|err| {
        MinerError::ExtractionError(format!("Expected JSON string from search script: {err}"))
    })?;
    let parsed_payload: SearchEvalPayload = serde_json::from_str(&raw_payload).map_err(|err| {
        MinerError::SystemError(format!("Failed to parse search script payload: {err}"))
    })?;
    if let Some(error) = parsed_payload.error {
        let stack = parsed_payload.stack.unwrap_or_default();
        let detail = if stack.trim().is_empty() {
            error
        } else {
            format!("{error}\n{stack}")
        };
        return Err(MinerError::ExtractionError(detail));
    }

    let extracted_items = parsed_payload.items.clone().unwrap_or_default();
    let raw_items_count = extracted_items.len() as u32;
    let raw_items_preview = build_raw_items_preview(&extracted_items);
    let total_found = raw_items_count;
    let mut seen_urls = HashSet::new();
    let mut items = Vec::new();
    for item in extracted_items {
        if items.len() >= request.limit as usize {
            break;
        }
        let normalized_url = match normalize_result_url(item.url.trim()) {
            Some(url) => url,
            None => continue,
        };
        if !seen_urls.insert(normalized_url.clone()) {
            continue;
        }
        let title = compact_whitespace(item.title.trim());
        if title.is_empty() {
            continue;
        }
        let snippet = compact_whitespace(item.snippet.trim());
        let host = normalize_host(&normalized_url, item.host);
        let rank = request.start + (items.len() as u32) + 1;
        items.push(WebSearchItem {
            rank,
            title,
            url: normalized_url,
            snippet,
            host,
        });
    }

    let blocked = parsed_payload.blocked.unwrap_or(false);
    let mut warnings = request.warnings.clone();
    if blocked {
        warnings.push("Bing may require captcha verification for this request.".to_string());
    }
    if items.is_empty() {
        warnings.push("No parsable web results were found on the returned SERP.".to_string());
    }
    let filtered_items_count = items.len() as u32;
    let page_title = parsed_payload.page_title.clone().unwrap_or_default();

    let mut debug_notes = Vec::new();
    if blocked {
        debug_notes.push("Bing blocked hint detected from SERP content.".to_string());
    }
    if items.is_empty() {
        debug_notes.push("Bing extraction returned zero normalized items.".to_string());
    }

    Ok(WebSearchResult {
        engine: "bing".to_string(),
        query: request.query.clone(),
        search_url,
        start: request.start,
        limit: request.limit,
        total_found,
        returned_count: items.len() as u32,
        blocked,
        page_title,
        items,
        searched_at: Utc::now().to_rfc3339(),
        warnings,
        requires_human_verification: None,
        verification_engine: None,
        verification_url: None,
        debug: build_debug_info(
            request,
            "bing",
            &parsed_payload,
            blocked,
            raw_items_count,
            filtered_items_count,
            raw_items_preview,
            debug_notes,
        ),
    })
}

/// 联网搜索入口：使用本地 Chromium 打开 Google SERP 并结构化返回结果。
pub async fn search_web(request: WebSearchRequest) -> Result<WebSearchResult> {
    let normalized = normalize_request(request)?;
    let timeout = normalized.timeout;
    let search_url = normalized.search_url.clone();
    let anti_bot_mode = normalized.anti_bot_mode;

    let mut driver = MinerDriver::new_for_search(normalized.anti_bot_mode).await?;
    let timed = tokio::time::timeout(timeout, async {
        let google_page = driver.new_page().await?;
        let bing_page = driver.new_page().await?;

        let mut stealth_notes = Vec::new();
        if normalized.anti_bot_mode {
            for note in apply_search_anti_bot_patches(&google_page).await {
                stealth_notes.push(format!("google: {note}"));
            }
            for note in apply_search_anti_bot_patches(&bing_page).await {
                stealth_notes.push(format!("bing: {note}"));
            }
        }

        let consent_warning = apply_google_consent_cookie(&google_page).await;
        let (google_result, bing_result) = tokio::join!(
            run_google_search(&google_page, &normalized),
            run_bing_search(&bing_page, &normalized)
        );

        match (google_result, bing_result) {
            (Ok(google), Ok(bing)) => {
                let google_blocked = google.blocked;
                let google_returned_count = google.returned_count;
                let google_summary = format!(
                    "Google summary: blocked={}, returnedCount={}, totalFound={}.",
                    google.blocked, google.returned_count, google.total_found
                );
                let bing_summary = format!(
                    "Bing summary: blocked={}, returnedCount={}, totalFound={}.",
                    bing.blocked, bing.returned_count, bing.total_found
                );

                let google_usable = !google.blocked && google.returned_count > 0;
                let bing_usable = !bing.blocked && bing.returned_count > 0;

                if google_blocked && normalized.anti_bot_mode {
                    wait_for_google_human_verification(&google_page).await?;
                    let mut verified_google = run_google_search(&google_page, &normalized).await?;

                    if normalized.anti_bot_mode {
                        push_unique_warning(
                            &mut verified_google.warnings,
                            "Anti-bot mode enabled (external debug browser + persistent profile + stealth patches).",
                        );
                    }
                    if let Some(warning) = consent_warning.as_ref() {
                        push_unique_warning(&mut verified_google.warnings, warning.clone());
                    }
                    push_unique_warning(
                        &mut verified_google.warnings,
                        "Google human verification completed; returning Google results.",
                    );
                    if bing.returned_count > 0 {
                        push_unique_warning(
                            &mut verified_google.warnings,
                            "Bing parallel results were ignored after Google verification succeeded.",
                        );
                    }

                    if let Some(debug) = verified_google.debug.as_mut() {
                        debug.attempted_engines = vec!["google".to_string(), "bing".to_string()];
                        debug.fallback_reason =
                            Some("google_blocked_wait_manual_verification".to_string());
                        debug
                            .notes
                            .push("Parallel execution mode enabled (Google + Bing).".to_string());
                        debug.notes.push(google_summary);
                        debug.notes.push(bing_summary);
                        debug
                            .notes
                            .push("Google was blocked initially; waited for manual verification.".to_string());
                        debug
                            .notes
                            .push("Manual verification completed; reran Google extraction.".to_string());
                        if consent_warning.is_some() {
                            debug
                                .notes
                                .push("Google CONSENT cookie injection failed.".to_string());
                        }
                        for note in &stealth_notes {
                            debug.notes.push(note.clone());
                        }
                    }

                    return Ok((verified_google, false));
                }

                let (mut selected, fallback_reason) = if google_usable {
                    (google, None)
                } else if bing_usable {
                    (
                        bing,
                        Some(if google.blocked {
                            "google_blocked_parallel".to_string()
                        } else {
                            "google_empty_results_parallel".to_string()
                        }),
                    )
                } else if google.returned_count >= bing.returned_count {
                    (
                        google,
                        Some("parallel_no_clear_winner_google".to_string()),
                    )
                } else {
                    (bing, Some("parallel_no_clear_winner_bing".to_string()))
                };

                if normalized.anti_bot_mode {
                    push_unique_warning(
                        &mut selected.warnings,
                        "Anti-bot mode enabled (external debug browser + persistent profile + stealth patches).",
                    );
                }
                if let Some(warning) = consent_warning.as_ref() {
                    push_unique_warning(&mut selected.warnings, warning.clone());
                }

                if selected.engine == "bing" && (google_blocked || google_returned_count == 0) {
                    push_unique_warning(
                        &mut selected.warnings,
                        "Google results were unavailable, returned Bing results from parallel search.",
                    );
                }

                if google_blocked {
                    push_unique_warning(
                        &mut selected.warnings,
                        "Google triggered consent/captcha verification for this request.",
                    );
                    if normalized.anti_bot_mode {
                        push_unique_warning(
                            &mut selected.warnings,
                            "Please complete Google human verification in the opened Chrome window, then retry.",
                        );
                    } else {
                        push_unique_warning(
                            &mut selected.warnings,
                            "Enable antiBotMode=true to allow manual Google verification in a visible browser window.",
                        );
                    }
                    selected.requires_human_verification = Some(true);
                    selected.verification_engine = Some("google".to_string());
                    selected.verification_url = Some(normalized.search_url.clone());
                }

                if let Some(debug) = selected.debug.as_mut() {
                    debug.attempted_engines = vec!["google".to_string(), "bing".to_string()];
                    debug.fallback_reason = fallback_reason;
                    debug.notes.push("Parallel execution mode enabled (Google + Bing).".to_string());
                    debug.notes.push(google_summary);
                    debug.notes.push(bing_summary);
                    debug.notes.push(format!(
                        "Anti-bot mode: {}",
                        if normalized.anti_bot_mode {
                            "enabled"
                        } else {
                            "disabled"
                        }
                    ));
                    if google_blocked {
                        debug
                            .notes
                            .push("Google blocked hint detected; human verification required.".to_string());
                    }
                    if consent_warning.is_some() {
                        debug
                            .notes
                            .push("Google CONSENT cookie injection failed.".to_string());
                    }
                    for note in &stealth_notes {
                        debug.notes.push(note.clone());
                    }
                }

                Ok((selected, google_blocked && normalized.anti_bot_mode))
            }
            (Ok(mut google), Err(bing_error)) => {
                let google_blocked = google.blocked;
                if google_blocked && normalized.anti_bot_mode {
                    wait_for_google_human_verification(&google_page).await?;
                    let mut verified_google = run_google_search(&google_page, &normalized).await?;

                    if normalized.anti_bot_mode {
                        push_unique_warning(
                            &mut verified_google.warnings,
                            "Anti-bot mode enabled (external debug browser + persistent profile + stealth patches).",
                        );
                    }
                    if let Some(warning) = consent_warning.as_ref() {
                        push_unique_warning(&mut verified_google.warnings, warning.clone());
                    }
                    push_unique_warning(
                        &mut verified_google.warnings,
                        "Google human verification completed; returning Google results.",
                    );
                    push_unique_warning(
                        &mut verified_google.warnings,
                        format!("Bing parallel search failed: {bing_error}"),
                    );

                    if let Some(debug) = verified_google.debug.as_mut() {
                        debug.attempted_engines = vec!["google".to_string(), "bing".to_string()];
                        debug.fallback_reason =
                            Some("google_blocked_wait_manual_verification_bing_error".to_string());
                        debug
                            .notes
                            .push("Parallel execution mode enabled (Google + Bing).".to_string());
                        debug
                            .notes
                            .push("Google was blocked initially; waited for manual verification.".to_string());
                        debug
                            .notes
                            .push("Manual verification completed; reran Google extraction.".to_string());
                        debug
                            .notes
                            .push(format!("Bing parallel search failed: {bing_error}"));
                        if consent_warning.is_some() {
                            debug
                                .notes
                                .push("Google CONSENT cookie injection failed.".to_string());
                        }
                        for note in &stealth_notes {
                            debug.notes.push(note.clone());
                        }
                    }

                    return Ok((verified_google, false));
                }

                if normalized.anti_bot_mode {
                    push_unique_warning(
                        &mut google.warnings,
                        "Anti-bot mode enabled (external debug browser + persistent profile + stealth patches).",
                    );
                }
                if let Some(warning) = consent_warning.as_ref() {
                    push_unique_warning(&mut google.warnings, warning.clone());
                }
                push_unique_warning(
                    &mut google.warnings,
                    format!("Bing parallel search failed: {bing_error}"),
                );

                if google_blocked {
                    push_unique_warning(
                        &mut google.warnings,
                        "Google triggered consent/captcha verification for this request.",
                    );
                    if normalized.anti_bot_mode {
                        push_unique_warning(
                            &mut google.warnings,
                            "Please complete Google human verification in the opened Chrome window, then retry.",
                        );
                    } else {
                        push_unique_warning(
                            &mut google.warnings,
                            "Enable antiBotMode=true to allow manual Google verification in a visible browser window.",
                        );
                    }
                    google.requires_human_verification = Some(true);
                    google.verification_engine = Some("google".to_string());
                    google.verification_url = Some(normalized.search_url.clone());
                }

                if let Some(debug) = google.debug.as_mut() {
                    debug.attempted_engines = vec!["google".to_string(), "bing".to_string()];
                    debug.fallback_reason = Some("bing_error_parallel".to_string());
                    debug
                        .notes
                        .push("Parallel execution mode enabled (Google + Bing).".to_string());
                    debug
                        .notes
                        .push(format!("Bing parallel search failed: {bing_error}"));
                    if consent_warning.is_some() {
                        debug
                            .notes
                            .push("Google CONSENT cookie injection failed.".to_string());
                    }
                    for note in &stealth_notes {
                        debug.notes.push(note.clone());
                    }
                }

                Ok((google, google_blocked && normalized.anti_bot_mode))
            }
            (Err(google_error), Ok(mut bing)) => {
                if normalized.anti_bot_mode {
                    push_unique_warning(
                        &mut bing.warnings,
                        "Anti-bot mode enabled (external debug browser + persistent profile + stealth patches).",
                    );
                }
                if let Some(warning) = consent_warning.as_ref() {
                    push_unique_warning(&mut bing.warnings, warning.clone());
                }
                push_unique_warning(
                    &mut bing.warnings,
                    "Google search failed, returned Bing results from parallel search.",
                );
                push_unique_warning(
                    &mut bing.warnings,
                    format!("Google error: {google_error}"),
                );

                if let Some(debug) = bing.debug.as_mut() {
                    debug.attempted_engines = vec!["google".to_string(), "bing".to_string()];
                    debug.fallback_reason = Some("google_error_parallel".to_string());
                    debug
                        .notes
                        .push("Parallel execution mode enabled (Google + Bing).".to_string());
                    debug
                        .notes
                        .push(format!("Google parallel search failed: {google_error}"));
                    if consent_warning.is_some() {
                        debug
                            .notes
                            .push("Google CONSENT cookie injection failed.".to_string());
                    }
                    for note in &stealth_notes {
                        debug.notes.push(note.clone());
                    }
                }

                Ok((bing, false))
            }
            (Err(google_error), Err(bing_error)) => Err(MinerError::BrowserError(format!(
                "Parallel web search failed. Google error: {google_error}; Bing error: {bing_error}"
            ))),
        }
    })
    .await;

    let (search_result, keep_browser_open) = match timed {
        Ok(Ok(outcome)) => outcome,
        Ok(Err(error)) => {
            driver.shutdown().await;
            return Err(error);
        }
        Err(_) => {
            driver.shutdown().await;
            return Err(MinerError::BrowserError(format!(
                "Web search timed out after {}s: {}",
                timeout.as_secs(),
                search_url
            )));
        }
    };

    if !(keep_browser_open && anti_bot_mode) {
        driver.shutdown().await;
    }

    Ok(search_result)
}
