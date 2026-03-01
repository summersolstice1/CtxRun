use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIElementNode {
    pub name: String,
    pub role: String,
    #[serde(rename = "className")]
    pub class_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ActionTarget {
    Coordinate {
        x: i32,
        y: i32
    },
    Semantic {
        name: String,
        role: String,
        #[serde(default)]
        window_title: Option<String>,
        #[serde(default)]
        process_name: Option<String>,
        #[serde(rename = "fallbackX")]
        fallback_x: i32,
        #[serde(rename = "fallbackY")]
        fallback_y: i32,
        #[serde(default)]
        path: Vec<UIElementNode>,
    },
    WebSelector {
        selector: String,
        #[serde(default)]
        url_contain: Option<String>,
        #[serde(rename = "fallbackX")]
        fallback_x: i32,
        #[serde(rename = "fallbackY")]
        fallback_y: i32,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum AutomatorAction {
    MoveTo { target: ActionTarget },
    Click { button: MouseButton, target: Option<ActionTarget> },
    DoubleClick { button: MouseButton, target: Option<ActionTarget> },
    Type { text: String, target: Option<ActionTarget> },
    KeyPress {
        key: String,
        #[serde(default)]
        target: Option<ActionTarget>
    },
    Scroll { delta: i32 },
    Wait { ms: u64 },
    CheckColor { x: i32, y: i32, #[serde(rename = "expectedHex")] expected_hex: String, tolerance: u32 },
    Iterate { #[serde(rename = "targetCount")] target_count: u32 },
    LaunchBrowser {
        browser: String,
        #[serde(default)]
        url: Option<String>,
        #[serde(rename = "useTempProfile")]
        use_temp_profile: bool,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowNode {
    pub id: String,
    pub action: AutomatorAction,
    pub next_id: Option<String>,
    pub true_id: Option<String>,
    pub false_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowGraph {
    pub nodes: std::collections::HashMap<String, WorkflowNode>,
    pub start_node_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workflow {
    pub id: String,
    pub name: String,
    pub actions: Vec<AutomatorAction>,
    pub repeat_count: u32,
    #[serde(default)]
    pub flow_nodes: Vec<PersistedFlowNode>,
    #[serde(default)]
    pub flow_edges: Vec<PersistedFlowEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedFlowNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(default)]
    pub data: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedFlowEdge {
    pub source: String,
    pub target: String,
    #[serde(default)]
    pub source_handle: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AutomatorStoreRoot {
    pub state: AutomatorStoreState,
}

#[derive(Debug, Deserialize)]
pub struct AutomatorStoreState {
    #[serde(default)]
    pub workflows: Vec<Workflow>,
    #[serde(default, alias = "activeWorkflowId")]
    pub active_workflow_id: Option<String>,
    #[serde(default, alias = "activeWorkflow")]
    pub active_workflow: Option<Workflow>,
}
