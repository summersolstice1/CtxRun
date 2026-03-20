use tauri::{AppHandle, Runtime, State};

use crate::Result;
use crate::manager::ExecRuntime;
use crate::models::{
    ExecApprovalRequest, ExecCommandRequest, ExecRequestResponse, ExecResizeRequest,
    ExecTerminateRequest, ExecWriteRequest,
};

#[tauri::command]
pub async fn request_exec<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ExecRuntime>,
    request: ExecCommandRequest,
) -> Result<ExecRequestResponse> {
    state
        .request_exec(app, request)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn approve_exec<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ExecRuntime>,
    request: ExecApprovalRequest,
) -> Result<ExecRequestResponse> {
    let _decision = request.decision;
    state
        .approve_exec(app, request.request)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn write_exec(
    state: State<'_, ExecRuntime>,
    request: ExecWriteRequest,
) -> Result<()> {
    state
        .write_exec(&request.session_id, &request.input)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn resize_exec(
    state: State<'_, ExecRuntime>,
    request: ExecResizeRequest,
) -> Result<()> {
    let _size = (request.cols, request.rows);
    state
        .resize_exec(&request.session_id)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn terminate_exec<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ExecRuntime>,
    request: ExecTerminateRequest,
) -> Result<()> {
    state
        .terminate_exec(app, &request.session_id)
        .await
        .map_err(|err| err.to_string())
}
