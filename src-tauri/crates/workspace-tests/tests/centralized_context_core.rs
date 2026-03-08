use std::{
    fs,
    path::PathBuf,
    process,
    time::{SystemTime, UNIX_EPOCH},
};

use ctxrun_plugin_context::{
    core::{assemble_context_parallel, calculate_stats_parallel},
    processing::strip_comments,
    tokenizer::count_tokens,
};

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

#[test]
fn centralized_strip_comments_removes_c_style_comments() {
    let input = "let a = 1; // line\n/* block */\nlet b = 2;";
    let output = strip_comments(input, "ts");
    assert!(!output.contains("// line"));
    assert!(!output.contains("/* block */"));
    assert!(output.contains("let a = 1;"));
    assert!(output.contains("let b = 2;"));
}

#[test]
fn centralized_strip_comments_removes_hash_comments() {
    let input = "key=1 # comment\n# whole-line\nvalue=2";
    let output = strip_comments(input, "py");
    assert!(!output.contains("# comment"));
    assert!(!output.contains("# whole-line"));
    assert!(output.contains("key=1 "));
    assert!(output.contains("value=2"));
}

#[test]
fn centralized_token_count_increases_with_more_text() {
    let short = "hello";
    let long = "hello world hello world hello world";
    assert!(count_tokens(long) >= count_tokens(short));
}

#[test]
fn centralized_assemble_context_includes_header_and_error_for_missing_file() {
    let root = temp_root("context-missing");
    let missing = root.join("missing.rs");
    let header = "<project_context>".to_string();
    let result = assemble_context_parallel(vec![missing.to_string_lossy().to_string()], header, true);

    assert!(result.contains("<project_context>"));
    assert!(result.contains("<source_files>"));
    assert!(result.contains("[Error: File not found]"));
    assert!(result.contains("</project_context>"));

    let _ = fs::remove_dir_all(root);
}

#[test]
fn centralized_calculate_stats_counts_files_and_tokens() {
    let root = temp_root("context-stats");
    let p1 = root.join("a.rs");
    let p2 = root.join("b.py");
    fs::write(&p1, "fn a() { /*x*/ println!(\"hi\"); }\n").expect("write a.rs");
    fs::write(&p2, "print('x') # comment\n").expect("write b.py");

    let stats = calculate_stats_parallel(
        vec![
            p1.to_string_lossy().to_string(),
            p2.to_string_lossy().to_string(),
        ],
        true,
    );

    assert_eq!(stats.file_count, 2);
    assert!(stats.total_size > 0);
    assert!(stats.total_tokens > 0);

    let _ = fs::remove_dir_all(root);
}
