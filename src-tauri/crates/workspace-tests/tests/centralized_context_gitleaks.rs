use ctxrun_plugin_context::gitleaks::{allowlist::is_safe_value, scan_text};

fn assert_detected_secret(secret: &str, expected_kind: &str) {
    let text = format!("const secret = \"{secret}\";\n");
    let matches = scan_text(&text);
    let hit = matches
        .iter()
        .find(|m| m.value == secret)
        .unwrap_or_else(|| panic!("expected {expected_kind} to be detected for sample: {secret}"));

    assert_eq!(hit.kind, expected_kind);
}

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

#[test]
fn centralized_gitleaks_scan_detects_fixed_communication_and_payment_rules() {
    assert_detected_secret(
        "https://hooks.slack.com/services/T12345678/B87654321/A1b2C3d4E5f6G7h8I9j0K1l2",
        "slack-webhook",
    );
    assert_detected_secret(
        "https://discord.com/api/webhooks/123456789012345678/Az0_By1Cx2Dw3Ev4Fu5Gt6Hs7Ir8Jq9Kp-Lm_NoOpPqQrRsStTuUvVwWxXyYzZ012345",
        "discord-webhook",
    );
    assert_detected_secret(
        "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",
        "sendgrid-api-key",
    );
    assert_detected_secret(
        "access_token$production$a1b2c3d4e5f6g7h8$0123456789abcdeffedcba9876543210",
        "paypal-braintree-access-token",
    );
}
