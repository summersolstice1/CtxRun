use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use regex::Regex;
use serde::Deserialize;

use crate::models::ExecRiskLevel;

#[cfg(target_os = "windows")]
use windows::Win32::System::Threading::CREATE_NO_WINDOW;

const POWERSHELL_PARSER_SCRIPT: &str = include_str!("powershell_parser.ps1");

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SafetyDecision {
    SafeAuto,
    ApprovalRequired,
    Blocked,
}

#[derive(Debug, Clone)]
pub struct SafetyAssessment {
    pub decision: SafetyDecision,
    pub reason: String,
    pub risk: ExecRiskLevel,
    pub workdir: PathBuf,
    pub parsed_commands: Vec<Vec<String>>,
    pub prefix_rule: Option<Vec<String>>,
}

#[derive(Debug, thiserror::Error)]
pub enum SafetyError {
    #[error("workspaceRoot is required.")]
    MissingWorkspaceRoot,
    #[error("command is required.")]
    MissingCommand,
    #[error("workspace root does not exist: {0}")]
    MissingWorkspace(String),
    #[error("working directory does not exist: {0}")]
    MissingWorkdir(String),
    #[error("working directory must stay inside the workspace root.")]
    WorkdirOutsideWorkspace,
}

pub fn assess_command(
    command: &str,
    workspace_root: &str,
    workdir: Option<&str>,
) -> Result<SafetyAssessment, SafetyError> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err(SafetyError::MissingCommand);
    }
    let workdir = resolve_workdir(workspace_root, workdir)?;

    if looks_blocked_raw(trimmed) {
        return Ok(SafetyAssessment {
            decision: SafetyDecision::Blocked,
            reason: "Blocked because the command includes file/process mutation or shell redirection.".to_string(),
            risk: ExecRiskLevel::High,
            workdir,
            parsed_commands: Vec::new(),
            prefix_rule: None,
        });
    }

    let parsed_commands = parse_powershell_script(trimmed).unwrap_or_default();
    if parsed_commands.is_empty() {
        return Ok(SafetyAssessment {
            decision: SafetyDecision::ApprovalRequired,
            reason: "PowerShell syntax is unsupported for auto-approval, so explicit approval is required.".to_string(),
            risk: ExecRiskLevel::High,
            workdir,
            parsed_commands,
            prefix_rule: None,
        });
    }

    if parsed_commands.iter().any(|words| is_blocked_command(words)) {
        return Ok(SafetyAssessment {
            decision: SafetyDecision::Blocked,
            reason: "Blocked because the command maps to a dangerous cmdlet or shell launcher.".to_string(),
            risk: ExecRiskLevel::High,
            workdir,
            parsed_commands,
            prefix_rule: None,
        });
    }

    if parsed_commands.iter().all(|words| is_safe_read_only_command(words)) {
        return Ok(SafetyAssessment {
            decision: SafetyDecision::SafeAuto,
            reason: "Read-only command is in the auto-allowed safelist.".to_string(),
            risk: ExecRiskLevel::Low,
            workdir,
            prefix_rule: None,
            parsed_commands,
        });
    }

    Ok(SafetyAssessment {
        decision: SafetyDecision::ApprovalRequired,
        reason: "Command is not in the read-only safelist and requires explicit approval.".to_string(),
        risk: ExecRiskLevel::Medium,
        prefix_rule: suggested_prefix_rule(&parsed_commands),
        workdir,
        parsed_commands,
    })
}

fn resolve_workdir(workspace_root: &str, workdir: Option<&str>) -> Result<PathBuf, SafetyError> {
    let workspace_root = workspace_root.trim();
    if workspace_root.is_empty() {
        return Err(SafetyError::MissingWorkspaceRoot);
    }
    let root = std::fs::canonicalize(workspace_root)
        .map_err(|_| SafetyError::MissingWorkspace(workspace_root.to_string()))?;

    let target = match workdir.map(str::trim).filter(|value| !value.is_empty()) {
        Some(relative) => root.join(relative),
        None => root.clone(),
    };

    let canonical = std::fs::canonicalize(&target)
        .map_err(|_| SafetyError::MissingWorkdir(target.display().to_string()))?;

    if !canonical.starts_with(&root) {
        return Err(SafetyError::WorkdirOutsideWorkspace);
    }

    Ok(canonical)
}

fn looks_blocked_raw(command: &str) -> bool {
    static BLOCKED_PATTERN: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    static REDIRECTION_PATTERN: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();

    let blocked = BLOCKED_PATTERN.get_or_init(|| {
        Regex::new(
            r"(?i)\b(remove-item|ri|del|erase|rd|rmdir|set-content|add-content|out-file|new-item|copy-item|move-item|rename-item|start-process|stop-process|invoke-item|ii|cmd|bash|sh)\b",
        )
        .expect("valid blocked regex")
    });
    if blocked.is_match(command) {
        return true;
    }

    let redirect = REDIRECTION_PATTERN.get_or_init(|| {
        Regex::new(r"(?m)(^|[^-])>>?").expect("valid redirect regex")
    });
    redirect.is_match(command)
}

fn parse_powershell_script(script: &str) -> Option<Vec<Vec<String>>> {
    let encoded_script = encode_utf16_base64(script);
    let encoded_parser_script = encode_utf16_base64(POWERSHELL_PARSER_SCRIPT);

    let mut command = Command::new("powershell.exe");
    command.args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-EncodedCommand",
            &encoded_parser_script,
        ]);
    command.env("CTXRUN_POWERSHELL_PAYLOAD", encoded_script);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW.0);

    let output = command.output().ok()?;

    if !output.status.success() {
        return None;
    }

    let parsed = serde_json::from_slice::<PowershellParserOutput>(&output.stdout).ok()?;
    match parsed.status.as_str() {
        "ok" => parsed.commands.filter(|commands| !commands.is_empty()),
        _ => None,
    }
}

fn encode_utf16_base64(script: &str) -> String {
    let mut utf16 = Vec::with_capacity(script.len() * 2);
    for unit in script.encode_utf16() {
        utf16.extend_from_slice(&unit.to_le_bytes());
    }
    BASE64_STANDARD.encode(utf16)
}

fn is_safe_read_only_command(words: &[String]) -> bool {
    if words.is_empty() {
        return false;
    }

    let command = normalize_name(&words[0]);
    match command.as_str() {
        "echo" | "write-output" | "write-host" => true,
        "dir" | "ls" | "get-childitem" | "gci" => true,
        "cat" | "type" | "gc" | "get-content" => true,
        "select-string" | "sls" | "findstr" => true,
        "measure-object" | "measure" => true,
        "get-location" | "gl" | "pwd" => true,
        "test-path" | "tp" => true,
        "resolve-path" | "rvpa" => true,
        "select-object" | "select" => true,
        "get-item" => true,
        "git" => is_safe_git_command(words),
        "rg" => is_safe_ripgrep(words),
        _ => false,
    }
}

fn is_safe_git_command(words: &[String]) -> bool {
    let mut iter = words.iter().skip(1);
    while let Some(arg) = iter.next() {
        let arg_lc = arg.to_ascii_lowercase();
        if arg.starts_with('-') {
            if matches!(arg_lc.as_str(), "-c" | "--config" | "--git-dir" | "--work-tree") {
                if iter.next().is_none() {
                    return false;
                }
                continue;
            }
            continue;
        }

        return matches!(
            arg_lc.as_str(),
            "status" | "log" | "show" | "diff" | "cat-file" | "branch"
        ) && git_tail_is_read_only(iter.cloned().collect());
    }

    false
}

fn git_tail_is_read_only(args: Vec<String>) -> bool {
    if args.is_empty() {
        return true;
    }

    let mut saw_branch_query = false;
    for arg in &args {
        let lower = arg.to_ascii_lowercase();
        match lower.as_str() {
            "--list" | "-l" | "--show-current" | "-a" | "--all" | "-r" | "--remotes" | "-v"
            | "-vv" | "--verbose" => {
                saw_branch_query = true;
            }
            _ if lower.starts_with("--format=") => {
                saw_branch_query = true;
            }
            _ if lower.starts_with('-') => {}
            _ => return false,
        }
    }

    saw_branch_query
}

fn is_safe_ripgrep(words: &[String]) -> bool {
    !words.iter().skip(1).any(|arg| {
        let arg_lc = arg.to_ascii_lowercase();
        matches!(arg_lc.as_str(), "--search-zip" | "-z")
            || arg_lc == "--pre"
            || arg_lc.starts_with("--pre=")
            || arg_lc == "--hostname-bin"
            || arg_lc.starts_with("--hostname-bin=")
    })
}

fn is_blocked_command(words: &[String]) -> bool {
    if words.is_empty() {
        return true;
    }

    let command = normalize_name(&words[0]);
    if matches!(
        command.as_str(),
        "set-content"
            | "add-content"
            | "out-file"
            | "new-item"
            | "remove-item"
            | "move-item"
            | "copy-item"
            | "rename-item"
            | "start-process"
            | "stop-process"
            | "invoke-item"
            | "ii"
            | "cmd"
            | "bash"
            | "sh"
    ) {
        return true;
    }

    command == "git" && is_blocked_git_command(words)
}

fn is_blocked_git_command(words: &[String]) -> bool {
    let mut iter = words.iter().skip(1);
    while let Some(arg) = iter.next() {
        let arg_lc = arg.to_ascii_lowercase();
        if arg.starts_with('-') {
            if matches!(arg_lc.as_str(), "-c" | "--config" | "--git-dir" | "--work-tree") {
                let _ = iter.next();
            }
            continue;
        }

        return matches!(arg_lc.as_str(), "reset" | "clean" | "checkout" | "switch" | "restore");
    }

    false
}

fn suggested_prefix_rule(parsed_commands: &[Vec<String>]) -> Option<Vec<String>> {
    let first = parsed_commands.first()?;
    let command = normalize_name(first.first()?);
    match command.as_str() {
        "cargo" | "git" | "python" | "python3" | "pytest" | "npm" | "pnpm" | "yarn" => {
            Some(first.iter().take(2).cloned().collect())
        }
        _ => Some(first.iter().take(1).cloned().collect()),
    }
}

fn normalize_name(value: &str) -> String {
    Path::new(value)
        .file_name()
        .and_then(|segment| segment.to_str())
        .unwrap_or(value)
        .trim_matches(|ch| ch == '(' || ch == ')')
        .trim_start_matches('-')
        .to_ascii_lowercase()
}

#[derive(Debug, Deserialize)]
struct PowershellParserOutput {
    status: String,
    commands: Option<Vec<Vec<String>>>,
}
