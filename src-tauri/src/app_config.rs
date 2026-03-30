use serde::Deserialize;
use std::fs;
use tauri::{AppHandle, Manager, Runtime};

#[derive(Debug, Deserialize, Default, Clone)]
pub struct AppConfigStore {
    #[serde(default)]
    pub state: AppConfigState,
}

#[derive(Debug, Deserialize, Default, Clone)]
pub struct AppConfigState {
    #[serde(rename = "language")]
    pub language: Option<String>,
    #[serde(rename = "spotlightShortcut")]
    pub spotlight_shortcut: Option<String>,
    #[serde(rename = "automatorShortcut")]
    pub automator_shortcut: Option<String>,
    #[serde(rename = "guardSettings")]
    pub guard_settings: Option<GuardSettingsState>,
    #[serde(rename = "guardEnabled")]
    pub guard_enabled: Option<bool>,
    #[serde(rename = "guardIdleTimeoutSecs")]
    pub guard_idle_timeout_secs: Option<u64>,
    #[serde(rename = "guardPreventSleep")]
    pub guard_prevent_sleep: Option<bool>,
    #[serde(rename = "guardKeepDisplayOn")]
    pub guard_keep_display_on: Option<bool>,
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GuardSettingsState {
    pub enabled: Option<bool>,
    pub idle_timeout_secs: Option<u64>,
    pub prevent_sleep: Option<bool>,
    pub keep_display_on: Option<bool>,
}

pub fn load_app_config_state<R: Runtime>(app: &AppHandle<R>) -> Option<AppConfigState> {
    let app_dir = app.path().app_local_data_dir().ok()?;
    let config_path = app_dir.join("app-config.json");
    let content = fs::read_to_string(config_path).ok()?;
    let config = serde_json::from_str::<AppConfigStore>(&content).ok()?;
    Some(config.state)
}

pub fn load_app_language<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    load_app_config_state(app)?
        .language
        .map(|language| language.trim().to_string())
        .filter(|language| !language.is_empty())
}
