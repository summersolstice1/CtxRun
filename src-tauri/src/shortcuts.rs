use std::fs;
use std::sync::Mutex;
use std::collections::HashMap;
use tauri::{AppHandle, Manager, Runtime, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use serde::Deserialize;

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
            // 这里利用事件总线通知后端插件或前端
            // 最佳实践：直接调用 Automator 插件的逻辑（需要插件暴露 pub 接口）
            // 降级方案：发送事件，由 App.tsx (如果活着) 响应，或者 Automator 插件在 Rust 侧监听此事件

            // 发送给前端（兼容现有逻辑）
            let _ = app.emit("automator:toggle-request", ());

            // 如果你想完全在后端处理 Alt+F1（即使前端已销毁），你需要修改 automator crate，
            // 让它监听一个 Rust 内部的 Channel 或直接调用它的状态管理。
            // 鉴于目前架构，emit 是最安全的改动。
        }
    }
}
