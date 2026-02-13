use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ClickType {
    Left,
    Right,
    Middle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StopCondition {
    Infinite,
    MaxCount(u64),
    // 预留时间限制
    // MaxTime(u64),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickerConfig {
    pub interval_ms: u64,
    pub click_type: ClickType,
    pub stop_condition: StopCondition,
    pub use_fixed_location: bool,
    pub fixed_x: i32,
    pub fixed_y: i32,
}

// [新增] 用于解析 Zustand 生成的 automator-config.json
#[derive(Debug, Deserialize)]
pub struct AutomatorStoreRoot {
    pub state: AutomatorStoreState,
}

#[derive(Debug, Deserialize)]
pub struct AutomatorStoreState {
    pub config: ClickerConfig,
}
