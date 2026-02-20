use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use enigo::{
    Enigo, Mouse, Keyboard, Button, Coordinate,
    Settings, Direction, Key, Axis
};
use crate::models::{AutomatorAction, Workflow, WorkflowGraph, MouseButton, ActionTarget};
use crate::screen;

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

/// 辅助：带超时熔断的坐标解析器
async fn resolve_coords_with_timeout(target: &ActionTarget) -> (i32, i32) {
    let t_clone = target.clone();

    // 创建一个阻塞任务
    let task = tauri::async_runtime::spawn_blocking(move || {
        crate::inspector::resolve_target_to_coords(&t_clone)
    });

    // 🚀 熔断机制：只等 10 秒
    match tokio::time::timeout(Duration::from_secs(10), task).await {
        Ok(Ok(Ok((x, y)))) => (x, y), // 成功拿到坐标
        Ok(Ok(Err(_))) => {
            // 内部逻辑错误，提取 fallback
            extract_fallback(target)
        },
        Ok(Err(_)) => {
            // JoinError
            extract_fallback(target)
        },
        Err(_) => {
            println!("[Engine] 🚨 语义解析超时 (Deadlock prevented)，强制使用回退坐标");
            extract_fallback(target)
        }
    }
}

fn extract_fallback(target: &ActionTarget) -> (i32, i32) {
    match target {
        ActionTarget::Coordinate { x, y } => (*x, *y),
        ActionTarget::Semantic { fallback_x, fallback_y, .. } => (*fallback_x, *fallback_y),
    }
}

/// 智能执行器
async fn execute_smart_action(enigo: &mut Enigo, action: &AutomatorAction) {
    match action {
        AutomatorAction::MoveTo { target } => {
            let (x, y) = resolve_coords_with_timeout(target).await;
            println!("[Engine] 🖱️ 移动鼠标 -> ({}, {})", x, y);
            let _ = enigo.move_mouse(x, y, Coordinate::Abs);
        },

        AutomatorAction::Click { button, target } => {
            if let Some(t) = target {
                let (x, y) = resolve_coords_with_timeout(t).await;
                println!("[Engine] 🖱️ 移动并点击 -> ({}, {})", x, y);
                let _ = enigo.move_mouse(x, y, Coordinate::Abs);
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            let btn = map_button(button);
            let _ = enigo.button(btn, Direction::Click);
        },

        AutomatorAction::DoubleClick { button, target } => {
            if let Some(t) = target {
                let (x, y) = resolve_coords_with_timeout(t).await;
                println!("[Engine] 🖱️ 移动并双击 -> ({}, {})", x, y);
                let _ = enigo.move_mouse(x, y, Coordinate::Abs);
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            let btn = map_button(button);
            let _ = enigo.button(btn, Direction::Click);
            tokio::time::sleep(Duration::from_millis(50)).await;
            let _ = enigo.button(btn, Direction::Click);
        },

        AutomatorAction::Type { text, target } => {
            if let Some(t) = target {
                let (x, y) = resolve_coords_with_timeout(t).await;
                println!("[Engine] 🖱️ 移动并输入 -> ({}, {}) 文本: '{}'", x, y, text);
                let _ = enigo.move_mouse(x, y, Coordinate::Abs);
                tokio::time::sleep(Duration::from_millis(50)).await;
                let _ = enigo.button(Button::Left, Direction::Click);
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
            let _ = enigo.text(text);
        },

        AutomatorAction::KeyPress { key } => {
            println!("[Engine] ⌨️ 按键组合: {}", key);
            execute_key_combination(enigo, key);
        },

        AutomatorAction::Scroll { delta } => {
            println!("[Engine] 📜 滚轮: {} 单位", delta);
            let _ = enigo.scroll(*delta, Axis::Vertical);
        },

        AutomatorAction::Wait { ms } => {
            println!("[Engine] ⏱️ 等待: {} ms", ms);
            tokio::time::sleep(Duration::from_millis(*ms)).await;
        },

        AutomatorAction::CheckColor { .. } => {
            println!("[Engine] 🎨 检查颜色条件");
        },
        AutomatorAction::Iterate { .. } => {
            println!("[Engine] 🔄 迭代器");
        }
    }
}

pub fn run_workflow_task<R: Runtime>(
    app: AppHandle<R>,
    workflow: Workflow,
    running_flag: Arc<AtomicBool>
) {
    tauri::async_runtime::spawn(async move {
        println!("[Engine] 任务开始");

        let mut enigo = match Enigo::new(&Settings::default()) {
            Ok(e) => e,
            Err(e) => {
                eprintln!("[Engine] Enigo 初始化失败: {:?}", e);
                running_flag.store(false, Ordering::SeqCst);
                let _ = app.emit("automator:status", false);
                return;
            }
        };

        let mut current_loop = 0;

        'outer: while running_flag.load(Ordering::SeqCst) {
            if workflow.repeat_count > 0 && current_loop >= workflow.repeat_count {
                break 'outer;
            }

            for (index, action) in workflow.actions.iter().enumerate() {
                if !running_flag.load(Ordering::SeqCst) {
                    println!("[Engine] 检测到停止信号，退出");
                    break 'outer;
                }

                let _ = app.emit("automator:step", index);

                // 执行动作
                execute_smart_action(&mut enigo, action).await;

                tokio::time::sleep(Duration::from_millis(100)).await;
            }

            current_loop += 1;
            let _ = app.emit("automator:loop_count", current_loop);
        }

        // 安全清理
        println!("[Engine] 任务结束，重置输入状态");
        reset_all_inputs_surgical(&mut enigo);

        running_flag.store(false, Ordering::SeqCst);
        let _ = app.emit("automator:status", false);
    });
}

// ----------------------------------------------------------------------
// 辅助函数
// ----------------------------------------------------------------------

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
        "delete" | "del" => Some(Key::Delete),
        "home" => Some(Key::Home),
        "end" => Some(Key::End),
        "pageup" | "page up" => Some(Key::PageUp),
        "pagedown" | "page down" => Some(Key::PageDown),
        "up" | "arrowup" | "arrow up" => Some(Key::UpArrow),
        "down" | "arrowdown" | "arrow down" => Some(Key::DownArrow),
        "left" | "arrowleft" | "arrow left" => Some(Key::LeftArrow),
        "right" | "arrowright" | "arrow right" => Some(Key::RightArrow),
        "f1" => Some(Key::F1), "f2" => Some(Key::F2), "f3" => Some(Key::F3),
        "f4" => Some(Key::F4), "f5" => Some(Key::F5), "f6" => Some(Key::F6),
        "f7" => Some(Key::F7), "f8" => Some(Key::F8), "f9" => Some(Key::F9),
        "f10" => Some(Key::F10), "f11" => Some(Key::F11), "f12" => Some(Key::F12),
        "a" => Some(Key::Unicode('a')), "b" => Some(Key::Unicode('b')), "c" => Some(Key::Unicode('c')),
        "d" => Some(Key::Unicode('d')), "e" => Some(Key::Unicode('e')), "f" => Some(Key::Unicode('f')),
        "g" => Some(Key::Unicode('g')), "h" => Some(Key::Unicode('h')), "i" => Some(Key::Unicode('i')),
        "j" => Some(Key::Unicode('j')), "k" => Some(Key::Unicode('k')), "l" => Some(Key::Unicode('l')),
        "m" => Some(Key::Unicode('m')), "n" => Some(Key::Unicode('n')), "o" => Some(Key::Unicode('o')),
        "p" => Some(Key::Unicode('p')), "q" => Some(Key::Unicode('q')), "r" => Some(Key::Unicode('r')),
        "s" => Some(Key::Unicode('s')), "t" => Some(Key::Unicode('t')), "u" => Some(Key::Unicode('u')),
        "v" => Some(Key::Unicode('v')), "w" => Some(Key::Unicode('w')), "x" => Some(Key::Unicode('x')),
        "y" => Some(Key::Unicode('y')), "z" => Some(Key::Unicode('z')),
        "0" => Some(Key::Unicode('0')), "1" => Some(Key::Unicode('1')), "2" => Some(Key::Unicode('2')),
        "3" => Some(Key::Unicode('3')), "4" => Some(Key::Unicode('4')), "5" => Some(Key::Unicode('5')),
        "6" => Some(Key::Unicode('6')), "7" => Some(Key::Unicode('7')), "8" => Some(Key::Unicode('8')),
        "9" => Some(Key::Unicode('9')),
        _ => None,
    }
}

fn execute_key_combination(enigo: &mut Enigo, key_combo: &str) {
    let parts: Vec<&str> = key_combo.split('+').collect();
    let mut modifiers = Vec::new();
    let mut main_key = None;

    for part in parts {
        let part_lower = part.trim().to_lowercase();
        match part_lower.as_str() {
            "control" | "ctrl" => modifiers.push(Key::Control),
            "alt" => modifiers.push(Key::Alt),
            "shift" => modifiers.push(Key::Shift),
            "meta" | "command" | "cmd" => modifiers.push(Key::Meta),
            other => {
                if let Some(k) = map_key(other) {
                    main_key = Some(k);
                }
            }
        }
    }

    for m in &modifiers { let _ = enigo.key(*m, Direction::Press); }
    if let Some(k) = main_key { let _ = enigo.key(k, Direction::Click); }
    else if modifiers.is_empty() {}
    else { if let Some(m) = modifiers.first() { let _ = enigo.key(*m, Direction::Click); } }
    for m in modifiers.iter().rev() { let _ = enigo.key(*m, Direction::Release); }
}

fn reset_all_inputs_surgical(enigo: &mut Enigo) {
    let buttons = [Button::Left, Button::Right, Button::Middle];
    for btn in buttons { let _ = enigo.button(btn, Direction::Release); }
    let modifiers = [Key::Alt, Key::Control, Key::Shift, Key::Meta];
    for key in modifiers { let _ = enigo.key(key, Direction::Release); }
}

/// 颜色匹配函数（带容差）
fn color_match(actual: &str, expected: &str, tolerance: u32) -> bool {
    if actual.len() != 7 || expected.len() != 7 {
        return false;
    }
    if !actual.starts_with('#') || !expected.starts_with('#') {
        return false;
    }
    let actual_r = match u32::from_str_radix(&actual[1..3], 16) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let actual_g = match u32::from_str_radix(&actual[3..5], 16) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let actual_b = match u32::from_str_radix(&actual[5..7], 16) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let expected_r = match u32::from_str_radix(&expected[1..3], 16) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let expected_g = match u32::from_str_radix(&expected[3..5], 16) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let expected_b = match u32::from_str_radix(&expected[5..7], 16) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let diff_r = (actual_r as i32 - expected_r as i32).unsigned_abs();
    let diff_g = (actual_g as i32 - expected_g as i32).unsigned_abs();
    let diff_b = (actual_b as i32 - expected_b as i32).unsigned_abs();

    diff_r <= tolerance && diff_g <= tolerance && diff_b <= tolerance
}

/// 图结构执行任务 - 完整实现
pub fn run_graph_task<R: Runtime>(
    app: AppHandle<R>,
    graph: WorkflowGraph,
    running_flag: Arc<AtomicBool>
) {
    tauri::async_runtime::spawn(async move {
        println!("[Engine] 图任务开始");

        let mut enigo = match Enigo::new(&Settings::default()) {
            Ok(e) => e,
            Err(e) => {
                eprintln!("[Engine] Enigo 初始化失败: {:?}", e);
                running_flag.store(false, Ordering::SeqCst);
                let _ = app.emit("automator:status", false);
                return;
            }
        };

        let mut node_counters: HashMap<String, u32> = HashMap::new();
        let mut current_id = Some(graph.start_node_id.clone());
        let mut execution_count = 0u32;
        const MAX_EXECUTION_COUNT: u32 = 10000;

        while let Some(id) = current_id {
            execution_count += 1;
            if execution_count > MAX_EXECUTION_COUNT {
                eprintln!("[Engine] 执行次数超限 (安全中断)");
                break;
            }

            if !running_flag.load(Ordering::SeqCst) {
                println!("[Engine] 检测到停止信号，退出");
                break;
            }

            let node = match graph.nodes.get(&id) {
                Some(n) => n,
                None => {
                    // 节点不存在（可能是 endNode），正常结束
                    break;
                }
            };

            let _ = app.emit("automator:step", &id);

            match &node.action {
                AutomatorAction::CheckColor { x, y, expected_hex, tolerance } => {
                    let x_coord = *x;
                    let y_coord = *y;
                    let expected_hex_clone = expected_hex.clone();
                    let tolerance_clone = *tolerance;

                    let color_res = tauri::async_runtime::spawn_blocking(move || {
                        screen::get_color_at(x_coord, y_coord)
                    }).await;

                    match color_res {
                        Ok(Ok(actual_color)) => {
                            let is_match = color_match(&actual_color, &expected_hex_clone, tolerance_clone);
                            current_id = if is_match {
                                node.true_id.clone()
                            } else {
                                node.false_id.clone()
                            };
                        },
                        Ok(Err(_e)) => {
                            current_id = node.false_id.clone();
                        },
                        Err(e) => {
                            eprintln!("[Engine] 任务 joining 失败: {}", e);
                            break;
                        }
                    }
                },

                AutomatorAction::Iterate { target_count } => {
                    let count = node_counters.entry(id.clone()).or_insert(0);

                    if *count < *target_count {
                        *count += 1;
                        current_id = node.true_id.clone();
                    } else {
                        *count = 0;
                        current_id = node.false_id.clone();
                    }
                },

                _ => {
                    // 普通动作节点，执行后走向 nextId
                    execute_smart_action(&mut enigo, &node.action).await;
                    current_id = node.next_id.clone();
                }
            }

            tokio::time::sleep(Duration::from_millis(50)).await;
        }

        // 安全清理
        println!("[Engine] 图任务结束，重置输入状态");
        reset_all_inputs_surgical(&mut enigo);

        running_flag.store(false, Ordering::SeqCst);
        let _ = app.emit("automator:status", false);
    });
}
