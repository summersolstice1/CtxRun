use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use enigo::{
    Enigo, Mouse, Keyboard, Button, Coordinate,
    Settings, Direction, Key, Axis
};
use crate::models::{AutomatorAction, Workflow, WorkflowGraph, MouseButton};
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

/// 使用异步任务运行工作流
pub fn run_workflow_task<R: Runtime>(
    app: AppHandle<R>,
    workflow: Workflow,
    running_flag: Arc<AtomicBool>
) {
    tauri::async_runtime::spawn(async move {
        let mut enigo = match Enigo::new(&Settings::default()) {
            Ok(e) => e,
            Err(e) => {
                eprintln!("[Automator] Failed to init Enigo: {:?}", e);
                running_flag.store(false, Ordering::SeqCst);
                let _ = app.emit("automator:status", false);
                return;
            }
        };

        let mut current_loop = 0;

        let _execution_result = async {
            'outer: while running_flag.load(Ordering::SeqCst) {
                // 检查循环次数限制 (0 表示无限循环)
                if workflow.repeat_count > 0 && current_loop >= workflow.repeat_count {
                    break 'outer;
                }

                for (index, action) in workflow.actions.iter().enumerate() {
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
                            tokio::time::sleep(Duration::from_millis(50)).await;
                            let _ = enigo.button(btn, Direction::Click);
                        },
                        AutomatorAction::Type { text } => {
                            let _ = enigo.text(text);
                        },
                        AutomatorAction::KeyPress { key } => {
                            execute_key_combination(&mut enigo, key);
                        },
                        AutomatorAction::Scroll { delta } => {
                            let _ = enigo.scroll(*delta, Axis::Vertical);
                        },
                        AutomatorAction::Wait { ms } => {
                            let mut remaining = *ms;
                            while remaining > 0 {
                                if !running_flag.load(Ordering::SeqCst) { break 'outer; }
                                let sleep_part = std::cmp::min(remaining, 100);
                                tokio::time::sleep(Duration::from_millis(sleep_part)).await;
                                remaining -= sleep_part;
                            }
                        },
                        AutomatorAction::CheckColor { .. } => {},
                        AutomatorAction::Iterate { .. } => {}
                    }

                    tokio::time::sleep(Duration::from_millis(50)).await;
                }

                current_loop += 1;
                let _ = app.emit("automator:loop_count", current_loop);
            }
        }.await;

        reset_all_inputs_surgical(&mut enigo);
        reset_all_inputs_surgical(&mut enigo);
        let _ = enigo.key(Key::Escape, Direction::Click);

        running_flag.store(false, Ordering::SeqCst);
        let _ = app.emit("automator:status", false);
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
        "delete" | "del" => Some(Key::Delete),
        // "insert" => Some(Key::Insert), // Insert 已在 enigo 0.6.1 中移除
        "home" => Some(Key::Home),
        "end" => Some(Key::End),
        "pageup" | "page up" => Some(Key::PageUp),
        "pagedown" | "page down" => Some(Key::PageDown),
        "up" | "arrowup" | "arrow up" => Some(Key::UpArrow),
        "down" | "arrowdown" | "arrow down" => Some(Key::DownArrow),
        "left" | "arrowleft" | "arrow left" => Some(Key::LeftArrow),
        "right" | "arrowright" | "arrow right" => Some(Key::RightArrow),

        // 功能键
        "f1" => Some(Key::F1),
        "f2" => Some(Key::F2),
        "f3" => Some(Key::F3),
        "f4" => Some(Key::F4),
        "f5" => Some(Key::F5),
        "f6" => Some(Key::F6),
        "f7" => Some(Key::F7),
        "f8" => Some(Key::F8),
        "f9" => Some(Key::F9),
        "f10" => Some(Key::F10),
        "f11" => Some(Key::F11),
        "f12" => Some(Key::F12),
        "a" => Some(Key::Unicode('a')),
        "b" => Some(Key::Unicode('b')),
        "c" => Some(Key::Unicode('c')),
        "d" => Some(Key::Unicode('d')),
        "e" => Some(Key::Unicode('e')),
        "f" => Some(Key::Unicode('f')),
        "g" => Some(Key::Unicode('g')),
        "h" => Some(Key::Unicode('h')),
        "i" => Some(Key::Unicode('i')),
        "j" => Some(Key::Unicode('j')),
        "k" => Some(Key::Unicode('k')),
        "l" => Some(Key::Unicode('l')),
        "m" => Some(Key::Unicode('m')),
        "n" => Some(Key::Unicode('n')),
        "o" => Some(Key::Unicode('o')),
        "p" => Some(Key::Unicode('p')),
        "q" => Some(Key::Unicode('q')),
        "r" => Some(Key::Unicode('r')),
        "s" => Some(Key::Unicode('s')),
        "t" => Some(Key::Unicode('t')),
        "u" => Some(Key::Unicode('u')),
        "v" => Some(Key::Unicode('v')),
        "w" => Some(Key::Unicode('w')),
        "x" => Some(Key::Unicode('x')),
        "y" => Some(Key::Unicode('y')),
        "z" => Some(Key::Unicode('z')),
        "0" => Some(Key::Unicode('0')),
        "1" => Some(Key::Unicode('1')),
        "2" => Some(Key::Unicode('2')),
        "3" => Some(Key::Unicode('3')),
        "4" => Some(Key::Unicode('4')),
        "5" => Some(Key::Unicode('5')),
        "6" => Some(Key::Unicode('6')),
        "7" => Some(Key::Unicode('7')),
        "8" => Some(Key::Unicode('8')),
        "9" => Some(Key::Unicode('9')),

        _ => None,
    }
}

/// 执行组合键（如 "Alt+F1"）
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

    for m in &modifiers {
        let _ = enigo.key(*m, Direction::Press);
    }

    if let Some(k) = main_key {
        let _ = enigo.key(k, Direction::Click);
    } else if modifiers.is_empty() {
    } else {
        if let Some(m) = modifiers.first() {
            let _ = enigo.key(*m, Direction::Click);
        }
    }


    for m in modifiers.iter().rev() {
        let _ = enigo.key(*m, Direction::Release);
    }
}

fn reset_all_inputs_surgical(enigo: &mut Enigo) {
    let buttons = [Button::Left, Button::Right, Button::Middle];
    for btn in buttons {
        let _ = enigo.button(btn, Direction::Release);
    }

    let modifiers = [
        Key::Alt,
        Key::Control,
        Key::Shift,
        Key::Meta,
    ];

    for key in modifiers {
        let _ = enigo.key(key, Direction::Release);
    }
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

/// 执行单个图节点动作
async fn execute_simulation(enigo: &mut Enigo, action: &AutomatorAction) {
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
            tokio::time::sleep(Duration::from_millis(50)).await;
            let _ = enigo.button(btn, Direction::Click);
        },
        AutomatorAction::Type { text } => {
            let _ = enigo.text(text);
        },
        AutomatorAction::KeyPress { key } => {
            execute_key_combination(enigo, key);
        },
        AutomatorAction::Scroll { delta } => {
            let _ = enigo.scroll(*delta, Axis::Vertical);
        },
        AutomatorAction::Wait { ms } => {
            tokio::time::sleep(Duration::from_millis(*ms)).await;
        },
        AutomatorAction::CheckColor { .. } | AutomatorAction::Iterate { .. } => {}
    }
}

/// 使用图结构运行工作流
pub fn run_graph_task<R: Runtime>(
    app: AppHandle<R>,
    graph: WorkflowGraph,
    running_flag: Arc<AtomicBool>
) {
    tauri::async_runtime::spawn(async move {
        let mut enigo = match Enigo::new(&Settings::default()) {
            Ok(e) => e,
            Err(e) => {
                eprintln!("[Automator] Failed to init Enigo: {:?}", e);
                running_flag.store(false, Ordering::SeqCst);
                let _ = app.emit("automator:status", false);
                return;
            }
        };

        let mut node_counters: HashMap<String, u32> = HashMap::new();

        let mut current_id = Some(graph.start_node_id.clone());
        let mut execution_count = 0u32;
        const MAX_EXECUTION_COUNT: u32 = 10000;

        let _execution_result = async {
            while let Some(id) = current_id {
                execution_count += 1;
                if execution_count > MAX_EXECUTION_COUNT {
                    eprintln!("[Automator] Execution count exceeded limit (Safety Trip)");
                    break;
                }

                if !running_flag.load(Ordering::SeqCst) { break; }

                let node = match graph.nodes.get(&id) {
                    Some(n) => n,
                    None => {
                        eprintln!("[Automator] Node not found: {}", id);
                        break;
                    }
                };

                let _ = app.emit("automator:step", &id);

                match &node.action {
                    AutomatorAction::CheckColor { x, y, expected_hex, tolerance } => {
                        let x_coord = *x;
                        let y_coord = *y;

                        let color_res = tauri::async_runtime::spawn_blocking(move || {
                            screen::get_color_at(x_coord, y_coord)
                        }).await;

                        match color_res {
                            Ok(Ok(actual_color)) => {
                                let is_match = color_match(&actual_color, expected_hex, *tolerance);
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
                                eprintln!("[Automator] Task joining failed: {}", e);
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
                        execute_simulation(&mut enigo, &node.action).await;
                        current_id = node.next_id.clone();
                    }
                }

                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        }.await;

        reset_all_inputs_surgical(&mut enigo);
        let _ = enigo.key(Key::Escape, Direction::Click);

        running_flag.store(false, Ordering::SeqCst);
        let _ = app.emit("automator:status", false);
    });
}
