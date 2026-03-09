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
const DUCKDUCKGO_SEARCH_URL: &str = "https://html.duckduckgo.com/html/";
const BRAVE_SEARCH_URL: &str = "https://search.brave.com/search";

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

const DUCKDUCKGO_SEARCH_EXTRACT_SCRIPT: &str = r#"
(async () => {
  try {
    const compact = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const bodyText = compact(document.body?.innerText || '').toLowerCase();
    const blocked = (
      bodyText.includes('automated requests') ||
      bodyText.includes('captcha') ||
      bodyText.includes('anomaly') ||
      bodyText.includes('unusual traffic')
    );

    const decodeResultUrl = (rawHref) => {
      if (!rawHref) return null;
      try {
        const parsed = new URL(rawHref, location.origin);
        const redirectTarget = parsed.searchParams.get('uddg');
        if (redirectTarget) {
          return redirectTarget;
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return null;
        }
        if (parsed.hostname.includes('duckduckgo.com')) {
          return null;
        }
        return parsed.toString();
      } catch {
        return null;
      }
    };

    const searchRoot = document.querySelector('#links') || document.querySelector('.results') || document.body || document;
    const nodes = Array.from(searchRoot.querySelectorAll('.result, .results_links, .web-result'));
    const anchors = Array.from(searchRoot.querySelectorAll('a[href]'));
    const bodySample = compact(document.body?.innerText || '').slice(0, 1200);
    const searchRootHtmlSample = compact(
      searchRoot && 'outerHTML' in searchRoot ? (searchRoot.outerHTML || '') : ''
    ).slice(0, 2600);
    const items = [];
    const seen = new Set();

    for (const node of nodes) {
      const anchor = node.querySelector('a.result__a, h2 a[href], a[data-testid="result-title-a"], a[href]');
      if (!anchor) continue;
      const url = decodeResultUrl(anchor.getAttribute('href') || anchor.href || '');
      if (!url || seen.has(url)) continue;
      seen.add(url);

      const title = compact(anchor.textContent || '');
      if (!title) continue;

      const snippet = compact(
        node.querySelector('.result__snippet, .result-snippet, .result__extras__snippet, .result__body')?.textContent || ''
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

const BRAVE_SEARCH_EXTRACT_SCRIPT: &str = r#"
(async () => {
  try {
    const compact = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const bodyText = compact(document.body?.innerText || '').toLowerCase();
    const blocked = (
      bodyText.includes('verify you are human') ||
      bodyText.includes('captcha') ||
      bodyText.includes('unusual traffic') ||
      bodyText.includes('request unsuccessful')
    );

    const isInternalBraveUrl = (parsed) => {
      return parsed.hostname === 'search.brave.com' || parsed.hostname.endsWith('.brave.com');
    };

    const decodeResultUrl = (rawHref) => {
      if (!rawHref) return null;
      try {
        const parsed = new URL(rawHref, location.origin);
        const redirectTarget = parsed.searchParams.get('url') || parsed.searchParams.get('target') || parsed.searchParams.get('u');
        if (redirectTarget) {
          return redirectTarget;
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return null;
        }
        if (isInternalBraveUrl(parsed)) {
          return null;
        }
        return parsed.toString();
      } catch {
        return null;
      }
    };

    const searchRoot = document.querySelector('#results') || document.querySelector('main') || document.body || document;
    const nodes = Array.from(searchRoot.querySelectorAll('[data-type="web"], .snippet, .card')).filter((node) => {
      const text = compact(node.textContent || '').toLowerCase();
      return text.length > 0 && !text.includes('news') && !text.includes('videos');
    });
    const anchors = Array.from(searchRoot.querySelectorAll('a[href]'));
    const bodySample = compact(document.body?.innerText || '').slice(0, 1200);
    const searchRootHtmlSample = compact(
      searchRoot && 'outerHTML' in searchRoot ? (searchRoot.outerHTML || '') : ''
    ).slice(0, 2600);
    const items = [];
    const seen = new Set();

    for (const node of nodes) {
      const anchor = node.querySelector('a[data-testid="result-title-a"], .heading a[href], h2 a[href], a[href]');
      if (!anchor) continue;
      const url = decodeResultUrl(anchor.getAttribute('href') || anchor.href || '');
      if (!url || seen.has(url)) continue;
      seen.add(url);

      const title = compact(
        anchor.querySelector('h2, .title, .heading')?.textContent || anchor.textContent || ''
      );
      if (!title) continue;

      const snippet = compact(
        node.querySelector('.snippet-description, .description, p, .truncate-content')?.textContent || ''
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
    let mut out = String::with_capacity(value.len());
    let mut saw_whitespace = false;

    for ch in value.chars() {
        if ch.is_whitespace() {
            if !out.is_empty() {
                saw_whitespace = true;
            }
            continue;
        }
        if saw_whitespace {
            out.push(' ');
            saw_whitespace = false;
        }
        out.push(ch);
    }

    out
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

fn apply_parallel_metadata(
    result: &mut WebSearchResult,
    request: &NormalizedSearchRequest,
    consent_warning: Option<&String>,
    stealth_notes: &[String],
    attempted_engines: &[&str],
    summary_notes: &[String],
    failure_notes: &[String],
    fallback_reason: Option<String>,
) {
    if request.anti_bot_mode {
        push_unique_warning(
            &mut result.warnings,
            "Anti-bot mode enabled (external debug browser + persistent profile + stealth patches).",
        );
    }
    if let Some(warning) = consent_warning {
        push_unique_warning(&mut result.warnings, warning.clone());
    }
    for note in failure_notes {
        push_unique_warning(&mut result.warnings, note.clone());
    }

    if let Some(debug) = result.debug.as_mut() {
        debug.attempted_engines = attempted_engines
            .iter()
            .map(|engine| (*engine).to_string())
            .collect();
        debug.fallback_reason = fallback_reason;
        debug.notes.push(
            "Parallel execution mode enabled (Google + Bing + DuckDuckGo + Brave).".to_string(),
        );
        for note in summary_notes {
            debug.notes.push(note.clone());
        }
        for note in failure_notes {
            debug.notes.push(note.clone());
        }
        if consent_warning.is_some() {
            debug
                .notes
                .push("Google CONSENT cookie injection failed.".to_string());
        }
        for note in stealth_notes {
            debug.notes.push(note.clone());
        }
    }
}

fn apply_google_verification_metadata(
    result: &mut WebSearchResult,
    request: &NormalizedSearchRequest,
    waiting_engine: Option<&str>,
) {
    push_unique_warning(
        &mut result.warnings,
        "Google triggered consent/captcha verification for this request.",
    );
    if let Some(engine) = waiting_engine {
        push_unique_warning(
            &mut result.warnings,
            format!(
                "Returning {} results immediately because Google verification is pending.",
                engine_display_name(engine)
            ),
        );
    }
    if request.anti_bot_mode {
        push_unique_warning(
            &mut result.warnings,
            "Complete Google human verification in the opened Chrome window, then retry if you prefer Google results.",
        );
    } else {
        push_unique_warning(
            &mut result.warnings,
            "Enable antiBotMode=true to allow manual Google verification in a visible browser window.",
        );
    }
    result.requires_human_verification = Some(true);
    result.verification_engine = Some("google".to_string());
    result.verification_url = Some(request.search_url.clone());
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

fn build_duckduckgo_search_url(request: &NormalizedSearchRequest) -> Result<String> {
    let mut url = Url::parse(DUCKDUCKGO_SEARCH_URL).map_err(|err| {
        MinerError::SystemError(format!("Invalid DuckDuckGo search base URL: {err}"))
    })?;
    {
        let mut query_pairs = url.query_pairs_mut();
        query_pairs.append_pair("q", &request.query);
        if request.start > 0 {
            query_pairs.append_pair("s", &request.start.to_string());
        }
        if let Some(language) = request.language.as_deref() {
            query_pairs.append_pair("kl", language);
        }
    }
    Ok(url.to_string())
}

fn build_brave_search_url(request: &NormalizedSearchRequest) -> Result<String> {
    let mut url = Url::parse(BRAVE_SEARCH_URL)
        .map_err(|err| MinerError::SystemError(format!("Invalid Brave search base URL: {err}")))?;
    {
        let mut query_pairs = url.query_pairs_mut();
        query_pairs.append_pair("q", &request.query);
        query_pairs.append_pair("source", "web");
        if request.start > 0 {
            query_pairs.append_pair("offset", &request.start.to_string());
        }
        query_pairs.append_pair(
            "safesearch",
            if request.safe_search { "strict" } else { "off" },
        );
        if let Some(country) = request.country.as_deref() {
            query_pairs.append_pair("country", country);
        }
    }
    Ok(url.to_string())
}

fn engine_display_name(engine: &str) -> &'static str {
    match engine {
        "google" => "Google",
        "bing" => "Bing",
        "duckduckgo" => "DuckDuckGo",
        "brave" => "Brave",
        _ => "Search engine",
    }
}

fn engine_priority(engine: &str) -> u8 {
    match engine {
        "google" => 4,
        "brave" => 3,
        "bing" => 2,
        "duckduckgo" => 1,
        _ => 0,
    }
}

fn result_is_usable(result: &WebSearchResult) -> bool {
    !result.blocked && result.returned_count > 0
}

fn summarize_result(result: &WebSearchResult) -> String {
    format!(
        "{} summary: blocked={}, returnedCount={}, totalFound={}.",
        engine_display_name(&result.engine),
        result.blocked,
        result.returned_count,
        result.total_found
    )
}

fn choose_best_result_index(results: &[WebSearchResult], usable_only: bool) -> Option<usize> {
    results
        .iter()
        .enumerate()
        .filter(|(_, result)| !usable_only || result_is_usable(result))
        .max_by_key(|(_, result)| (result.returned_count, engine_priority(&result.engine)))
        .map(|(index, _)| index)
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
            .evaluate("(() => { const selectors = ['#search a[href] h3', '#b_results li.b_algo', '#links .result', '.results .result', '#results [data-type=\"web\"]', 'main .snippet']; return selectors.reduce((count, selector) => count + document.querySelectorAll(selector).length, 0); })()")
            .await
            .ok()
            .and_then(|value| value.into_value::<u64>().ok())
            .unwrap_or(0);
        let likely_blocked = page
            .evaluate(
                "(() => { const text = ((document.body && document.body.innerText) || '').toLowerCase(); return text.includes('unusual traffic') || text.includes('captcha') || text.includes('verify you are human') || text.includes('automated requests'); })()",
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

async fn run_search_with_script(
    page: &Page,
    request: &NormalizedSearchRequest,
    engine: &str,
    search_url: String,
    extract_script: &str,
    blocked_warning: &str,
    blocked_debug_note: &str,
) -> Result<WebSearchResult> {
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

    let evaluation_result = page.evaluate(extract_script).await.map_err(|err| {
        MinerError::BrowserError(format!("Search script execution failed: {err}"))
    })?;
    let raw_payload: String = evaluation_result.into_value().map_err(|err| {
        MinerError::ExtractionError(format!("Expected JSON string from search script: {err}"))
    })?;
    let mut parsed_payload: SearchEvalPayload = serde_json::from_str(&raw_payload).map_err(|err| {
        MinerError::SystemError(format!("Failed to parse search script payload: {err}"))
    })?;
    if let Some(error) = parsed_payload.error.as_deref() {
        let stack = parsed_payload.stack.as_deref().unwrap_or_default();
        let detail = if stack.trim().is_empty() {
            error.to_string()
        } else {
            format!("{error}\n{stack}")
        };
        return Err(MinerError::ExtractionError(detail));
    }

    let extracted_items = parsed_payload.items.take().unwrap_or_default();
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
        warnings.push(blocked_warning.to_string());
    }
    if items.is_empty() {
        warnings.push("No parsable web results were found on the returned SERP.".to_string());
    }
    let filtered_items_count = items.len() as u32;
    let page_title = parsed_payload.page_title.take().unwrap_or_default();

    let mut debug_notes = Vec::new();
    if blocked {
        debug_notes.push(blocked_debug_note.to_string());
    }
    if items.is_empty() {
        debug_notes.push(format!(
            "{} extraction returned zero normalized items.",
            engine_display_name(engine)
        ));
    }

    Ok(WebSearchResult {
        engine: engine.to_string(),
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
            engine,
            &parsed_payload,
            blocked,
            raw_items_count,
            filtered_items_count,
            raw_items_preview,
            debug_notes,
        ),
    })
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
    run_search_with_script(
        page,
        request,
        "google",
        request.search_url.clone(),
        SEARCH_EXTRACT_SCRIPT,
        "Google may require consent/captcha verification for this request.",
        "Google blocked hint detected from SERP content.",
    )
    .await
}

async fn run_bing_search(
    page: &Page,
    request: &NormalizedSearchRequest,
) -> Result<WebSearchResult> {
    run_search_with_script(
        page,
        request,
        "bing",
        build_bing_search_url(request)?,
        BING_SEARCH_EXTRACT_SCRIPT,
        "Bing may require captcha verification for this request.",
        "Bing blocked hint detected from SERP content.",
    )
    .await
}

async fn run_duckduckgo_search(
    page: &Page,
    request: &NormalizedSearchRequest,
) -> Result<WebSearchResult> {
    run_search_with_script(
        page,
        request,
        "duckduckgo",
        build_duckduckgo_search_url(request)?,
        DUCKDUCKGO_SEARCH_EXTRACT_SCRIPT,
        "DuckDuckGo may require additional verification for this request.",
        "DuckDuckGo blocked hint detected from SERP content.",
    )
    .await
}

async fn run_brave_search(
    page: &Page,
    request: &NormalizedSearchRequest,
) -> Result<WebSearchResult> {
    run_search_with_script(
        page,
        request,
        "brave",
        build_brave_search_url(request)?,
        BRAVE_SEARCH_EXTRACT_SCRIPT,
        "Brave Search may require captcha verification for this request.",
        "Brave blocked hint detected from SERP content.",
    )
    .await
}

/// 閼辨梻缍夐幖婊呭偍閸忋儱褰涢敍姘▏閻劍婀伴崷?Chromium 閹垫挸绱?Google SERP 楠炲墎绮ㄩ弸鍕鏉╂柨娲栫紒鎾寸亯閵?
pub async fn search_web(request: WebSearchRequest) -> Result<WebSearchResult> {
    let normalized = normalize_request(request)?;
    let timeout = normalized.timeout;
    let search_url = normalized.search_url.clone();
    let anti_bot_mode = normalized.anti_bot_mode;

    let mut driver = MinerDriver::new_for_search(normalized.anti_bot_mode).await?;
    let timed = tokio::time::timeout(timeout, async {
        let google_page = driver.new_page().await?;
        let bing_page = driver.new_page().await?;
        let duckduckgo_page = driver.new_page().await?;
        let brave_page = driver.new_page().await?;
        let attempted_engines = ["google", "bing", "duckduckgo", "brave"];

        let mut stealth_notes = Vec::new();
        if normalized.anti_bot_mode {
            for note in apply_search_anti_bot_patches(&google_page).await {
                stealth_notes.push(format!("google: {note}"));
            }
            for note in apply_search_anti_bot_patches(&bing_page).await {
                stealth_notes.push(format!("bing: {note}"));
            }
            for note in apply_search_anti_bot_patches(&duckduckgo_page).await {
                stealth_notes.push(format!("duckduckgo: {note}"));
            }
            for note in apply_search_anti_bot_patches(&brave_page).await {
                stealth_notes.push(format!("brave: {note}"));
            }
        }

        let consent_warning = apply_google_consent_cookie(&google_page).await;
        let (google_result, bing_result, duckduckgo_result, brave_result) = tokio::join!(
            run_google_search(&google_page, &normalized),
            run_bing_search(&bing_page, &normalized),
            run_duckduckgo_search(&duckduckgo_page, &normalized),
            run_brave_search(&brave_page, &normalized)
        );

        let mut summary_notes = Vec::new();
        let mut failure_notes = Vec::new();
        let mut successful_results = Vec::new();

        for (engine, outcome) in [
            ("google", google_result),
            ("bing", bing_result),
            ("duckduckgo", duckduckgo_result),
            ("brave", brave_result),
        ] {
            match outcome {
                Ok(result) => {
                    summary_notes.push(summarize_result(&result));
                    successful_results.push(result);
                }
                Err(error) => failure_notes.push(format!(
                    "{} parallel search failed: {error}",
                    engine_display_name(engine)
                )),
            }
        }

        if successful_results.is_empty() {
            return Err(MinerError::BrowserError(format!(
                "Parallel web search failed. {}",
                failure_notes.join("; ")
            )));
        }

        let google_index = successful_results
            .iter()
            .position(|result| result.engine == "google");
        let google_blocked = google_index
            .map(|index| successful_results[index].blocked)
            .unwrap_or(false);
        let google_returned_count = google_index
            .map(|index| successful_results[index].returned_count)
            .unwrap_or(0);

        let best_non_google_usable_index = successful_results
            .iter()
            .enumerate()
            .filter(|(_, result)| result.engine != "google" && result_is_usable(result))
            .max_by_key(|(_, result)| (result.returned_count, engine_priority(&result.engine)))
            .map(|(index, _)| index);

        let (selected_index, keep_browser_open, fallback_reason) = if google_blocked {
            if let Some(index) = best_non_google_usable_index {
                (
                    index,
                    false,
                    Some(format!(
                        "google_blocked_parallel_returned_{}",
                        successful_results[index].engine
                    )),
                )
            } else if let Some(index) = google_index {
                (
                    index,
                    normalized.anti_bot_mode,
                    Some("google_blocked_parallel".to_string()),
                )
            } else {
                (
                    choose_best_result_index(&successful_results, false).unwrap_or(0),
                    false,
                    Some("parallel_no_google_success".to_string()),
                )
            }
        } else if let Some(index) = google_index.filter(|index| result_is_usable(&successful_results[*index])) {
            (index, false, None)
        } else if let Some(index) = best_non_google_usable_index {
            let reason = if google_index.is_some() && google_returned_count == 0 {
                Some(format!(
                    "google_empty_results_parallel_returned_{}",
                    successful_results[index].engine
                ))
            } else if google_index.is_none() {
                Some(format!(
                    "google_error_parallel_returned_{}",
                    successful_results[index].engine
                ))
            } else {
                Some(format!(
                    "parallel_preferred_non_google_{}",
                    successful_results[index].engine
                ))
            };
            (index, false, reason)
        } else {
            let index = choose_best_result_index(&successful_results, false).unwrap_or(0);
            let reason = if successful_results[index].engine == "google" {
                Some("parallel_no_clear_winner_google".to_string())
            } else {
                Some(format!(
                    "parallel_no_clear_winner_{}",
                    successful_results[index].engine
                ))
            };
            (index, false, reason)
        };

        let mut selected = successful_results.remove(selected_index);

        apply_parallel_metadata(
            &mut selected,
            &normalized,
            consent_warning.as_ref(),
            &stealth_notes,
            &attempted_engines,
            &summary_notes,
            &failure_notes,
            fallback_reason,
        );

        if google_blocked {
            let waiting_engine = if selected.engine == "google" {
                None
            } else {
                Some(selected.engine.clone())
            };
            apply_google_verification_metadata(&mut selected, &normalized, waiting_engine.as_deref());
            if let Some(debug) = selected.debug.as_mut() {
                if waiting_engine.is_some() {
                    debug.notes.push(
                        "Google was blocked initially; returned non-Google results immediately."
                            .to_string(),
                    );
                } else {
                    debug.notes.push(
                        "Google was blocked initially; manual verification is required before retry."
                            .to_string(),
                    );
                }
            }
        } else if selected.engine != "google" {
            if google_index.is_some() && google_returned_count == 0 {
                push_unique_warning(
                    &mut selected.warnings,
                    format!(
                        "Google results were unavailable, returned {} results from parallel search.",
                        engine_display_name(&selected.engine)
                    ),
                );
            } else if google_index.is_none() {
                push_unique_warning(
                    &mut selected.warnings,
                    format!(
                        "Google search failed, returned {} results from parallel search.",
                        engine_display_name(&selected.engine)
                    ),
                );
            }
        }

        Ok((selected, keep_browser_open))
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
