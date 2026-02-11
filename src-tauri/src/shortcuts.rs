use std::fs;
use std::sync::Mutex;
use std::collections::HashMap;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use serde::Deserialize;

// [新增] 引入 automator 插件
use ctxrun_plugin_automator;

// 1. 定义与前端 Zustand store 匹配的 JSON 结构
#[derive(Deserialize, Debug)]
struct AppConfigStore {
    state: AppConfigState,
}

#[derive(Deserialize, Debug)]
struct AppConfigState {
    // 对应前端的 spotlightShortcut
    #[serde(rename = "spotlightShortcut")]
    spotlight_shortcut: String,
}

// 2. 定义支持的动作枚举
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ShortcutAction {
    ToggleSpotlight,
    ToggleAutomator,
}

pub struct ShortcutManager {
    // 存储 Action -> 当前注册的快捷键字符串 (用于防止重复注册和解绑)
    registered: Mutex<HashMap<ShortcutAction, String>>,
}

impl ShortcutManager {
    pub fn new() -> Self {
        Self {
            registered: Mutex::new(HashMap::new()),
        }
    }

    // 核心方法：从磁盘读取配置并刷新快捷键
    pub fn refresh<R: Runtime>(&self, app: &AppHandle<R>) {
        let app_dir = app.path().app_local_data_dir().unwrap();
        let config_path = app_dir.join("app-config.json");

        // 默认值
        let mut spotlight_key = "Alt+S".to_string();

        // 尝试读取配置
        if config_path.exists() {
            if let Ok(content) = fs::read_to_string(config_path) {
                if let Ok(config) = serde_json::from_str::<AppConfigStore>(&content) {
                    if !config.state.spotlight_shortcut.is_empty() {
                        spotlight_key = config.state.spotlight_shortcut;
                    }
                }
            }
        }

        // 注册 Spotlight 快捷键
        let _ = self.update_shortcut(app, ShortcutAction::ToggleSpotlight, spotlight_key);

        // 注册 Automator 快捷键 (目前固定 Alt+F1，未来可扩展读取配置)
        let _ = self.update_shortcut(app, ShortcutAction::ToggleAutomator, "Alt+F1".to_string());
    }

    fn update_shortcut<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        action: ShortcutAction,
        new_key: String,
    ) -> Result<(), String> {
        let mut registered = self.registered.lock().unwrap();

        // 1. 检查是否需要更新
        if let Some(old_key) = registered.get(&action) {
            if *old_key == new_key {
                return Ok(()); // 没变，无需操作
            }
            // 解绑旧的
            if let Ok(shortcut) = old_key.parse::<Shortcut>() {
                let _ = app.global_shortcut().unregister(shortcut);
            }
        }

        // 2. 注册新的
        let shortcut = new_key.parse::<Shortcut>().map_err(|e| e.to_string())?;

        let action_clone = action.clone();
        app.global_shortcut().on_shortcut(shortcut, move |app_handle, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                handle_trigger(app_handle, &action_clone);
            }
        }).map_err(|e| e.to_string())?;

        // 3. 更新记录
        registered.insert(action, new_key);
        Ok(())
    }
}

// 统一的触发处理逻辑
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
            // [修改] 直接调用后端逻辑，不依赖前端
            println!("[Shortcut] F1 pressed - Toggling Automator via Backend");
            ctxrun_plugin_automator::toggle(app);
        }
    }
}
