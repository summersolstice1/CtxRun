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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PowershellParseStatus {
    Ok,
    Unsupported,
    ParseErrors,
    ParseFailed,
}

#[derive(Debug, Clone)]
struct PowershellParseResult {
    status: PowershellParseStatus,
    commands: Vec<Vec<String>>,
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
            reason: "Blocked because the command includes a dangerous process or shell launcher.".to_string(),
            risk: ExecRiskLevel::High,
            workdir,
            parsed_commands: Vec::new(),
            prefix_rule: None,
        });
    }

    let parse_result = parse_powershell_script(trimmed);
    let parsed_commands = parse_result.commands.clone();
    if parsed_commands.is_empty() {
        if let Some(fallback_words) = try_parse_simple_command_words(trimmed) {
            if is_blocked_command(&fallback_words) {
                return Ok(SafetyAssessment {
                    decision: SafetyDecision::Blocked,
                    reason: "Blocked because the command maps to a dangerous cmdlet or shell launcher.".to_string(),
                    risk: ExecRiskLevel::High,
                    workdir,
                    parsed_commands: vec![fallback_words],
                    prefix_rule: None,
                });
            }

            if is_safe_read_only_command(&fallback_words) {
                return Ok(SafetyAssessment {
                    decision: SafetyDecision::SafeAuto,
                    reason: "Simple read-only command matched the fallback safelist after PowerShell parsing was inconclusive.".to_string(),
                    risk: ExecRiskLevel::Low,
                    workdir,
                    parsed_commands: vec![fallback_words],
                    prefix_rule: None,
                });
            }
        }

        let (reason, risk) = match parse_result.status {
            PowershellParseStatus::ParseErrors => (
                "PowerShell parser reported syntax issues, so explicit approval is required.".to_string(),
                ExecRiskLevel::High,
            ),
            PowershellParseStatus::Unsupported => (
                "Command uses PowerShell features the auto-approver cannot fully analyze, so explicit approval is required.".to_string(),
                ExecRiskLevel::Medium,
            ),
            PowershellParseStatus::ParseFailed | PowershellParseStatus::Ok => (
                "PowerShell parser could not classify this command safely, so explicit approval is required.".to_string(),
                ExecRiskLevel::High,
            ),
        };

        return Ok(SafetyAssessment {
            decision: SafetyDecision::ApprovalRequired,
            reason,
            risk,
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

    if !path_is_within_workspace(&canonical, &root) {
        return Err(SafetyError::WorkdirOutsideWorkspace);
    }

    Ok(canonical)
}

fn path_is_within_workspace(path: &Path, root: &Path) -> bool {
    let candidate = normalized_path_components(path);
    let workspace = normalized_path_components(root);
    candidate.len() >= workspace.len()
        && candidate
            .iter()
            .zip(workspace.iter())
            .all(|(candidate, workspace)| candidate == workspace)
}

fn normalized_path_components(path: &Path) -> Vec<String> {
    normalize_path_for_comparison(path)
        .components()
        .map(|component| component.as_os_str().to_string_lossy().to_string())
        .map(|component| {
            #[cfg(target_os = "windows")]
            {
                component.to_ascii_lowercase()
            }
            #[cfg(not(target_os = "windows"))]
            {
                component
            }
        })
        .collect()
}

fn normalize_path_for_comparison(path: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let raw = path.to_string_lossy();
        if let Some(rest) = raw.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{}", rest));
        }
        if let Some(rest) = raw.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
        PathBuf::from(raw.into_owned())
    }

    #[cfg(not(target_os = "windows"))]
    {
        path.to_path_buf()
    }
}

fn looks_blocked_raw(command: &str) -> bool {
    static BLOCKED_PATTERN: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();

    let blocked = BLOCKED_PATTERN.get_or_init(|| {
        Regex::new(
            r"(?i)\b(start-process|stop-process|invoke-item|ii|cmd|bash|sh)\b",
        )
        .expect("valid blocked regex")
    });
    blocked.is_match(command)
}

fn parse_powershell_script(script: &str) -> PowershellParseResult {
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

    let output = match command.output() {
        Ok(output) => output,
        Err(_) => {
            return PowershellParseResult {
                status: PowershellParseStatus::ParseFailed,
                commands: Vec::new(),
            };
        }
    };

    if !output.status.success() {
        return PowershellParseResult {
            status: PowershellParseStatus::ParseFailed,
            commands: Vec::new(),
        };
    }

    let parsed = match serde_json::from_slice::<PowershellParserOutput>(&output.stdout) {
        Ok(parsed) => parsed,
        Err(_) => {
            return PowershellParseResult {
                status: PowershellParseStatus::ParseFailed,
                commands: Vec::new(),
            };
        }
    };

    match parsed.status.as_str() {
        "ok" => PowershellParseResult {
            status: PowershellParseStatus::Ok,
            commands: parsed.commands.unwrap_or_default(),
        },
        "unsupported" => PowershellParseResult {
            status: PowershellParseStatus::Unsupported,
            commands: Vec::new(),
        },
        "parse_errors" => PowershellParseResult {
            status: PowershellParseStatus::ParseErrors,
            commands: Vec::new(),
        },
        _ => PowershellParseResult {
            status: PowershellParseStatus::ParseFailed,
            commands: Vec::new(),
        },
    }
}

fn encode_utf16_base64(script: &str) -> String {
    let mut utf16 = Vec::with_capacity(script.len() * 2);
    for unit in script.encode_utf16() {
        utf16.extend_from_slice(&unit.to_le_bytes());
    }
    BASE64_STANDARD.encode(utf16)
}

fn try_parse_simple_command_words(script: &str) -> Option<Vec<String>> {
    if script
        .chars()
        .any(|ch| matches!(ch, '|' | ';' | '&' | '>' | '<' | '$' | '`' | '(' | ')' | '{' | '}' | '[' | ']'))
    {
        return None;
    }

    let mut words = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;

    for ch in script.chars() {
        match quote {
            Some(active_quote) => {
                if ch == active_quote {
                    quote = None;
                } else {
                    current.push(ch);
                }
            }
            None => match ch {
                '\'' | '"' => {
                    quote = Some(ch);
                }
                ch if ch.is_whitespace() => {
                    if !current.is_empty() {
                        words.push(std::mem::take(&mut current));
                    }
                }
                _ => current.push(ch),
            },
        }
    }

    if quote.is_some() {
        return None;
    }

    if !current.is_empty() {
        words.push(current);
    }

    if words.is_empty() {
        None
    } else {
        Some(words)
    }
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
        "get-date" | "date" => true,
        "hostname" | "whoami" => true,
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
        "start-process"
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

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf};

    use super::{SafetyDecision, assess_command};

    struct TestWorkspace {
        root: PathBuf,
    }

    impl TestWorkspace {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "ctxrun-exec-runtime-safety-{}",
                uuid::Uuid::new_v4()
            ));
            fs::create_dir_all(&root).expect("create temp workspace");
            Self { root }
        }

        fn root_str(&self) -> String {
            self.root.display().to_string()
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn set_content_requires_approval_instead_of_blocking() {
        let workspace = TestWorkspace::new();
        let assessment =
            assess_command("Set-Content notes.txt hello", &workspace.root_str(), None)
                .expect("assess command");

        assert_eq!(assessment.decision, SafetyDecision::ApprovalRequired);
    }

    #[test]
    fn new_item_requires_approval_instead_of_blocking() {
        let workspace = TestWorkspace::new();
        let assessment = assess_command("New-Item notes.txt", &workspace.root_str(), None)
            .expect("assess command");

        assert_eq!(assessment.decision, SafetyDecision::ApprovalRequired);
    }

    #[test]
    fn redirection_requires_approval_instead_of_blocking() {
        let workspace = TestWorkspace::new();
        let assessment = assess_command("\"hello\" > notes.txt", &workspace.root_str(), None)
            .expect("assess command");

        assert_eq!(assessment.decision, SafetyDecision::ApprovalRequired);
    }

    #[test]
    fn start_process_stays_blocked() {
        let workspace = TestWorkspace::new();
        let assessment =
            assess_command("Start-Process notepad", &workspace.root_str(), None)
                .expect("assess command");

        assert_eq!(assessment.decision, SafetyDecision::Blocked);
    }
}

#[derive(Debug, Deserialize)]
struct PowershellParserOutput {
    status: String,
    commands: Option<Vec<Vec<String>>>,
}
