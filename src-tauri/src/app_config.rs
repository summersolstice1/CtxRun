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
