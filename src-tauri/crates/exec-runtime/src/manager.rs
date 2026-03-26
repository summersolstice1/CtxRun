use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use ctxrun_process_utils::{new_background_command, new_tokio_background_command};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, ChildStdin};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::models::{
    ExecCommandRequest, ExecExitEvent, ExecExitReason, ExecOutputEvent, ExecOutputStream,
    ExecRequestResponse, ExecRequestStatus, ExecSessionSnapshot, ExecSessionState,
};
use crate::safety::{SafetyDecision, assess_command};

const EXEC_OUTPUT_PREVIEW_CHARS: usize = 16_000;
const DEFAULT_TIMEOUT_MS: u64 = 120_000;
const EXIT_CODE_TERMINATED: i32 = -2;
const EXIT_CODE_TIMED_OUT: i32 = -3;
const EXIT_CODE_WAIT_ERROR: i32 = -4;
const POWERSHELL_EXEC_WRAPPER: &str = r#"
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
$payload = $env:CTXRUN_EXEC_PAYLOAD
if ([string]::IsNullOrWhiteSpace($payload)) {
    throw "Missing CtxRun exec payload."
}
$script = [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String($payload))
& ([ScriptBlock]::Create($script))
"#;

#[derive(Debug, thiserror::Error)]
pub enum ExecRuntimeError {
    #[error("{0}")]
    Message(String),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

impl From<crate::safety::SafetyError> for ExecRuntimeError {
    fn from(value: crate::safety::SafetyError) -> Self {
        Self::Message(value.to_string())
    }
}

struct SessionHandle {
    id: String,
    tool_call_id: Option<String>,
    command: String,
    workdir: String,
    pid: Option<u32>,
    child: Arc<Mutex<Child>>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    stdout_preview: Arc<Mutex<String>>,
    stderr_preview: Arc<Mutex<String>>,
    state: Arc<Mutex<ExecSessionState>>,
    terminate_requested: AtomicBool,
    timed_out: AtomicBool,
    started_at: Instant,
    started_at_ms: u64,
}

impl SessionHandle {
    async fn snapshot(&self, exit_code: Option<i32>) -> ExecSessionSnapshot {
        ExecSessionSnapshot {
            id: self.id.clone(),
            tool_call_id: self.tool_call_id.clone(),
            command: self.command.clone(),
            workdir: self.workdir.clone(),
            state: *self.state.lock().await,
            exit_code,
            exit_reason: None,
            stdout_preview: self.stdout_preview.lock().await.clone(),
            stderr_preview: self.stderr_preview.lock().await.clone(),
            started_at_ms: self.started_at_ms,
            updated_at_ms: now_ms(),
        }
    }
}

#[derive(Clone, Default)]
pub struct ExecRuntime {
    sessions: Arc<Mutex<HashMap<String, Arc<SessionHandle>>>>,
}

impl ExecRuntime {
    pub async fn request_exec<R: Runtime>(
        &self,
        app: AppHandle<R>,
        request: ExecCommandRequest,
    ) -> Result<ExecRequestResponse, ExecRuntimeError> {
        self.handle_request(app, request, false).await
    }

    pub async fn approve_exec<R: Runtime>(
        &self,
        app: AppHandle<R>,
        request: ExecCommandRequest,
    ) -> Result<ExecRequestResponse, ExecRuntimeError> {
        self.handle_request(app, request, true).await
    }

    async fn handle_request<R: Runtime>(
        &self,
        app: AppHandle<R>,
        request: ExecCommandRequest,
        approved: bool,
    ) -> Result<ExecRequestResponse, ExecRuntimeError> {
        let safety_request = request.clone();
        let assessment = tauri::async_runtime::spawn_blocking(move || {
            assess_command(
                &safety_request.command,
                &safety_request.workspace_root,
                safety_request.workdir.as_deref(),
            )
        })
        .await
        .map_err(|err| ExecRuntimeError::Message(err.to_string()))??;

        match assessment.decision {
            SafetyDecision::Blocked => Ok(ExecRequestResponse {
                status: ExecRequestStatus::Blocked,
                session: None,
                approval: None,
                message: Some(assessment.reason),
            }),
            SafetyDecision::ApprovalRequired if !approved => Ok(ExecRequestResponse {
                status: ExecRequestStatus::ApprovalRequired,
                session: None,
                approval: Some(crate::models::ExecApprovalPayload {
                    reason: assessment.reason,
                    risk: assessment.risk,
                    workdir: assessment.workdir.display().to_string(),
                    parsed_commands: assessment.parsed_commands,
                    prefix_rule: assessment.prefix_rule,
                }),
                message: None,
            }),
            _ => {
                let snapshot = self.start_process(app, request, assessment.workdir).await?;
                Ok(ExecRequestResponse {
                    status: ExecRequestStatus::Started,
                    session: Some(snapshot),
                    approval: None,
                    message: None,
                })
            }
        }
    }

    pub async fn write_exec(
        &self,
        session_id: &str,
        input: &str,
    ) -> Result<(), ExecRuntimeError> {
        let Some(session) = self.sessions.lock().await.get(session_id).cloned() else {
            return Err(ExecRuntimeError::Message("exec session not found".to_string()));
        };

        let mut stdin_guard = session.stdin.lock().await;
        let Some(stdin) = stdin_guard.as_mut() else {
            return Err(ExecRuntimeError::Message(
                "exec session does not accept stdin".to_string(),
            ));
        };
        stdin.write_all(input.as_bytes()).await?;
        stdin.flush().await?;
        Ok(())
    }

    pub async fn resize_exec(&self, _session_id: &str) -> Result<(), ExecRuntimeError> {
        Err(ExecRuntimeError::Message(
            "terminal resize is not supported in the current exec runtime".to_string(),
        ))
    }

    pub async fn terminate_exec<R: Runtime>(
        &self,
        app: AppHandle<R>,
        session_id: &str,
    ) -> Result<(), ExecRuntimeError> {
        let Some(session) = self.sessions.lock().await.get(session_id).cloned() else {
            return Err(ExecRuntimeError::Message("exec session not found".to_string()));
        };

        session.terminate_requested.store(true, Ordering::SeqCst);
        if let Some(pid) = session.pid {
            kill_process_tree(pid).await?;
        } else {
            let mut child = session.child.lock().await;
            let _ = child.kill().await;
        }
        let _ = app.emit(
            "exec://state",
            crate::models::ExecStateEvent {
                session_id: session.id.clone(),
                tool_call_id: session.tool_call_id.clone(),
                state: ExecSessionState::Terminated,
            },
        );
        Ok(())
    }

    async fn start_process<R: Runtime>(
        &self,
        app: AppHandle<R>,
        request: ExecCommandRequest,
        workdir: std::path::PathBuf,
    ) -> Result<ExecSessionSnapshot, ExecRuntimeError> {
        let session_id = Uuid::new_v4().to_string();
        let started_at_ms = now_ms();
        let tool_call_id = request.tool_call_id.clone();
        let timeout_ms = request.timeout_ms;
        let command_text = request.command.clone();
        let workdir_display = workdir.display().to_string();

        let encoded_wrapper = encode_utf16_base64(POWERSHELL_EXEC_WRAPPER);
        let encoded_payload = encode_utf16_base64(&command_text);

        let mut command = new_tokio_background_command("powershell.exe");
        command.args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-EncodedCommand",
            &encoded_wrapper,
        ]);
        command.env("CTXRUN_EXEC_PAYLOAD", encoded_payload);
        command.current_dir(&workdir);
        command.stdin(Stdio::piped());
        command.stdout(Stdio::piped());
        command.stderr(Stdio::piped());

        let mut child = command.spawn()?;
        let pid = child.id();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let stdin = child.stdin.take();
        let child = Arc::new(Mutex::new(child));

        let handle = Arc::new(SessionHandle {
            id: session_id.clone(),
            tool_call_id,
            command: request.command,
            workdir: workdir_display,
            pid,
            child,
            stdin: Arc::new(Mutex::new(stdin)),
            stdout_preview: Arc::new(Mutex::new(String::new())),
            stderr_preview: Arc::new(Mutex::new(String::new())),
            state: Arc::new(Mutex::new(ExecSessionState::Running)),
            terminate_requested: AtomicBool::new(false),
            timed_out: AtomicBool::new(false),
            started_at: Instant::now(),
            started_at_ms,
        });

        self.sessions
            .lock()
            .await
            .insert(session_id.clone(), handle.clone());

        let _ = app.emit(
            "exec://state",
            crate::models::ExecStateEvent {
                session_id: session_id.clone(),
                tool_call_id: handle.tool_call_id.clone(),
                state: ExecSessionState::Running,
            },
        );

        if let Some(stdout) = stdout {
            spawn_output_task(app.clone(), handle.clone(), stdout, ExecOutputStream::Stdout);
        }
        if let Some(stderr) = stderr {
            spawn_output_task(app.clone(), handle.clone(), stderr, ExecOutputStream::Stderr);
        }
        spawn_wait_task(self.sessions.clone(), app, handle.clone(), timeout_ms);

        Ok(handle.snapshot(None).await)
    }
}

fn encode_utf16_base64(script: &str) -> String {
    let mut utf16 = Vec::with_capacity(script.len() * 2);
    for unit in script.encode_utf16() {
        utf16.extend_from_slice(&unit.to_le_bytes());
    }
    BASE64_STANDARD.encode(utf16)
}

fn spawn_output_task<R: Runtime>(
    app: AppHandle<R>,
    handle: Arc<SessionHandle>,
    mut reader: impl AsyncRead + Unpin + Send + 'static,
    stream: ExecOutputStream,
) {
    tauri::async_runtime::spawn(async move {
        let mut buffer = [0_u8; 4096];
        loop {
            let read = match reader.read(&mut buffer).await {
                Ok(0) => break,
                Ok(count) => count,
                Err(_) => break,
            };
            let text = String::from_utf8_lossy(&buffer[..read]).to_string();
            {
                let preview = match stream {
                    ExecOutputStream::Stdout => &handle.stdout_preview,
                    ExecOutputStream::Stderr => &handle.stderr_preview,
                };
                let mut preview_guard = preview.lock().await;
                append_capped(&mut preview_guard, &text, EXEC_OUTPUT_PREVIEW_CHARS);
            }
            let _ = app.emit(
                "exec://output",
                ExecOutputEvent {
                    session_id: handle.id.clone(),
                    tool_call_id: handle.tool_call_id.clone(),
                    stream,
                    text,
                },
            );
        }
    });
}

fn spawn_wait_task<R: Runtime>(
    sessions: Arc<Mutex<HashMap<String, Arc<SessionHandle>>>>,
    app: AppHandle<R>,
    handle: Arc<SessionHandle>,
    timeout_ms: Option<u64>,
) {
    tauri::async_runtime::spawn(async move {
        enum WaitOutcome {
            ExitStatus(i32),
            WaitError,
            TimedOut,
        }

        let timeout = Duration::from_millis(timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS));
        let outcome = match tokio::time::timeout(timeout, async {
            let mut child = handle.child.lock().await;
            child.wait().await
        })
        .await
        {
            Ok(Ok(status)) => WaitOutcome::ExitStatus(status.code().unwrap_or(-1)),
            Ok(Err(_)) => WaitOutcome::WaitError,
            Err(_) => {
                handle.terminate_requested.store(true, Ordering::SeqCst);
                handle.timed_out.store(true, Ordering::SeqCst);
                if let Some(pid) = handle.pid {
                    let _ = kill_process_tree(pid).await;
                } else {
                    let mut child = handle.child.lock().await;
                    let _ = child.kill().await;
                }
                WaitOutcome::TimedOut
            }
        };

        let (next_state, exit_code, exit_reason) = if handle.timed_out.load(Ordering::SeqCst) {
            (
                ExecSessionState::Failed,
                EXIT_CODE_TIMED_OUT,
                ExecExitReason::TimedOut,
            )
        } else if handle.terminate_requested.load(Ordering::SeqCst) {
            (
                ExecSessionState::Terminated,
                EXIT_CODE_TERMINATED,
                ExecExitReason::UserTerminated,
            )
        } else {
            match outcome {
                WaitOutcome::ExitStatus(0) => (
                    ExecSessionState::Completed,
                    0,
                    ExecExitReason::ExitZero,
                ),
                WaitOutcome::ExitStatus(code) => (
                    ExecSessionState::Failed,
                    code,
                    ExecExitReason::ExitNonZero,
                ),
                WaitOutcome::WaitError => (
                    ExecSessionState::Failed,
                    EXIT_CODE_WAIT_ERROR,
                    ExecExitReason::WaitError,
                ),
                WaitOutcome::TimedOut => (
                    ExecSessionState::Failed,
                    EXIT_CODE_TIMED_OUT,
                    ExecExitReason::TimedOut,
                ),
            }
        };
        *handle.state.lock().await = next_state;

        let stdout_preview = handle.stdout_preview.lock().await.clone();
        let stderr_preview = handle.stderr_preview.lock().await.clone();

        let _ = app.emit(
            "exec://exit",
            ExecExitEvent {
                session_id: handle.id.clone(),
                tool_call_id: handle.tool_call_id.clone(),
                state: next_state,
                exit_code,
                exit_reason,
                stdout_preview,
                stderr_preview,
                duration_ms: handle.started_at.elapsed().as_millis() as u64,
            },
        );

        let _ = app.emit(
            "exec://state",
            crate::models::ExecStateEvent {
                session_id: handle.id.clone(),
                tool_call_id: handle.tool_call_id.clone(),
                state: next_state,
            },
        );

        sessions.lock().await.remove(&handle.id);
    });
}

fn append_capped(buffer: &mut String, chunk: &str, max_chars: usize) {
    buffer.push_str(chunk);
    if buffer.chars().count() <= max_chars {
        return;
    }

    let mut trimmed = String::new();
    for ch in buffer
        .chars()
        .rev()
        .take(max_chars)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
    {
        trimmed.push(ch);
    }
    *buffer = trimmed;
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(target_os = "windows")]
async fn kill_process_tree(pid: u32) -> Result<(), ExecRuntimeError> {
    let status = tauri::async_runtime::spawn_blocking(move || {
        let mut command = new_background_command("taskkill.exe");
        command.args(["/PID", &pid.to_string(), "/T", "/F"]);
        command.status()
    })
    .await
    .map_err(|err| ExecRuntimeError::Message(err.to_string()))??;

    if status.success() {
        Ok(())
    } else {
        Err(ExecRuntimeError::Message(format!(
            "failed to terminate process tree for pid {}",
            pid
        )))
    }
}

#[cfg(not(target_os = "windows"))]
async fn kill_process_tree(pid: u32) -> Result<(), ExecRuntimeError> {
    let status = tauri::async_runtime::spawn_blocking(move || {
        new_background_command("kill")
            .args(["-TERM", &pid.to_string()])
            .status()
    })
    .await
    .map_err(|err| ExecRuntimeError::Message(err.to_string()))??;

    if status.success() {
        Ok(())
    } else {
        Err(ExecRuntimeError::Message(format!(
            "failed to terminate process tree for pid {}",
            pid
        )))
    }
}
