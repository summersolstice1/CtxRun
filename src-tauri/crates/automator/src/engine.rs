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
                            execute_key_combination(&mut enigo, key);
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
                        },
                        AutomatorAction::CheckColor { .. } => {
                            // CheckColor 仅在图模式中使用，线性模式跳过
                        },
                        AutomatorAction::Iterate { .. } => {
                            // Iterate 仅在图模式中使用，线性模式跳过
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
        // 特殊键
        "enter" | "return" => Some(Key::Return),
        "space" => Some(Key::Space),
        "backspace" => Some(Key::Backspace),
        "tab" => Some(Key::Tab),
        "escape" | "esc" => Some(Key::Escape),
        "delete" | "del" => Some(Key::Delete),
        "insert" => Some(Key::Insert),
        "home" => Some(Key::Home),
        "end" => Some(Key::End),
        "pageup" | "page up" => Some(Key::PageUp),
        "pagedown" | "page down" => Some(Key::PageDown),

        // 方向键（支持多种写法）
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

        // 字母键
        "a" => Some(Key::A),
        "b" => Some(Key::B),
        "c" => Some(Key::C),
        "d" => Some(Key::D),
        "e" => Some(Key::E),
        "f" => Some(Key::F),
        "g" => Some(Key::G),
        "h" => Some(Key::H),
        "i" => Some(Key::I),
        "j" => Some(Key::J),
        "k" => Some(Key::K),
        "l" => Some(Key::L),
        "m" => Some(Key::M),
        "n" => Some(Key::N),
        "o" => Some(Key::O),
        "p" => Some(Key::P),
        "q" => Some(Key::Q),
        "r" => Some(Key::R),
        "s" => Some(Key::S),
        "t" => Some(Key::T),
        "u" => Some(Key::U),
        "v" => Some(Key::V),
        "w" => Some(Key::W),
        "x" => Some(Key::X),
        "y" => Some(Key::Y),
        "z" => Some(Key::Z),

        // 数字键
        "0" => Some(Key::Num0),
        "1" => Some(Key::Num1),
        "2" => Some(Key::Num2),
        "3" => Some(Key::Num3),
        "4" => Some(Key::Num4),
        "5" => Some(Key::Num5),
        "6" => Some(Key::Num6),
        "7" => Some(Key::Num7),
        "8" => Some(Key::Num8),
        "9" => Some(Key::Num9),

        _ => None,
    }
}

/// 执行组合键（如 "Alt+F1"）
/// 按顺序：按下修饰键 → 点击主键 → 逆序释放修饰键
fn execute_key_combination(enigo: &mut Enigo, key_combo: &str) {
    // 解析组合键字符串，例如 "Alt+F1" -> ["Alt", "F1"]
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
                // 不是修饰键，则作为主键
                if let Some(k) = map_key(other) {
                    main_key = Some(k);
                }
            }
        }
    }

    // 1. 依次按下修饰键
    for m in &modifiers {
        let _ = enigo.key(*m, Direction::Press);
    }

    // 2. 点击主键 (Press + Release)
    if let Some(k) = main_key {
        let _ = enigo.key(k, Direction::Click);
    } else if modifiers.is_empty() {
        // 既没有修饰键也没有主键，可能是单个无效键
    } else {
        // 只有修饰键，没有主键（如只按下 Alt），则点击第一个修饰键
        if let Some(m) = modifiers.first() {
            let _ = enigo.key(*m, Direction::Click);
        }
    }

    // 3. 依次释放修饰键 (逆序释放，符合键盘习惯)
    for m in modifiers.iter().rev() {
        let _ = enigo.key(*m, Direction::Release);
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
        Key::Meta, // Windows/Command 键
    ];

    for key in modifiers {
        // Enigo 的 Release 是幂等的，但如果键本身没按下，某些 OS 会产生干扰
        // 我们在这里仅进行必要的释放
        let _ = enigo.key(key, Direction::Release);
    }
}

/// 颜色匹配函数（带容差）
/// 使用最大差异法：每个通道的差异都必须在容差范围内
fn color_match(actual: &str, expected: &str, tolerance: u32) -> bool {
    // 验证颜色格式
    if actual.len() != 7 || expected.len() != 7 {
        return false;
    }
    if !actual.starts_with('#') || !expected.starts_with('#') {
        return false;
    }

    // 解析实际颜色（使用更好的错误处理）
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

    // 解析期望颜色
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

    // 计算每个通道的绝对差异
    let diff_r = (actual_r as i32 - expected_r as i32).unsigned_abs();
    let diff_g = (actual_g as i32 - expected_g as i32).unsigned_abs();
    let diff_b = (actual_b as i32 - expected_b as i32).unsigned_abs();

    // 所有通道的差异都必须在容差范围内
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
        AutomatorAction::CheckColor { .. } | AutomatorAction::Iterate { .. } => {
            // CheckColor 和 Iterate 在节点处理逻辑中单独处理，这里不应该到达
        }
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

        println!("[Automator] Graph workflow started");

        // ==== 关键修改 1: 引入运行时状态存储 ====
        // 用于存储每个 Iterator 节点的当前计数值
        let mut node_counters: HashMap<String, u32> = HashMap::new();

        let mut current_id = Some(graph.start_node_id.clone());
        let mut execution_count = 0u32;
        const MAX_EXECUTION_COUNT: u32 = 10000; // 考虑到有循环，适当调大熔断阈值

        let _execution_result = async {
            while let Some(id) = current_id {
                // 熔断检查
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

                // ==== 关键修改 2: 处理不同类型的动作逻辑 ====
                match &node.action {
                    // 情况 A: 颜色检测节点 (基于外部环境)
                    AutomatorAction::CheckColor { x, y, expected_hex, tolerance } => {
                        // 使用 xcap 在阻塞线程中执行屏幕截图
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
                            Ok(Err(e)) => {
                                eprintln!("[Automator] xcap error: {}", e);
                                // 颜色获取失败，走 false 分支
                                current_id = node.false_id.clone();
                            },
                            Err(e) => {
                                eprintln!("[Automator] Task joining failed: {}", e);
                                break;
                            }
                        }
                    },

                    // 情况 B: 迭代器节点 (基于内部状态)
                    AutomatorAction::Iterate { target_count } => {
                        // 获取当前节点的计数，如果不存在则从 0 开始
                        let count = node_counters.entry(id.clone()).or_insert(0);

                        if *count < *target_count {
                            // 增加计数并走向"循环"分支 (true)
                            *count += 1;
                            println!("[Automator] Node {} iteration: {}/{}", id, count, target_count);
                            current_id = node.true_id.clone();
                        } else {
                            // 达到目标，重置计数并走向"退出"分支 (false)
                            *count = 0;
                            println!("[Automator] Node {} iteration finished", id);
                            current_id = node.false_id.clone();
                        }
                    },

                    // 情况 C: 普通模拟节点 (执行完走 next)
                    _ => {
                        // 普通动作节点
                        execute_simulation(&mut enigo, &node.action).await;
                        current_id = node.next_id.clone();
                    }
                }

                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        }.await;

        // 安全防护阶段
        println!("[Automator] Executing surgical cleanup...");
        reset_all_inputs_surgical(&mut enigo);
        let _ = enigo.key(Key::Escape, Direction::Click);

        running_flag.store(false, Ordering::SeqCst);
        let _ = app.emit("automator:status", false);
        println!("[Automator] Graph engine released.");
    });
}
