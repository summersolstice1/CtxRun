use tauri::State;

use crate::Result;
use crate::models::{ToolCallRequest, ToolCallResponse, ToolSpec};
use crate::runtime::ToolRuntime;

#[tauri::command]
pub fn list_tools(state: State<'_, ToolRuntime>) -> Result<Vec<ToolSpec>> {
    Ok(state.list_tools())
}

#[tauri::command]
pub async fn call_tool(
    state: State<'_, ToolRuntime>,
    request: ToolCallRequest,
) -> Result<ToolCallResponse> {
    Ok(state.call_tool(request).await)
}
