use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use enigo::{
    Enigo, Mouse, Keyboard, Button, Coordinate,
    Settings, Direction, Key, Axis
};
use crate::models::{AutomatorAction, Workflow, MouseButton};

pub struct AutomatorState {
    pub is_running: Arc<AtomicBool>,
}

impl AutomatorState {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }
}

/// 使用异步任务运行工作流
pub fn run_workflow_task<R: Runtime>(
    app: AppHandle<R>,
    workflow: Workflow,
    running_flag: Arc<AtomicBool>
) {
    // 使用 tauri 的 async runtime 启动任务
    tauri::async_runtime::spawn(async move {
        // Enigo 实例在异步任务内部创建
        let mut enigo = match Enigo::new(&Settings::default()) {
            Ok(e) => e,
            Err(e) => {
                eprintln!("[Automator] Failed to init Enigo: {:?}", e);
                running_flag.store(false, Ordering::SeqCst);
                let _ = app.emit("automator:status", false);
                return;
            }
        };

        println!("[Automator] Workflow started: {}", workflow.name);
        let mut current_loop = 0;

        // 使用 scope 确保无论发生什么，最后都会执行 reset
        let _execution_result = async {
            'outer: while running_flag.load(Ordering::SeqCst) {
                // 检查循环次数限制 (0 表示无限循环)
                if workflow.repeat_count > 0 && current_loop >= workflow.repeat_count {
                    break 'outer;
                }

                for (index, action) in workflow.actions.iter().enumerate() {
                    // 执行每个动作前的【即时中断检查】
                    if !running_flag.load(Ordering::SeqCst) { break 'outer; }

                    let _ = app.emit("automator:step", index);

                    match action {
                        AutomatorAction::MoveTo { x, y } => {
                            let _ = enigo.move_mouse(*x, *y, Coordinate::Abs);
                        },
                        AutomatorAction::Click { button } => {
                            let btn = map_button(button);
                            let _ = enigo.button(btn, Direction::Click);
                        },
                        AutomatorAction::DoubleClick { button } => {
                            let btn = map_button(button);
                            let _ = enigo.button(btn, Direction::Click);
                            // 小间隔也使用异步等待，保持响应
                            tokio::time::sleep(Duration::from_millis(50)).await;
                            let _ = enigo.button(btn, Direction::Click);
                        },
                        AutomatorAction::Type { text } => {
                            let _ = enigo.text(text);
                        },
                        AutomatorAction::KeyPress { key } => {
                            if let Some(k) = map_key(key) {
                                let _ = enigo.key(k, Direction::Click);
                            }
                        },
                        AutomatorAction::Scroll { delta } => {
                            let _ = enigo.scroll(*delta, Axis::Vertical);
                        },
                        AutomatorAction::Wait { ms } => {
                            // 【关键优化】：将长 Wait 拆解为小步长轮询，确保可中断
                            // 采用每 100ms 检查一次标志位，确保最长停止延迟不超过 100ms
                            let mut remaining = *ms;
                            while remaining > 0 {
                                if !running_flag.load(Ordering::SeqCst) { break 'outer; }
                                let sleep_part = std::cmp::min(remaining, 100);
                                tokio::time::sleep(Duration::from_millis(sleep_part)).await;
                                remaining -= sleep_part;
                            }
                        }
                    }

                    // 动作之间的默认微小延迟
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }

                current_loop += 1;
                let _ = app.emit("automator:loop_count", current_loop);
            }
        }.await;

        // --- 安全防护阶段 ---
        println!("[Automator] Executing surgical cleanup...");

        // 1. 执行重置
        reset_all_inputs_surgical(&mut enigo);

        // 2. 【关键补丁】：发送一个 Escape 键
        // 理由：如果刚才的重置动作导致系统激活了菜单提示（比如 Alt 提示），
        // 发送 Escape 可以立即撤销这个状态，而不影响用户后续操作。
        let _ = enigo.key(Key::Escape, Direction::Click);

        running_flag.store(false, Ordering::SeqCst);
        let _ = app.emit("automator:status", false);
        println!("[Automator] Engine released.");
    });
}

fn map_button(btn: &MouseButton) -> Button {
    match btn {
        MouseButton::Left => Button::Left,
        MouseButton::Right => Button::Right,
        MouseButton::Middle => Button::Middle,
    }
}

fn map_key(key_str: &str) -> Option<Key> {
    match key_str.to_lowercase().as_str() {
        "enter" | "return" => Some(Key::Return),
        "space" => Some(Key::Space),
        "backspace" => Some(Key::Backspace),
        "tab" => Some(Key::Tab),
        "escape" | "esc" => Some(Key::Escape),
        _ => None,
    }
}

/// 更加温和的清理方式：手术刀式的精准清理
fn reset_all_inputs_surgical(enigo: &mut Enigo) {
    // 1. 释放鼠标按键
    let buttons = [Button::Left, Button::Right, Button::Middle];
    for btn in buttons {
        let _ = enigo.button(btn, Direction::Release);
    }

    // 2. 只释放那些最危险、最容易导致"粘滞"的修饰键
    // 注意：顺序很重要，先释放主键，再释放左/右修饰
    let modifiers = [
        Key::Alt,
        Key::Control,
        Key::Shift,
        Key::Meta,
        Key::Command, // macOS Command 键
    ];

    for key in modifiers {
        // Enigo 的 Release 是幂等的，但如果键本身没按下，某些 OS 会产生干扰
        // 我们在这里仅进行必要的释放
        let _ = enigo.key(key, Direction::Release);
    }
}
