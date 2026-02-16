use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum AutomatorAction {
    MoveTo { x: i32, y: i32 },
    Click { button: MouseButton },
    DoubleClick { button: MouseButton },
    Type { text: String },
    KeyPress { key: String },
    Scroll { delta: i32 },
    Wait { ms: u64 },
    CheckColor { x: i32, y: i32, #[serde(rename = "expectedHex")] expected_hex: String, tolerance: u32 },
    /// 迭代计数器
    Iterate { #[serde(rename = "targetCount")] target_count: u32 },
}

// 图节点结构：通过 action 类型自动判断是否为条件节点
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowNode {
    pub id: String,
    pub action: AutomatorAction,
    // 连线关系
    pub next_id: Option<String>,   // 普通节点执行完走这里
    pub true_id: Option<String>,   // CheckColor 节点匹配成功走这里
    pub false_id: Option<String>,  // CheckColor 节点匹配失败走这里
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
}

#[derive(Debug, Deserialize)]
pub struct AutomatorStoreRoot {
    pub state: AutomatorStoreState,
}

#[derive(Debug, Deserialize)]
pub struct AutomatorStoreState {
    pub active_workflow: Option<Workflow>,
}
