use std::collections::VecDeque;
use std::ffi::OsStr;
use std::fs::FileType;
use std::path::{Path, PathBuf};
use std::time::Duration;

use futures::FutureExt;
use futures::future::BoxFuture;
use ctxrun_process_utils::new_tokio_background_command;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::fs;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::time::timeout;

use crate::models::{ToolAnnotations, ToolSpec};
use crate::runtime::{ToolExecutionContext, ToolHandler, ToolRuntimeError};
use crate::sandbox::{
    canonicalize_root, normalize_relative_path, resolve_existing_dir, resolve_existing_file,
    resolve_existing_path,
};

const READ_DEFAULT_OFFSET: usize = 1;
const READ_DEFAULT_LIMIT: usize = 2000;
const READ_MAX_LINE_CHARS: usize = 500;

const LIST_DEFAULT_OFFSET: usize = 1;
const LIST_DEFAULT_LIMIT: usize = 25;
const LIST_DEFAULT_DEPTH: usize = 2;
const LIST_MAX_ENTRY_CHARS: usize = 500;
const LIST_INDENT_SPACES: usize = 2;

const GREP_DEFAULT_LIMIT: usize = 100;
const GREP_MAX_LIMIT: usize = 2000;
const GREP_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadFileArgs {
    root_dir: String,
    file_path: String,
    #[serde(default = "read_default_offset")]
    offset: usize,
    #[serde(default = "read_default_limit")]
    limit: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListDirArgs {
    root_dir: String,
    #[serde(default = "default_relative_dot")]
    dir_path: String,
    #[serde(default = "list_default_offset")]
    offset: usize,
    #[serde(default = "list_default_limit")]
    limit: usize,
    #[serde(default = "list_default_depth")]
    depth: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrepFilesArgs {
    root_dir: String,
    pattern: String,
    #[serde(default)]
    include: Option<String>,
    #[serde(default = "default_relative_dot")]
    path: String,
    #[serde(default = "grep_default_limit")]
    limit: usize,
}

pub(crate) struct FsReadFileTool {
    name: &'static str,
    title: &'static str,
}

pub(crate) struct FsListDirTool {
    name: &'static str,
    title: &'static str,
}

pub(crate) struct FsGrepFilesTool {
    name: &'static str,
    title: &'static str,
}

impl FsReadFileTool {
    pub(crate) const fn new(name: &'static str, title: &'static str) -> Self {
        Self { name, title }
    }
}

impl FsListDirTool {
    pub(crate) const fn new(name: &'static str, title: &'static str) -> Self {
        Self { name, title }
    }
}

impl FsGrepFilesTool {
    pub(crate) const fn new(name: &'static str, title: &'static str) -> Self {
        Self { name, title }
    }
}

impl ToolHandler for FsReadFileTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: self.name.to_string(),
            title: self.title.to_string(),
            description: "Reads a local file with 1-indexed line numbers.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "rootDir": { "type": "string", "description": "Workspace root directory scope." },
                    "filePath": { "type": "string", "description": "Path relative to rootDir." },
                    "offset": { "type": "integer", "minimum": 1, "description": "1-indexed start line." },
                    "limit": { "type": "integer", "minimum": 1, "description": "Maximum number of lines to return." }
                },
                "required": ["rootDir", "filePath"]
            }),
            output_schema: Some(json!({
                "type": "object",
                "properties": {
                    "rootDir": { "type": "string" },
                    "filePath": { "type": "string" },
                    "offset": { "type": "integer" },
                    "limit": { "type": "integer" },
                    "lines": { "type": "array", "items": { "type": "string" } },
                    "truncated": { "type": "boolean" }
                },
                "required": ["rootDir", "filePath", "offset", "limit", "lines", "truncated"]
            })),
            annotations: ToolAnnotations {
                title: Some("Read File".to_string()),
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
            let args: ReadFileArgs = serde_json::from_value(arguments)?;
            if args.offset == 0 {
                return Err(ToolRuntimeError::InvalidArguments(
                    "offset must be a 1-indexed line number.".to_string(),
                ));
            }
            if args.limit == 0 {
                return Err(ToolRuntimeError::InvalidArguments(
                    "limit must be greater than zero.".to_string(),
                ));
            }

            let root_dir = canonicalize_root(&args.root_dir)?;
            let relative = normalize_relative_path(&args.file_path)?;
            let target = resolve_existing_file(&root_dir, &relative)?;

            let (lines, truncated) = read_file_lines(&target, args.offset, args.limit).await?;
            Ok(json!({
                "rootDir": root_dir.to_string_lossy(),
                "filePath": to_root_relative(&root_dir, &target),
                "offset": args.offset,
                "limit": args.limit,
                "lines": lines,
                "truncated": truncated
            }))
        }
        .boxed()
    }
}

impl ToolHandler for FsListDirTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: self.name.to_string(),
            title: self.title.to_string(),
            description: "Lists entries in a local directory with pagination and depth control."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "rootDir": { "type": "string", "description": "Workspace root directory scope." },
                    "dirPath": { "type": "string", "description": "Directory path relative to rootDir. Defaults to \".\"." },
                    "offset": { "type": "integer", "minimum": 1, "description": "1-indexed entry offset." },
                    "limit": { "type": "integer", "minimum": 1, "description": "Maximum number of entries to return." },
                    "depth": { "type": "integer", "minimum": 1, "description": "Maximum directory traversal depth." }
                },
                "required": ["rootDir"]
            }),
            output_schema: Some(json!({
                "type": "object",
                "properties": {
                    "rootDir": { "type": "string" },
                    "dirPath": { "type": "string" },
                    "offset": { "type": "integer" },
                    "limit": { "type": "integer" },
                    "depth": { "type": "integer" },
                    "entries": { "type": "array", "items": { "type": "string" } },
                    "totalEntries": { "type": "integer" },
                    "truncated": { "type": "boolean" }
                },
                "required": ["rootDir", "dirPath", "offset", "limit", "depth", "entries", "totalEntries", "truncated"]
            })),
            annotations: ToolAnnotations {
                title: Some("List Directory".to_string()),
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
            let args: ListDirArgs = serde_json::from_value(arguments)?;
            if args.offset == 0 {
                return Err(ToolRuntimeError::InvalidArguments(
                    "offset must be a 1-indexed entry number.".to_string(),
                ));
            }
            if args.limit == 0 {
                return Err(ToolRuntimeError::InvalidArguments(
                    "limit must be greater than zero.".to_string(),
                ));
            }
            if args.depth == 0 {
                return Err(ToolRuntimeError::InvalidArguments(
                    "depth must be greater than zero.".to_string(),
                ));
            }

            let root_dir = canonicalize_root(&args.root_dir)?;
            let relative = normalize_relative_path(&args.dir_path)?;
            let target = resolve_existing_dir(&root_dir, &relative)?;

            let (entries, total_entries, truncated) =
                list_dir_slice(&target, &relative, args.offset, args.limit, args.depth).await?;

            Ok(json!({
                "rootDir": root_dir.to_string_lossy(),
                "dirPath": to_root_relative(&root_dir, &target),
                "offset": args.offset,
                "limit": args.limit,
                "depth": args.depth,
                "entries": entries,
                "totalEntries": total_entries,
                "truncated": truncated
            }))
        }
        .boxed()
    }
}

impl ToolHandler for FsGrepFilesTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: self.name.to_string(),
            title: self.title.to_string(),
            description: "Finds files whose contents match the regex pattern.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "rootDir": { "type": "string", "description": "Workspace root directory scope." },
                    "pattern": { "type": "string", "description": "Regular expression pattern to search for." },
                    "include": { "type": "string", "description": "Optional glob filter, e.g. \"*.rs\"." },
                    "path": { "type": "string", "description": "Relative path under rootDir to search. Defaults to \".\"." },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 2000, "description": "Maximum file paths to return." }
                },
                "required": ["rootDir", "pattern"]
            }),
            output_schema: Some(json!({
                "type": "object",
                "properties": {
                    "rootDir": { "type": "string" },
                    "path": { "type": "string" },
                    "pattern": { "type": "string" },
                    "matches": { "type": "array", "items": { "type": "string" } },
                    "limit": { "type": "integer" },
                    "truncated": { "type": "boolean" }
                },
                "required": ["rootDir", "path", "pattern", "matches", "limit", "truncated"]
            })),
            annotations: ToolAnnotations {
                title: Some("Grep Files".to_string()),
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
            let args: GrepFilesArgs = serde_json::from_value(arguments)?;
            let pattern = args.pattern.trim();
            if pattern.is_empty() {
                return Err(ToolRuntimeError::InvalidArguments(
                    "pattern must not be empty.".to_string(),
                ));
            }
            if args.limit == 0 {
                return Err(ToolRuntimeError::InvalidArguments(
                    "limit must be greater than zero.".to_string(),
                ));
            }

            let root_dir = canonicalize_root(&args.root_dir)?;
            let relative = normalize_relative_path(&args.path)?;
            let search_path = resolve_existing_path(&root_dir, &relative)?;
            let limit = args.limit.min(GREP_MAX_LIMIT);
            let include = args
                .include
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned);

            let (matches, truncated) =
                run_rg_search(pattern, include.as_deref(), &search_path, limit).await?;

            Ok(json!({
                "rootDir": root_dir.to_string_lossy(),
                "path": to_root_relative(&root_dir, &search_path),
                "pattern": pattern,
                "matches": matches,
                "limit": limit,
                "truncated": truncated
            }))
        }
        .boxed()
    }
}

async fn read_file_lines(
    path: &Path,
    offset: usize,
    limit: usize,
) -> Result<(Vec<String>, bool), ToolRuntimeError> {
    let file = fs::File::open(path)
        .await
        .map_err(|err| ToolRuntimeError::Message(format!("Failed to open file: {err}")))?;
    let mut reader = BufReader::new(file);
    let mut lines = Vec::new();
    let mut seen = 0usize;
    let mut truncated = false;
    let mut buffer = Vec::new();

    loop {
        buffer.clear();
        let bytes_read = reader
            .read_until(b'\n', &mut buffer)
            .await
            .map_err(|err| ToolRuntimeError::Message(format!("Failed to read file: {err}")))?;

        if bytes_read == 0 {
            break;
        }

        if buffer.last() == Some(&b'\n') {
            buffer.pop();
            if buffer.last() == Some(&b'\r') {
                buffer.pop();
            }
        }

        seen = seen.saturating_add(1);

        if seen < offset {
            continue;
        }

        if lines.len() == limit {
            truncated = true;
            break;
        }

        let decoded = String::from_utf8_lossy(&buffer).into_owned();
        lines.push(format!(
            "L{seen}: {}",
            truncate_chars(&decoded, READ_MAX_LINE_CHARS)
        ));
    }

    if seen < offset {
        return Err(ToolRuntimeError::InvalidArguments(
            "offset exceeds file length.".to_string(),
        ));
    }

    Ok((lines, truncated))
}

async fn list_dir_slice(
    dir_path: &Path,
    relative_prefix: &Path,
    offset: usize,
    limit: usize,
    depth: usize,
) -> Result<(Vec<String>, usize, bool), ToolRuntimeError> {
    let mut entries = Vec::new();
    collect_entries(dir_path, relative_prefix, depth, &mut entries).await?;

    if entries.is_empty() {
        return Ok((Vec::new(), 0, false));
    }

    entries.sort_unstable_by(|lhs, rhs| lhs.name.cmp(&rhs.name));

    let start_index = offset - 1;
    if start_index >= entries.len() {
        return Err(ToolRuntimeError::InvalidArguments(
            "offset exceeds directory entry count.".to_string(),
        ));
    }

    let remaining = entries.len() - start_index;
    let capped_limit = limit.min(remaining);
    let end_index = start_index + capped_limit;
    let selected = &entries[start_index..end_index];
    let mut formatted = selected
        .iter()
        .map(format_entry_line)
        .collect::<Vec<String>>();

    let truncated = end_index < entries.len();
    if truncated {
        formatted.push(format!("More than {capped_limit} entries found"));
    }

    Ok((formatted, entries.len(), truncated))
}

async fn collect_entries(
    dir_path: &Path,
    relative_prefix: &Path,
    depth: usize,
    entries: &mut Vec<DirEntry>,
) -> Result<(), ToolRuntimeError> {
    let mut queue = VecDeque::new();
    queue.push_back((dir_path.to_path_buf(), relative_prefix.to_path_buf(), depth));

    while let Some((current_dir, prefix, remaining_depth)) = queue.pop_front() {
        let mut read_dir = fs::read_dir(&current_dir)
            .await
            .map_err(|err| ToolRuntimeError::Message(format!("Failed to read directory: {err}")))?;

        let mut local_entries = Vec::new();
        while let Some(entry) = read_dir
            .next_entry()
            .await
            .map_err(|err| ToolRuntimeError::Message(format!("Failed to read directory: {err}")))?
        {
            let file_type = entry.file_type().await.map_err(|err| {
                ToolRuntimeError::Message(format!("Failed to inspect directory entry: {err}"))
            })?;

            let file_name = entry.file_name();
            let relative_path = if prefix.as_os_str().is_empty() {
                PathBuf::from(&file_name)
            } else {
                prefix.join(&file_name)
            };

            let display_name = format_entry_component(&file_name);
            let display_depth = relative_path
                .parent()
                .map(|parent| parent.components().count())
                .unwrap_or(0);
            let sort_key = format_entry_name(&relative_path);
            let kind = DirEntryKind::from(&file_type);

            local_entries.push((
                entry.path(),
                relative_path,
                kind,
                DirEntry {
                    name: sort_key,
                    display_name,
                    depth: display_depth,
                    kind,
                },
            ));
        }

        local_entries.sort_unstable_by(|lhs, rhs| lhs.3.name.cmp(&rhs.3.name));
        for (entry_path, relative_path, kind, dir_entry) in local_entries {
            if kind == DirEntryKind::Directory && remaining_depth > 1 {
                queue.push_back((entry_path, relative_path, remaining_depth - 1));
            }
            entries.push(dir_entry);
        }
    }

    Ok(())
}

async fn run_rg_search(
    pattern: &str,
    include: Option<&str>,
    search_path: &Path,
    limit: usize,
) -> Result<(Vec<String>, bool), ToolRuntimeError> {
    let mut command = new_tokio_background_command("rg");
    command
        .arg("--files-with-matches")
        .arg("--sortr=modified")
        .arg("--regexp")
        .arg(pattern)
        .arg("--no-messages");

    if let Some(glob) = include {
        command.arg("--glob").arg(glob);
    }

    command.arg("--").arg(search_path);

    let output = timeout(GREP_TIMEOUT, command.output())
        .await
        .map_err(|_| ToolRuntimeError::Message("rg timed out after 30 seconds.".to_string()))?
        .map_err(|err| {
            ToolRuntimeError::Message(format!(
                "Failed to launch rg: {err}. Ensure ripgrep is installed and on PATH."
            ))
        })?;

    match output.status.code() {
        Some(0) => Ok(parse_rg_results(&output.stdout, limit)),
        Some(1) => Ok((Vec::new(), false)),
        _ => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(ToolRuntimeError::Message(format!("rg failed: {stderr}")))
        }
    }
}

fn parse_rg_results(stdout: &[u8], limit: usize) -> (Vec<String>, bool) {
    let mut results = Vec::new();
    let mut truncated = false;
    for line in stdout.split(|byte| *byte == b'\n') {
        if line.is_empty() {
            continue;
        }
        let text = String::from_utf8_lossy(line).trim().to_string();
        if text.is_empty() {
            continue;
        }
        if results.len() < limit {
            results.push(text.replace('\\', "/"));
        } else {
            truncated = true;
            break;
        }
    }
    (results, truncated)
}

fn to_root_relative(root_dir: &Path, path: &Path) -> String {
    path.strip_prefix(root_dir)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn truncate_chars(input: &str, max_chars: usize) -> String {
    if input.chars().count() <= max_chars {
        return input.to_string();
    }
    input.chars().take(max_chars).collect()
}

fn format_entry_name(path: &Path) -> String {
    truncate_chars(
        &path.to_string_lossy().replace('\\', "/"),
        LIST_MAX_ENTRY_CHARS,
    )
}

fn format_entry_component(name: &OsStr) -> String {
    truncate_chars(&name.to_string_lossy(), LIST_MAX_ENTRY_CHARS)
}

fn format_entry_line(entry: &DirEntry) -> String {
    let indent = " ".repeat(entry.depth * LIST_INDENT_SPACES);
    let mut name = entry.display_name.clone();
    match entry.kind {
        DirEntryKind::Directory => name.push('/'),
        DirEntryKind::Symlink => name.push('@'),
        DirEntryKind::Other => name.push('?'),
        DirEntryKind::File => {}
    }
    format!("{indent}{name}")
}

fn read_default_offset() -> usize {
    READ_DEFAULT_OFFSET
}

fn read_default_limit() -> usize {
    READ_DEFAULT_LIMIT
}

fn list_default_offset() -> usize {
    LIST_DEFAULT_OFFSET
}

fn list_default_limit() -> usize {
    LIST_DEFAULT_LIMIT
}

fn list_default_depth() -> usize {
    LIST_DEFAULT_DEPTH
}

fn grep_default_limit() -> usize {
    GREP_DEFAULT_LIMIT
}

fn default_relative_dot() -> String {
    ".".to_string()
}

#[derive(Clone)]
struct DirEntry {
    name: String,
    display_name: String,
    depth: usize,
    kind: DirEntryKind,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum DirEntryKind {
    Directory,
    File,
    Symlink,
    Other,
}

impl From<&FileType> for DirEntryKind {
    fn from(file_type: &FileType) -> Self {
        if file_type.is_symlink() {
            DirEntryKind::Symlink
        } else if file_type.is_dir() {
            DirEntryKind::Directory
        } else if file_type.is_file() {
            DirEntryKind::File
        } else {
            DirEntryKind::Other
        }
    }
}
