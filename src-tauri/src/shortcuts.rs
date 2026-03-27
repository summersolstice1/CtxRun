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
        let mut spotlight_key = "Alt+S".to_string();
        let mut automator_key = "Alt+F1".to_string();

        if let Some(config) = load_app_config_state(app) {
            if let Some(configured_spotlight_key) = config
                .spotlight_shortcut
                .map(|key| key.trim().to_string())
                .filter(|key| !key.is_empty())
            {
                spotlight_key = configured_spotlight_key;
            }
            if let Some(configured_automator_key) = config
                .automator_shortcut
                .map(|key| key.trim().to_string())
                .filter(|key| !key.is_empty())
            {
                automator_key = configured_automator_key;
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
