use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolAnnotations {
    pub title: Option<String>,
    pub read_only_hint: bool,
    pub destructive_hint: bool,
    pub idempotent_hint: bool,
    pub open_world_hint: bool,
}

impl Default for ToolAnnotations {
    fn default() -> Self {
        Self {
            title: None,
            read_only_hint: false,
            destructive_hint: false,
            idempotent_hint: false,
            open_world_hint: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSpec {
    pub name: String,
    pub title: String,
    pub description: String,
    pub input_schema: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_schema: Option<Value>,
    pub annotations: ToolAnnotations,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallRequest {
    pub name: String,
    #[serde(default)]
    pub arguments: Value,
    #[serde(default)]
    pub approved: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolCallStatus {
    Ok,
    ApprovalRequired,
    Rejected,
    NotFound,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallResponse {
    pub status: ToolCallStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_reason: Option<String>,
}

impl ToolCallResponse {
    pub fn ok(data: Value) -> Self {
        Self {
            status: ToolCallStatus::Ok,
            data: Some(data),
            message: None,
            approval_reason: None,
        }
    }

    pub fn approval_required(reason: impl Into<String>) -> Self {
        Self {
            status: ToolCallStatus::ApprovalRequired,
            data: None,
            message: None,
            approval_reason: Some(reason.into()),
        }
    }

    pub fn rejected(reason: impl Into<String>) -> Self {
        Self {
            status: ToolCallStatus::Rejected,
            data: None,
            message: Some(reason.into()),
            approval_reason: None,
        }
    }

    pub fn not_found(reason: impl Into<String>) -> Self {
        Self {
            status: ToolCallStatus::NotFound,
            data: None,
            message: Some(reason.into()),
            approval_reason: None,
        }
    }

    pub fn error(reason: impl Into<String>) -> Self {
        Self {
            status: ToolCallStatus::Error,
            data: None,
            message: Some(reason.into()),
            approval_reason: None,
        }
    }
}
