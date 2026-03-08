// src-tauri/crates/miner/src/core/postprocess.rs
//! Markdown post-processing utilities
//!
//! This module provides high-performance post-processing for Markdown content,
//! including fixing multi-line links and removing noise links.

/// Post-process markdown content to fix common issues
///
/// This function performs two main operations:
/// 1. Fixes multi-line links by escaping newlines inside link text
/// 2. Removes "Skip to Content" navigation links
///
/// # Example
/// ```
/// let markdown = "[Long\nlink text](url)";
/// let processed = post_process_markdown(markdown);
/// assert_eq!(processed, "[Long\\\nlink text](url)");
/// ```
pub fn post_process_markdown(markdown: &str) -> String {
    let fixed_links = fix_multiline_links(markdown);
    remove_skip_to_content_links(&fixed_links)
}

/// Fix multi-line links by escaping newlines inside link text
///
/// Markdown links with newlines in the text break the syntax:
/// `[text\nmore](url)` is invalid
///
/// This function escapes newlines inside link brackets:
/// `[text\\\nmore](url)` is valid
fn fix_multiline_links(markdown: &str) -> String {
    let mut link_open_count = 0usize;
    let mut out = String::with_capacity(markdown.len());

    for ch in markdown.chars() {
        match ch {
            '[' => {
                link_open_count += 1;
                out.push(ch);
            }
            ']' => {
                link_open_count = link_open_count.saturating_sub(1);
                out.push(ch);
            }
            '\n' if link_open_count > 0 => {
                // Inside link text, escape the newline
                out.push('\\');
                out.push('\n');
            }
            _ => {
                out.push(ch);
            }
        }
    }

    out
}

/// Remove "Skip to Content" navigation links from markdown
///
/// These accessibility links are useful in HTML but meaningless in Markdown.
/// This function removes patterns like:
/// - `[Skip to Content](#page)`
/// - `[Skip to content](#skip)`
/// - `[SKIP TO CONTENT](#main)`
///
/// Uses byte-level processing for maximum performance.
fn remove_skip_to_content_links(input: &str) -> String {
    const LABEL: &str = "Skip to Content";
    let bytes = input.as_bytes();
    let len = bytes.len();
    let mut out = String::with_capacity(len);
    let mut i = 0;

    'outer: while i < len {
        if bytes[i] == b'[' {
            let label_start = i + 1;
            let label_end = label_start + LABEL.len();

            // Check if we have enough bytes for the label
            if label_end <= len && bytes[label_start..label_end].iter().all(|b| b.is_ascii()) {
                let label_slice = &input[label_start..label_end];

                // Case-insensitive comparison
                if label_slice.eq_ignore_ascii_case(LABEL)
                    && label_end + 3 <= len
                    && bytes[label_end] == b']'
                    && bytes[label_end + 1] == b'('
                    && bytes[label_end + 2] == b'#'
                {
                    // Found "[Skip to Content](#..."
                    // Now find the closing ')'
                    let mut j = label_end + 3;

                    while j < len {
                        let ch = input[j..].chars().next().unwrap();
                        if ch == ')' {
                            // Skip the entire link
                            i = j + ch.len_utf8();
                            continue 'outer;
                        }
                        j += ch.len_utf8();
                    }
                }
            }
        }

        // Not a skip link, copy the character
        let ch = input[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }

    out
}
