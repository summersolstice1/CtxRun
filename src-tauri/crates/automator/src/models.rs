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
