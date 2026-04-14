use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::app_config::load_app_config_state;
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
        let config = load_app_config_state(app);
        let spotlight_key = resolve_shortcut(
            config
                .as_ref()
                .and_then(|state| state.spotlight_shortcut.as_deref()),
            "Alt+S",
        );
        let automator_key = resolve_shortcut(
            config
                .as_ref()
                .and_then(|state| state.automator_shortcut.as_deref()),
            "Alt+F1",
        );

        let _ = self.update_shortcut(app, ShortcutAction::ToggleSpotlight, spotlight_key);
        let _ = self.update_shortcut(app, ShortcutAction::ToggleAutomator, automator_key);
    }

    fn update_shortcut<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        action: ShortcutAction,
        new_key: Option<String>,
    ) -> crate::error::Result<()> {
        let mut registered = self.registered.lock().unwrap();

        if let Some(old_key) = registered.get(&action) {
            if Some(old_key) == new_key.as_ref() {
                return Ok(());
            }
            if let Ok(shortcut) = old_key.parse::<Shortcut>() {
                let _ = app.global_shortcut().unregister(shortcut);
            }
        }

        let Some(new_key) = new_key else {
            registered.remove(&action);
            return Ok(());
        };

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

fn resolve_shortcut(configured_key: Option<&str>, default_key: &str) -> Option<String> {
    match configured_key {
        Some(key) => {
            let trimmed = key.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        None => Some(default_key.to_string()),
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
