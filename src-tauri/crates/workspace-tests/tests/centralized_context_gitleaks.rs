use ctxrun_plugin_context::gitleaks::{allowlist::is_safe_value, scan_text};

#[test]
fn centralized_gitleaks_allowlist_recognizes_safe_placeholders() {
    assert!(is_safe_value("true"));
    assert!(is_safe_value("${{ secrets.GITHUB_TOKEN }}"));
    assert!(is_safe_value("http://example.com"));
    assert!(is_safe_value("todo-change-me"));
}

#[test]
fn centralized_gitleaks_allowlist_rejects_non_placeholder_secret_shape() {
    assert!(!is_safe_value("skABCDEFGHIJKLMNOPQRSTUVWX1234567890ABCDEFGHIJKL"));
}

#[test]
fn centralized_gitleaks_scan_detects_openai_style_key_and_enriches_context() {
    let secret = "sk-A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8";
    let text = format!("const key = \"{secret}\";\nconsole.log('ok');\n");

    let matches = scan_text(&text);
    assert!(!matches.is_empty(), "scan_text should detect openai-style key");
    let hit = matches
        .iter()
        .find(|m| m.value == secret)
        .expect("detected matches should include the expected secret value");

    assert!(!hit.kind.is_empty());
    assert_eq!(hit.line_number, 1);
    assert!(hit.snippet.contains("const key"));
    assert!(hit.utf16_index <= text.encode_utf16().count());
}

#[test]
fn centralized_gitleaks_scan_ignores_whitelisted_template_values() {
    let text = "token = \"${{ secrets.GITHUB_TOKEN }}\"";
    let matches = scan_text(text);
    assert!(
        !matches
            .iter()
            .any(|m| m.value.contains("${{ secrets.GITHUB_TOKEN }}")),
        "whitelisted template values should not be reported as secrets"
    );
}
