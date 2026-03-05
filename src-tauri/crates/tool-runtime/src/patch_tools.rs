use std::collections::HashMap;

use futures::FutureExt;
use futures::future::BoxFuture;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::models::{ToolAnnotations, ToolSpec};
use crate::runtime::{ApprovalRequirement, ToolExecutionContext, ToolHandler, ToolRuntimeError};
use crate::sandbox::{canonicalize_root, normalize_relative_path, resolve_existing_file};

static FILE_HEADER_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?im)^(?:#{0,3}\s*)?File:\s*(?P<path>.+?)\s*$").expect("valid file header regex")
});

static SEARCH_REPLACE_BLOCK_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?is)<{5,}\s*SEARCH\s*(?P<search>.*?)\s*={5,}\s*(?P<replace>.*?)\s*>{5,}\s*REPLACE",
    )
    .expect("valid SEARCH/REPLACE regex")
});

#[derive(Clone)]
struct PatchOperation {
    original_block: String,
    modified_block: String,
}

#[derive(Clone)]
struct FilePatch {
    file_path: String,
    operations: Vec<PatchOperation>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PatchPreviewFile {
    file_path: String,
    full_path: String,
    original: String,
    modified: String,
    success: bool,
    errors: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatchPreviewArgs {
    root_dir: String,
    patch: String,
    max_files: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatchApplyFileArgs {
    root_dir: String,
    file_path: String,
    content: String,
}

struct ApplyResult {
    modified: String,
    success: bool,
    errors: Vec<String>,
}

pub(crate) struct PatchPreviewTool;
pub(crate) struct PatchApplyFileTool;

impl ToolHandler for PatchPreviewTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "patch.preview_search_replace".to_string(),
            title: "Preview SEARCH/REPLACE Patch".to_string(),
            description:
                "Parse SEARCH/REPLACE patch text and preview file updates in a sandboxed rootDir."
                    .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "rootDir": { "type": "string", "description": "Workspace root directory." },
                    "patch": { "type": "string", "description": "SEARCH/REPLACE patch text." },
                    "maxFiles": { "type": "integer", "minimum": 1, "maximum": 500, "description": "Maximum files to preview." }
                },
                "required": ["rootDir", "patch"]
            }),
            output_schema: Some(json!({
                "type": "object",
                "properties": {
                    "files": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "filePath": { "type": "string" },
                                "fullPath": { "type": "string" },
                                "original": { "type": "string" },
                                "modified": { "type": "string" },
                                "success": { "type": "boolean" },
                                "errors": { "type": "array", "items": { "type": "string" } }
                            },
                            "required": ["filePath", "fullPath", "original", "modified", "success", "errors"]
                        }
                    }
                },
                "required": ["files"]
            })),
            annotations: ToolAnnotations {
                title: Some("Patch Preview".to_string()),
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
            let args: PatchPreviewArgs = serde_json::from_value(arguments)?;
            let root_dir = canonicalize_root(&args.root_dir)?;
            let max_files = args.max_files.unwrap_or(200).clamp(1, 500);

            let file_patches = parse_multi_file_patch(&args.patch);
            let mut preview_files = Vec::new();

            for file_patch in file_patches.into_iter().take(max_files) {
                let file_result = preview_single_file(&root_dir, file_patch);
                preview_files.push(file_result);
            }

            Ok(json!({ "files": preview_files }))
        }
        .boxed()
    }
}

impl ToolHandler for PatchApplyFileTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "patch.apply_file_content".to_string(),
            title: "Apply File Content".to_string(),
            description: "Write final file content to a sandboxed rootDir path.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "rootDir": { "type": "string", "description": "Workspace root directory." },
                    "filePath": { "type": "string", "description": "File path relative to rootDir." },
                    "content": { "type": "string", "description": "Final file content." }
                },
                "required": ["rootDir", "filePath", "content"]
            }),
            output_schema: Some(json!({
                "type": "object",
                "properties": {
                    "filePath": { "type": "string" },
                    "bytesWritten": { "type": "integer" }
                },
                "required": ["filePath", "bytesWritten"]
            })),
            annotations: ToolAnnotations {
                title: Some("Patch Apply".to_string()),
                read_only_hint: false,
                destructive_hint: false,
                idempotent_hint: true,
                open_world_hint: false,
            },
        }
    }

    fn approval_requirement(
        &self,
        arguments: &Value,
    ) -> Result<ApprovalRequirement, ToolRuntimeError> {
        let args: PatchApplyFileArgs = serde_json::from_value(arguments.clone())?;
        Ok(ApprovalRequirement::NeedsApproval {
            reason: format!("Write '{}' under rootDir.", args.file_path.trim()),
        })
    }

    fn call<'a>(
        &'a self,
        arguments: Value,
        context: ToolExecutionContext,
    ) -> BoxFuture<'a, Result<Value, ToolRuntimeError>> {
        async move {
            let _ = context.tool_name;
            let args: PatchApplyFileArgs = serde_json::from_value(arguments)?;
            let root_dir = canonicalize_root(&args.root_dir)?;
            let relative = normalize_relative_path(&args.file_path)?;
            let target = resolve_existing_file(&root_dir, &relative)?;
            std::fs::write(&target, args.content.as_bytes())?;

            Ok(json!({
                "filePath": args.file_path.replace('\\', "/"),
                "bytesWritten": args.content.len()
            }))
        }
        .boxed()
    }
}

fn preview_single_file(root_dir: &std::path::Path, file_patch: FilePatch) -> PatchPreviewFile {
    let relative_path = match normalize_relative_path(&file_patch.file_path) {
        Ok(value) => value,
        Err(err) => {
            return PatchPreviewFile {
                file_path: file_patch.file_path,
                full_path: String::new(),
                original: String::new(),
                modified: String::new(),
                success: false,
                errors: vec![err.to_string()],
            };
        }
    };

    let target_path = match resolve_existing_file(root_dir, &relative_path) {
        Ok(value) => value,
        Err(err) => {
            return PatchPreviewFile {
                file_path: file_patch.file_path,
                full_path: String::new(),
                original: String::new(),
                modified: String::new(),
                success: false,
                errors: vec![err.to_string()],
            };
        }
    };

    let original = match std::fs::read_to_string(&target_path) {
        Ok(value) => value,
        Err(err) => {
            return PatchPreviewFile {
                file_path: file_patch.file_path,
                full_path: target_path.to_string_lossy().to_string(),
                original: String::new(),
                modified: String::new(),
                success: false,
                errors: vec![format!("Failed to read file: {err}")],
            };
        }
    };

    let result = apply_patches(&original, &file_patch.operations);
    PatchPreviewFile {
        file_path: file_patch.file_path.replace('\\', "/"),
        full_path: target_path.to_string_lossy().to_string(),
        original,
        modified: result.modified,
        success: result.success,
        errors: result.errors,
    }
}

fn parse_multi_file_patch(text: &str) -> Vec<FilePatch> {
    let headers: Vec<(String, usize)> = FILE_HEADER_RE
        .captures_iter(text)
        .filter_map(|capture| {
            let full = capture.get(0)?;
            let path = capture.name("path")?.as_str().trim().to_string();
            Some((path, full.start()))
        })
        .collect();

    if headers.is_empty() {
        let operations = parse_operations(text);
        if operations.is_empty() {
            return Vec::new();
        }
        return vec![FilePatch {
            file_path: "current_file".to_string(),
            operations,
        }];
    }

    let mut index_map: HashMap<String, usize> = HashMap::new();
    let mut patches: Vec<FilePatch> = Vec::new();

    for (index, (path, start)) in headers.iter().enumerate() {
        let end = headers
            .get(index + 1)
            .map(|(_, next_start)| *next_start)
            .unwrap_or(text.len());
        let segment = &text[*start..end];
        let operations = parse_operations(segment);
        if operations.is_empty() {
            continue;
        }

        if let Some(existing) = index_map.get(path) {
            patches[*existing].operations.extend(operations);
        } else {
            let patch_index = patches.len();
            patches.push(FilePatch {
                file_path: path.clone(),
                operations,
            });
            index_map.insert(path.clone(), patch_index);
        }
    }

    patches
}

fn parse_operations(content: &str) -> Vec<PatchOperation> {
    SEARCH_REPLACE_BLOCK_RE
        .captures_iter(content)
        .filter_map(|capture| {
            let original = capture.name("search")?.as_str().to_string();
            let modified = capture.name("replace")?.as_str().to_string();
            Some(PatchOperation {
                original_block: original,
                modified_block: modified,
            })
        })
        .collect()
}

fn apply_patches(original_code: &str, operations: &[PatchOperation]) -> ApplyResult {
    let mut current_code = original_code.to_string();
    let mut errors = Vec::new();

    for operation in operations {
        let search_block = &operation.original_block;
        let replace_block = &operation.modified_block;

        if current_code.contains(search_block) {
            current_code = current_code.replacen(search_block, replace_block, 1);
            continue;
        }

        let normalized_code = current_code.replace("\r\n", "\n");
        let normalized_search = search_block.replace("\r\n", "\n");
        if normalized_code.contains(&normalized_search) {
            current_code = normalized_code.replacen(&normalized_search, replace_block, 1);
            continue;
        }

        if let Some(next) = fuzzy_replace(&current_code, search_block, replace_block) {
            current_code = next;
            continue;
        }

        let preview = search_block.chars().take(50).collect::<String>();
        errors.push(format!("Could not locate block:\n{}...", preview));
    }

    ApplyResult {
        modified: current_code,
        success: errors.is_empty(),
        errors,
    }
}

fn fuzzy_replace(source: &str, search: &str, replacement: &str) -> Option<String> {
    let mut source_chars = Vec::new();
    let mut source_map = Vec::new();

    for (byte_index, character) in source.char_indices() {
        if !character.is_whitespace() {
            source_chars.push(character);
            source_map.push(byte_index);
        }
    }

    let search_chars: Vec<char> = search
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect();
    if search_chars.is_empty() || search_chars.len() > source_chars.len() {
        return None;
    }

    let mut match_start = None;
    for start in 0..=(source_chars.len() - search_chars.len()) {
        if source_chars[start..start + search_chars.len()] == search_chars {
            match_start = Some(start);
            break;
        }
    }

    let start_char_index = match_start?;
    let end_char_index = start_char_index + search_chars.len() - 1;

    let original_start = source_map[start_char_index];
    let last_char_start = source_map[end_char_index];
    let last_char_len = source[last_char_start..]
        .chars()
        .next()
        .map(char::len_utf8)
        .unwrap_or(0);
    let mut original_end = last_char_start + last_char_len;

    while original_end < source.len() {
        let mut chars = source[original_end..].chars();
        let Some(next_char) = chars.next() else {
            break;
        };
        if next_char == ' ' || next_char == '\t' {
            original_end += next_char.len_utf8();
            continue;
        }
        break;
    }

    let mut new_code = String::with_capacity(source.len() + replacement.len());
    new_code.push_str(&source[..original_start]);
    new_code.push_str(replacement);
    new_code.push_str(&source[original_end..]);
    Some(new_code)
}

#[cfg(test)]
mod tests {
    use super::{apply_patches, parse_multi_file_patch};

    #[test]
    fn parse_multi_file_patch_merges_same_file_sections() {
        let input = r#"
File: src/main.ts
<<<<<<< SEARCH
console.log("a")
=======
console.log("b")
>>>>>>> REPLACE

File: src/main.ts
<<<<<<< SEARCH
const x = 1
=======
const x = 2
>>>>>>> REPLACE
"#;

        let patches = parse_multi_file_patch(input);
        assert_eq!(patches.len(), 1);
        assert_eq!(patches[0].operations.len(), 2);
    }

    #[test]
    fn apply_patches_supports_fuzzy_whitespace_match() {
        let source = "fn demo() {\n    let value = 1;\n}\n";
        let patches = parse_multi_file_patch(
            r#"
File: src/lib.rs
<<<<<<< SEARCH
let value=1;
=======
let value = 2;
>>>>>>> REPLACE
"#,
        );
        let result = apply_patches(source, &patches[0].operations);
        assert!(result.success);
        assert!(result.modified.contains("let value = 2;"));
    }
}
