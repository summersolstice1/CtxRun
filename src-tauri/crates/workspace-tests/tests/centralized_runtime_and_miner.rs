use std::{
    fs,
    path::PathBuf,
    process,
    time::{SystemTime, UNIX_EPOCH},
};

use ctxrun_plugin_miner::core::postprocess::post_process_markdown;
use ctxrun_plugin_tool_runtime::{ToolCallRequest, ToolCallStatus, ToolRuntime};
use serde_json::json;

fn temp_root(prefix: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let root = std::env::temp_dir().join(format!(
        "ctxrun-workspace-tests-{prefix}-{}-{nanos}",
        process::id()
    ));
    fs::create_dir_all(&root).expect("create temp root");
    root
}

fn ensure_success(
    response: &ctxrun_plugin_tool_runtime::ToolCallResponse,
    context: &str,
) -> serde_json::Value {
    assert_eq!(response.status, ToolCallStatus::Ok, "{context}");
    response
        .data
        .clone()
        .expect("tool response should contain data")
}

fn has_ripgrep() -> bool {
    std::process::Command::new("rg")
        .arg("--version")
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

#[test]
fn centralized_miner_postprocess_fixes_multiline_and_skip_links() {
    let input = "[Skip to Content](#main)\n[Multi\nline](url)";
    let expected = "\n[Multi\\\nline](url)";
    assert_eq!(post_process_markdown(input), expected);
}

#[test]
fn centralized_miner_postprocess_fixes_basic_multiline_link() {
    let input = "[This is a\nlong link](https://example.com)";
    let expected = "[This is a\\\nlong link](https://example.com)";
    assert_eq!(post_process_markdown(input), expected);
}

#[test]
fn centralized_miner_postprocess_fixes_nested_brackets_multiline() {
    let input = "[[nested\ntext]](url)";
    let expected = "[[nested\\\ntext]](url)";
    assert_eq!(post_process_markdown(input), expected);
}

#[test]
fn centralized_miner_postprocess_removes_skip_links_case_insensitive() {
    let input = "[SKIP TO CONTENT](#page)\n[skip to content](#skip)";
    let expected = "\n";
    assert_eq!(post_process_markdown(input), expected);
}

#[test]
fn centralized_miner_postprocess_preserves_non_skip_links() {
    let input = "[Normal Link](#section)\n[Skip to Main Content](#main)";
    let output = post_process_markdown(input);
    assert!(output.contains("[Normal Link](#section)"));
    assert!(output.contains("[Skip to Main Content](#main)"));
}

#[test]
fn centralized_runtime_registers_fs_tools_and_aliases() {
    let runtime = ToolRuntime::new();
    let names = runtime
        .list_tools()
        .into_iter()
        .map(|spec| spec.name)
        .collect::<std::collections::HashSet<_>>();

    for expected in [
        "read_file",
        "fs.read_file",
        "list_dir",
        "fs.list_directory",
        "grep_files",
        "fs.search_files",
    ] {
        assert!(names.contains(expected), "missing tool: {expected}");
    }
}

#[tokio::test]
async fn centralized_read_file_tool_respects_offset_and_limit() {
    let root = temp_root("read-file");
    let path = root.join("sample.txt");
    fs::write(&path, "a\nb\nc\n").expect("write sample");

    let runtime = ToolRuntime::new();
    let response = runtime
        .call_tool(ToolCallRequest {
            name: "read_file".to_string(),
            arguments: json!({
                "rootDir": root.to_string_lossy(),
                "filePath": "sample.txt",
                "offset": 2,
                "limit": 2
            }),
            approved: false,
        })
        .await;

    let data = ensure_success(&response, "read_file should succeed");
    let lines = data["lines"].as_array().expect("lines should be an array");
    assert_eq!(
        lines,
        &vec![json!("L2: b"), json!("L3: c")],
        "read_file should respect offset and limit"
    );
    assert_eq!(data["truncated"], json!(false));

    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn centralized_list_dir_tool_respects_depth_and_paging() {
    let root = temp_root("list-dir");
    let nested = root.join("nested");
    fs::create_dir_all(&nested).expect("create nested");
    fs::write(root.join("root.txt"), "root").expect("write root");
    fs::write(nested.join("child.txt"), "child").expect("write child");

    let runtime = ToolRuntime::new();
    let response = runtime
        .call_tool(ToolCallRequest {
            name: "list_dir".to_string(),
            arguments: json!({
                "rootDir": root.to_string_lossy(),
                "dirPath": ".",
                "offset": 1,
                "limit": 10,
                "depth": 2
            }),
            approved: false,
        })
        .await;

    let data = ensure_success(&response, "list_dir should succeed");
    let entries = data["entries"].as_array().expect("entries should be an array");
    assert_eq!(
        entries,
        &vec![
            json!("  nested/"),
            json!("    child.txt"),
            json!("  root.txt")
        ]
    );
    assert_eq!(data["totalEntries"], json!(3));
    assert_eq!(data["truncated"], json!(false));

    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn centralized_patch_preview_merges_same_file_sections() {
    let root = temp_root("patch-merge");
    let src_dir = root.join("src");
    fs::create_dir_all(&src_dir).expect("create src");
    fs::write(src_dir.join("main.ts"), "console.log(\"a\")\nconst x = 1\n").expect("write file");

    let patch = r#"
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

    let runtime = ToolRuntime::new();
    let response = runtime
        .call_tool(ToolCallRequest {
            name: "patch.preview_search_replace".to_string(),
            arguments: json!({
                "rootDir": root.to_string_lossy(),
                "patch": patch
            }),
            approved: false,
        })
        .await;

    let data = ensure_success(&response, "patch.preview_search_replace should succeed");
    let files = data["files"].as_array().expect("files should be an array");
    assert_eq!(files.len(), 1, "same file sections should be merged");
    assert_eq!(files[0]["success"], json!(true));
    let modified = files[0]["modified"]
        .as_str()
        .expect("modified should be a string");
    assert!(modified.contains("console.log(\"b\")"));
    assert!(modified.contains("const x = 2"));

    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn centralized_patch_preview_supports_fuzzy_whitespace_match() {
    let root = temp_root("patch-fuzzy");
    let src_dir = root.join("src");
    fs::create_dir_all(&src_dir).expect("create src");
    fs::write(src_dir.join("lib.rs"), "fn demo() {\n    let value = 1;\n}\n").expect("write file");

    let patch = r#"
File: src/lib.rs
<<<<<<< SEARCH
let value=1;
=======
let value = 2;
>>>>>>> REPLACE
"#;

    let runtime = ToolRuntime::new();
    let response = runtime
        .call_tool(ToolCallRequest {
            name: "patch.preview_search_replace".to_string(),
            arguments: json!({
                "rootDir": root.to_string_lossy(),
                "patch": patch
            }),
            approved: false,
        })
        .await;

    let data = ensure_success(&response, "patch.preview_search_replace should succeed");
    let files = data["files"].as_array().expect("files should be an array");
    assert_eq!(files.len(), 1);
    assert_eq!(files[0]["success"], json!(true));
    let modified = files[0]["modified"]
        .as_str()
        .expect("modified should be a string");
    assert!(modified.contains("let value = 2;"));

    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn centralized_grep_files_respects_limit() {
    if !has_ripgrep() {
        return;
    }

    let root = temp_root("grep-limit");
    fs::write(root.join("a.rs"), "needle").expect("write a");
    fs::write(root.join("b.rs"), "needle").expect("write b");
    fs::write(root.join("c.rs"), "needle").expect("write c");

    let runtime = ToolRuntime::new();
    let response = runtime
        .call_tool(ToolCallRequest {
            name: "grep_files".to_string(),
            arguments: json!({
                "rootDir": root.to_string_lossy(),
                "pattern": "needle",
                "limit": 2
            }),
            approved: false,
        })
        .await;

    let data = ensure_success(&response, "grep_files should succeed");
    let matches = data["matches"].as_array().expect("matches should be an array");
    assert_eq!(matches.len(), 2, "grep_files should apply the limit");

    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn centralized_grep_files_exact_limit_is_not_truncated() {
    if !has_ripgrep() {
        return;
    }

    let root = temp_root("grep-exact-limit");
    fs::write(root.join("a.rs"), "needle").expect("write a");
    fs::write(root.join("b.rs"), "needle").expect("write b");
    fs::write(root.join("c.rs"), "needle").expect("write c");

    let runtime = ToolRuntime::new();
    let response = runtime
        .call_tool(ToolCallRequest {
            name: "grep_files".to_string(),
            arguments: json!({
                "rootDir": root.to_string_lossy(),
                "pattern": "needle",
                "limit": 3
            }),
            approved: false,
        })
        .await;

    let data = ensure_success(&response, "grep_files should succeed");
    let matches = data["matches"].as_array().expect("matches should be an array");
    assert_eq!(matches.len(), 3, "grep_files should return all matches");
    assert_eq!(
        data["truncated"].as_bool(),
        Some(false),
        "exactly limit matches should not be marked truncated"
    );

    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn centralized_runtime_reports_not_found_for_unknown_tool() {
    let runtime = ToolRuntime::new();
    let response = runtime
        .call_tool(ToolCallRequest {
            name: "unknown.tool".to_string(),
            arguments: json!({}),
            approved: false,
        })
        .await;

    assert_eq!(response.status, ToolCallStatus::NotFound);
}

#[tokio::test]
async fn centralized_patch_apply_requires_approval_by_default() {
    let root = temp_root("patch-approval");
    let target = root.join("note.txt");
    fs::write(&target, "before").expect("write initial file");

    let runtime = ToolRuntime::new();
    let response = runtime
        .call_tool(ToolCallRequest {
            name: "patch.apply_file_content".to_string(),
            arguments: json!({
                "rootDir": root.to_string_lossy(),
                "filePath": "note.txt",
                "content": "after"
            }),
            approved: false,
        })
        .await;

    assert_eq!(response.status, ToolCallStatus::ApprovalRequired);
    let current = fs::read_to_string(&target).expect("read after denied apply");
    assert_eq!(current, "before");

    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn centralized_patch_apply_writes_file_when_approved() {
    let root = temp_root("patch-approved");
    let target = root.join("note.txt");
    fs::write(&target, "before").expect("write initial file");

    let runtime = ToolRuntime::new();
    let response = runtime
        .call_tool(ToolCallRequest {
            name: "patch.apply_file_content".to_string(),
            arguments: json!({
                "rootDir": root.to_string_lossy(),
                "filePath": "note.txt",
                "content": "after"
            }),
            approved: true,
        })
        .await;

    let data = ensure_success(&response, "approved patch.apply_file_content should succeed");
    assert_eq!(data["filePath"], json!("note.txt"));
    assert_eq!(data["bytesWritten"], json!(5));
    let current = fs::read_to_string(&target).expect("read after approved apply");
    assert_eq!(current, "after");

    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn centralized_read_file_rejects_zero_offset() {
    let root = temp_root("read-offset-zero");
    let path = root.join("sample.txt");
    fs::write(&path, "a\n").expect("write sample");

    let runtime = ToolRuntime::new();
    let response = runtime
        .call_tool(ToolCallRequest {
            name: "read_file".to_string(),
            arguments: json!({
                "rootDir": root.to_string_lossy(),
                "filePath": "sample.txt",
                "offset": 0,
                "limit": 1
            }),
            approved: false,
        })
        .await;

    assert_eq!(response.status, ToolCallStatus::Error);
    assert!(
        response
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("offset"),
        "error message should mention invalid offset"
    );

    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn centralized_list_dir_rejects_offset_beyond_entries() {
    let root = temp_root("list-offset-too-large");
    fs::write(root.join("a.txt"), "a").expect("write sample file");

    let runtime = ToolRuntime::new();
    let response = runtime
        .call_tool(ToolCallRequest {
            name: "list_dir".to_string(),
            arguments: json!({
                "rootDir": root.to_string_lossy(),
                "dirPath": ".",
                "offset": 99,
                "limit": 10,
                "depth": 1
            }),
            approved: false,
        })
        .await;

    assert_eq!(response.status, ToolCallStatus::Error);
    assert!(
        response
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("offset"),
        "error message should mention invalid offset"
    );

    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn centralized_grep_files_rejects_empty_pattern() {
    let root = temp_root("grep-empty-pattern");
    fs::write(root.join("a.txt"), "content").expect("write sample file");

    let runtime = ToolRuntime::new();
    let response = runtime
        .call_tool(ToolCallRequest {
            name: "grep_files".to_string(),
            arguments: json!({
                "rootDir": root.to_string_lossy(),
                "pattern": "   ",
                "limit": 10
            }),
            approved: false,
        })
        .await;

    assert_eq!(response.status, ToolCallStatus::Error);
    assert!(
        response
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("pattern"),
        "error message should mention empty pattern"
    );

    let _ = fs::remove_dir_all(root);
}
