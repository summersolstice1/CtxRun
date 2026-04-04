use std::{fs, path::PathBuf};

fn read_crate_file(relative_to_crates_dir: &str) -> String {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let crates_dir = manifest_dir
        .parent()
        .expect("workspace-tests should be inside crates/")
        .to_path_buf();

    let target = crates_dir.join(relative_to_crates_dir);
    fs::read_to_string(&target)
        .unwrap_or_else(|e| panic!("failed to read source file {}: {}", target.display(), e))
}

#[test]
fn centralized_prompts_search_keeps_category_parameterized() {
    let src = read_crate_file("db/src/prompts.rs");

    assert!(
        src.contains("sql.push_str(\" AND type = ?\")"),
        "search_prompts should keep category filter parameterized"
    );
    assert!(
        !src.contains("format!(\" AND type = '{}'\", cat)"),
        "search_prompts must not interpolate category via format!"
    );
}

#[test]
fn centralized_refinery_queries_keep_match_and_limit_parameterized() {
    let src = read_crate_file("refinery/src/commands.rs");

    assert!(
        src.contains("refinery_fts MATCH ?"),
        "refinery history query must parameterize FTS MATCH"
    );
    assert!(
        src.contains("ORDER BY updated_at ASC LIMIT ?"),
        "count cleanup query must parameterize LIMIT"
    );
    assert!(
        !src.contains("MATCH \\\"{}\\\""),
        "refinery history query must not interpolate MATCH payload"
    );
    assert!(
        !src.contains("LIMIT {}"),
        "count cleanup query must not interpolate LIMIT directly"
    );
}
