use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufRead, BufReader, Read};
use std::path::{Component, Path, PathBuf};
use walkdir::WalkDir;

type Result<T> = crate::Result<T>;

const DEFAULT_READ_MAX_BYTES: usize = 64 * 1024;
const MAX_READ_MAX_BYTES: usize = 256 * 1024;
const MIN_READ_MAX_BYTES: usize = 1024;

const DEFAULT_LIST_MAX_ENTRIES: usize = 200;
const MAX_LIST_MAX_ENTRIES: usize = 1000;
const MIN_LIST_MAX_ENTRIES: usize = 10;

const DEFAULT_LIST_MAX_DEPTH: usize = 3;
const MAX_LIST_MAX_DEPTH: usize = 8;
const MIN_LIST_MAX_DEPTH: usize = 1;
const MAX_SEARCH_QUERY_CHARS: usize = 256;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentReadLocalFileRequest {
    pub root_dir: String,
    pub relative_path: String,
    pub start_line: Option<u64>,
    pub end_line: Option<u64>,
    pub max_bytes: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentReadLocalFileResponse {
    pub path: String,
    pub content: String,
    pub truncated: bool,
    pub total_bytes: u64,
    pub bytes_read: usize,
    pub start_line: u64,
    pub end_line: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentListLocalFilesRequest {
    pub root_dir: String,
    pub relative_dir: Option<String>,
    pub max_entries: Option<usize>,
    pub max_depth: Option<usize>,
    pub include_hidden: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentListLocalFilesResponse {
    pub dir: String,
    pub max_entries: usize,
    pub max_depth: usize,
    pub truncated: bool,
    pub entries: Vec<AgentListEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentListEntry {
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSearchLocalFilesRequest {
    pub root_dir: String,
    pub relative_dir: Option<String>,
    pub query: String,
    pub search_mode: Option<String>,
    pub max_entries: Option<usize>,
    pub max_depth: Option<usize>,
    pub include_hidden: Option<bool>,
    pub files_only: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSearchLocalFilesResponse {
    pub dir: String,
    pub query: String,
    pub search_mode: String,
    pub max_entries: usize,
    pub max_depth: usize,
    pub truncated: bool,
    pub entries: Vec<AgentListEntry>,
}

enum SearchMatcher {
    Contains { query_lower: String },
    Glob { regex: Regex },
}

impl SearchMatcher {
    fn matches(&self, path: &str) -> bool {
        match self {
            SearchMatcher::Contains { query_lower } => {
                path.to_ascii_lowercase().contains(query_lower)
            }
            SearchMatcher::Glob { regex } => regex.is_match(path),
        }
    }

    fn mode_name(&self) -> &'static str {
        match self {
            SearchMatcher::Contains { .. } => "contains",
            SearchMatcher::Glob { .. } => "glob",
        }
    }
}

fn clamp_usize(value: Option<usize>, default: usize, min: usize, max: usize) -> usize {
    value.unwrap_or(default).clamp(min, max)
}

fn validate_search_query(query: &str) -> std::result::Result<String, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("query cannot be empty.".to_string());
    }
    if trimmed.chars().count() > MAX_SEARCH_QUERY_CHARS {
        return Err(format!(
            "query is too long (max {} characters).",
            MAX_SEARCH_QUERY_CHARS
        ));
    }
    Ok(trimmed.to_string())
}

fn glob_pattern_to_regex(pattern: &str) -> std::result::Result<Regex, String> {
    let mut regex = String::from("(?i)^");
    for ch in pattern.chars() {
        match ch {
            '*' => regex.push_str(".*"),
            '?' => regex.push('.'),
            '/' | '\\' => regex.push_str(r"[\\/]"),
            _ => regex.push_str(&regex::escape(&ch.to_string())),
        }
    }
    regex.push('$');
    Regex::new(&regex).map_err(|e| format!("Invalid glob pattern: {}", e))
}

fn build_search_matcher(
    query: &str,
    mode: Option<&str>,
) -> std::result::Result<SearchMatcher, String> {
    let normalized_mode = mode.map(|m| m.trim().to_ascii_lowercase());
    let mode_name = match normalized_mode.as_deref() {
        Some("contains") => "contains",
        Some("glob") => "glob",
        Some("auto") | None => {
            if query.contains('*') || query.contains('?') {
                "glob"
            } else {
                "contains"
            }
        }
        Some(other) => {
            return Err(format!(
                "Unsupported searchMode '{}'. Use contains|glob|auto.",
                other
            ));
        }
    };

    if mode_name == "glob" {
        let regex = glob_pattern_to_regex(query)?;
        return Ok(SearchMatcher::Glob { regex });
    }

    Ok(SearchMatcher::Contains {
        query_lower: query.to_ascii_lowercase(),
    })
}

fn normalize_relative_path(value: &str) -> std::result::Result<PathBuf, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Path cannot be empty.".to_string());
    }

    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err(
            "Absolute path is not allowed. Use a path relative to the workspace root.".to_string(),
        );
    }

    for component in path.components() {
        match component {
            Component::ParentDir => {
                return Err("Path cannot contain '..' segments.".to_string());
            }
            Component::Prefix(_) | Component::RootDir => {
                return Err("Invalid path root component.".to_string());
            }
            _ => {}
        }
    }

    Ok(path.to_path_buf())
}

fn canonicalize_dir(value: &str, field_name: &str) -> std::result::Result<PathBuf, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{field_name} cannot be empty."));
    }

    let raw = PathBuf::from(trimmed);
    let canonical =
        std::fs::canonicalize(&raw).map_err(|e| format!("Failed to resolve {field_name}: {e}"))?;

    if !canonical.is_dir() {
        return Err(format!("{field_name} must be an existing directory."));
    }

    Ok(canonical)
}

fn resolve_scoped_path(
    root_canonical: &Path,
    relative: &Path,
    expect_file: bool,
) -> std::result::Result<PathBuf, String> {
    let joined = root_canonical.join(relative);
    let canonical = std::fs::canonicalize(&joined).map_err(|e| {
        format!(
            "Failed to resolve target path '{}': {}",
            joined.display(),
            e
        )
    })?;

    if !canonical.starts_with(root_canonical) {
        return Err("Target path is outside the allowed root directory.".to_string());
    }

    if expect_file && !canonical.is_file() {
        return Err("Target path is not a regular file.".to_string());
    }

    if !expect_file && !canonical.is_dir() {
        return Err("Target path is not a directory.".to_string());
    }

    Ok(canonical)
}

fn to_root_relative_string(root_canonical: &Path, target_canonical: &Path) -> String {
    target_canonical
        .strip_prefix(root_canonical)
        .unwrap_or(target_canonical)
        .to_string_lossy()
        .replace('\\', "/")
}

fn is_probably_binary(path: &Path) -> std::result::Result<bool, String> {
    let mut file =
        File::open(path).map_err(|e| format!("Failed to open '{}': {}", path.display(), e))?;
    let mut probe = [0u8; 8192];
    let read = file
        .read(&mut probe)
        .map_err(|e| format!("Failed to read '{}': {}", path.display(), e))?;
    if read == 0 {
        return Ok(false);
    }

    let chunk = &probe[..read];
    Ok(chunk.contains(&0))
}

#[tauri::command]
pub fn agent_read_local_file(
    request: AgentReadLocalFileRequest,
) -> Result<AgentReadLocalFileResponse> {
    let root_canonical = canonicalize_dir(&request.root_dir, "rootDir")?;
    let relative_path = normalize_relative_path(&request.relative_path)?;
    let target_canonical = resolve_scoped_path(&root_canonical, &relative_path, true)?;

    if is_probably_binary(&target_canonical)? {
        return Err("Binary files are not supported by fs.read_file.".to_string());
    }

    let metadata = std::fs::metadata(&target_canonical)
        .map_err(|e| format!("Failed to stat '{}': {}", target_canonical.display(), e))?;
    let total_bytes = metadata.len();

    let start_line = request.start_line.unwrap_or(1).max(1);
    if let Some(end_line) = request.end_line
        && end_line < start_line
    {
        return Err("endLine must be greater than or equal to startLine.".to_string());
    }

    let max_bytes = clamp_usize(
        request.max_bytes,
        DEFAULT_READ_MAX_BYTES,
        MIN_READ_MAX_BYTES,
        MAX_READ_MAX_BYTES,
    );

    let file = File::open(&target_canonical)
        .map_err(|e| format!("Failed to open '{}': {}", target_canonical.display(), e))?;
    let reader = BufReader::new(file);

    let mut current_line = 0u64;
    let mut content = String::new();
    let mut bytes_read = 0usize;
    let mut truncated = false;
    let mut actual_end_line: Option<u64> = None;

    for line_result in reader.lines() {
        let line = line_result
            .map_err(|e| format!("Failed to read '{}': {}", target_canonical.display(), e))?;
        current_line = current_line.saturating_add(1);

        if current_line < start_line {
            continue;
        }

        if let Some(limit) = request.end_line
            && current_line > limit
        {
            break;
        }

        let rendered = format!("{}\n", line);
        let rendered_bytes = rendered.as_bytes();

        if bytes_read + rendered_bytes.len() > max_bytes {
            let remaining = max_bytes.saturating_sub(bytes_read);
            if remaining > 0 {
                let partial = String::from_utf8_lossy(&rendered_bytes[..remaining]);
                content.push_str(&partial);
                bytes_read = bytes_read.saturating_add(remaining);
            }
            truncated = true;
            actual_end_line = Some(current_line);
            break;
        }

        content.push_str(&rendered);
        bytes_read = bytes_read.saturating_add(rendered_bytes.len());
        actual_end_line = Some(current_line);
    }

    Ok(AgentReadLocalFileResponse {
        path: to_root_relative_string(&root_canonical, &target_canonical),
        content,
        truncated,
        total_bytes,
        bytes_read,
        start_line,
        end_line: actual_end_line,
    })
}

#[tauri::command]
pub fn agent_list_local_files(
    request: AgentListLocalFilesRequest,
) -> Result<AgentListLocalFilesResponse> {
    let root_canonical = canonicalize_dir(&request.root_dir, "rootDir")?;
    let relative_dir_input = request.relative_dir.unwrap_or_else(|| ".".to_string());
    let relative_dir = normalize_relative_path(&relative_dir_input)?;
    let dir_canonical = resolve_scoped_path(&root_canonical, &relative_dir, false)?;

    let max_entries = clamp_usize(
        request.max_entries,
        DEFAULT_LIST_MAX_ENTRIES,
        MIN_LIST_MAX_ENTRIES,
        MAX_LIST_MAX_ENTRIES,
    );
    let max_depth = clamp_usize(
        request.max_depth,
        DEFAULT_LIST_MAX_DEPTH,
        MIN_LIST_MAX_DEPTH,
        MAX_LIST_MAX_DEPTH,
    );
    let include_hidden = request.include_hidden.unwrap_or(false);

    let mut entries = Vec::new();
    let mut truncated = false;

    let iter = WalkDir::new(&dir_canonical)
        .min_depth(1)
        .max_depth(max_depth)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            if include_hidden {
                return true;
            }
            let name = entry.file_name().to_string_lossy();
            !name.starts_with('.')
        });

    for walk in iter {
        let entry = match walk {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        if entries.len() >= max_entries {
            truncated = true;
            break;
        }

        let path = entry.path();
        let metadata = match entry.metadata() {
            Ok(meta) => meta,
            Err(_) => continue,
        };

        entries.push(AgentListEntry {
            path: to_root_relative_string(&root_canonical, path),
            is_dir: metadata.is_dir(),
            size: if metadata.is_file() {
                Some(metadata.len())
            } else {
                None
            },
        });
    }

    entries.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(AgentListLocalFilesResponse {
        dir: to_root_relative_string(&root_canonical, &dir_canonical),
        max_entries,
        max_depth,
        truncated,
        entries,
    })
}

#[tauri::command]
pub fn agent_search_local_files(
    request: AgentSearchLocalFilesRequest,
) -> Result<AgentSearchLocalFilesResponse> {
    let root_canonical = canonicalize_dir(&request.root_dir, "rootDir")?;
    let relative_dir_input = request.relative_dir.unwrap_or_else(|| ".".to_string());
    let relative_dir = normalize_relative_path(&relative_dir_input)?;
    let dir_canonical = resolve_scoped_path(&root_canonical, &relative_dir, false)?;

    let query = validate_search_query(&request.query)?;
    let matcher = build_search_matcher(&query, request.search_mode.as_deref())?;

    let max_entries = clamp_usize(
        request.max_entries,
        DEFAULT_LIST_MAX_ENTRIES,
        MIN_LIST_MAX_ENTRIES,
        MAX_LIST_MAX_ENTRIES,
    );
    let max_depth = clamp_usize(
        request.max_depth,
        DEFAULT_LIST_MAX_DEPTH,
        MIN_LIST_MAX_DEPTH,
        MAX_LIST_MAX_DEPTH,
    );
    let include_hidden = request.include_hidden.unwrap_or(false);
    let files_only = request.files_only.unwrap_or(true);

    let mut entries = Vec::new();
    let mut truncated = false;

    let iter = WalkDir::new(&dir_canonical)
        .min_depth(1)
        .max_depth(max_depth)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            if include_hidden {
                return true;
            }
            let name = entry.file_name().to_string_lossy();
            !name.starts_with('.')
        });

    for walk in iter {
        let entry = match walk {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        if entries.len() >= max_entries {
            truncated = true;
            break;
        }

        let path = entry.path();
        let metadata = match entry.metadata() {
            Ok(meta) => meta,
            Err(_) => continue,
        };

        if files_only && !metadata.is_file() {
            continue;
        }

        let relative_path = to_root_relative_string(&root_canonical, path);
        if !matcher.matches(&relative_path) {
            continue;
        }

        entries.push(AgentListEntry {
            path: relative_path,
            is_dir: metadata.is_dir(),
            size: if metadata.is_file() {
                Some(metadata.len())
            } else {
                None
            },
        });
    }

    entries.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(AgentSearchLocalFilesResponse {
        dir: to_root_relative_string(&root_canonical, &dir_canonical),
        query,
        search_mode: matcher.mode_name().to_string(),
        max_entries,
        max_depth,
        truncated,
        entries,
    })
}
