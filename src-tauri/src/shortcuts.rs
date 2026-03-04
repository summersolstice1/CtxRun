use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use ctxrun_plugin_automator;
#[derive(Deserialize, Debug)]
struct AppConfigStore {
    state: AppConfigState,
}

#[derive(Deserialize, Debug)]
struct AppConfigState {
    #[serde(rename = "spotlightShortcut")]
    spotlight_shortcut: String,
    #[serde(rename = "automatorShortcut")]
    automator_shortcut: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ShortcutAction {
    ToggleSpotlight,
    ToggleAutomator,
}

pub struct ShortcutManager {
    registered: Mutex<HashMap<ShortcutAction, String>>,
}

impl ShortcutManager {
    pub fn new() -> Self {
        Self {
            registered: Mutex::new(HashMap::new()),
        }
    }

    pub fn refresh<R: Runtime>(&self, app: &AppHandle<R>) {
        let app_dir = app.path().app_local_data_dir().unwrap();
        let config_path = app_dir.join("app-config.json");

        let mut spotlight_key = "Alt+S".to_string();
        let mut automator_key = "Alt+F1".to_string();
        if config_path.exists() {
            if let Ok(content) = fs::read_to_string(config_path) {
                if let Ok(config) = serde_json::from_str::<AppConfigStore>(&content) {
                    if !config.state.spotlight_shortcut.is_empty() {
                        spotlight_key = config.state.spotlight_shortcut;
                    }
                    if !config.state.automator_shortcut.is_empty() {
                        automator_key = config.state.automator_shortcut;
                    }
                }
            }
        }

        let _ = self.update_shortcut(app, ShortcutAction::ToggleSpotlight, spotlight_key);
        let _ = self.update_shortcut(app, ShortcutAction::ToggleAutomator, automator_key);
    }

    fn update_shortcut<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        action: ShortcutAction,
        new_key: String,
    ) -> crate::error::Result<()> {
        let mut registered = self.registered.lock().unwrap();

        if let Some(old_key) = registered.get(&action) {
            if *old_key == new_key {
                return Ok(());
            }
            if let Ok(shortcut) = old_key.parse::<Shortcut>() {
                let _ = app.global_shortcut().unregister(shortcut);
            }
        }
        let shortcut = new_key.parse::<Shortcut>().map_err(|e| e.to_string())?;

        let action_clone = action.clone();
        app.global_shortcut()
            .on_shortcut(shortcut, move |app_handle, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    handle_trigger(app_handle, &action_clone);
                }
            })
            .map_err(|e| e.to_string())?;

        registered.insert(action, new_key);
        Ok(())
    }
}

fn handle_trigger<R: Runtime>(app: &AppHandle<R>, action: &ShortcutAction) {
    match action {
        ShortcutAction::ToggleSpotlight => {
            if let Some(window) = app.get_webview_window("spotlight") {
                if window.is_visible().unwrap_or(false) {
                    let _ = window.hide();
                } else {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }
        ShortcutAction::ToggleAutomator => {
            ctxrun_plugin_automator::toggle(app);
        }
    }
}
