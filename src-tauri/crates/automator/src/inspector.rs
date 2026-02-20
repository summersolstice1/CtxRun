//! Inspector module for UI element detection and resolution

use serde::{Deserialize, Serialize};
use crate::error::{AutomatorError, Result};
use crate::models::ActionTarget;
use enigo::{Enigo, Mouse, Settings};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PickedElement {
    pub name: String,
    pub role: String,
    // 新增字段
    pub window_title: Option<String>,
    pub process_name: Option<String>,
    pub x: i32,
    pub y: i32,
}

#[cfg(target_os = "windows")]
pub fn get_element_under_cursor_impl() -> Result<PickedElement> {
    use uiautomation::UIAutomation;
    use uiautomation::types::Point;
    use uiautomation::types::ControlType;
    use std::thread;
    use std::time::Duration;

    let enigo = Enigo::new(&Settings::default()).map_err(|e| AutomatorError::InputError(e.to_string()))?;
    let (x, y) = enigo.location().map_err(|e| AutomatorError::InputError(e.to_string()))?;

    if let Ok(automation) = UIAutomation::new() {
        // 🔥 预热：先获取根元素触发 UI 树加载
        let _ = automation.get_root_element();

        // 给 UI 树一点时间加载
        thread::sleep(Duration::from_millis(200));

        // 重试机制：最多尝试 3 次
        for attempt in 0..3 {
            if let Ok(element) = automation.element_from_point(Point::new(x, y)) {
                let name = element.get_name().unwrap_or_default();

                // 如果获取到有效 name，或者已经是最后一次尝试，就使用它
                if !name.is_empty() || attempt == 2 {
                    let control_type = element.get_control_type().unwrap_or(ControlType::Custom);
                    let role = format!("{:?}", control_type);

                    // 🚀 向上查找父窗口
                    let window_title = find_parent_window(&element, &automation);

                    if let Some(ref title) = window_title {
                        println!("[Inspector] 📋 捕获到窗口标题: {}", title);
                    } else {
                        println!("[Inspector] ⚠️ 未能捕获窗口标题");
                    }

                    return Ok(PickedElement {
                        name,
                        role,
                        window_title,
                        process_name: None,
                        x,
                        y
                    });
                }
            }

            // 等待后重试
            if attempt < 2 {
                println!("[Inspector] 🔄 第 {} 次获取失败，等待重试...", attempt + 1);
                thread::sleep(Duration::from_millis(300));
            }
        }
    }

    Ok(PickedElement { name: String::new(), role: String::new(), window_title: None, process_name: None, x, y })
}

// 辅助函数：向上查找父窗口
#[cfg(target_os = "windows")]
fn find_parent_window(element: &uiautomation::UIElement, automation: &uiautomation::UIAutomation) -> Option<String> {
    use uiautomation::types::ControlType;

    // 使用 TreeWalker 向上遍历
    if let Ok(walker) = automation.get_control_view_walker() {
        let mut current = element.clone();

        for level in 0..20 {
            match walker.get_parent(&current) {
                Ok(parent) => {
                    let ct = parent.get_control_type().unwrap_or(ControlType::Custom);

                    // 检查是否是窗口类型
                    if ct == ControlType::Window {
                        let title = parent.get_name().unwrap_or_default();
                        if !title.is_empty() {
                            println!("[Inspector] 🔍 在层级 {} 找到窗口: {}", level, title);
                            return Some(title);
                        }
                    }

                    // 有些窗口被识别为 Pane，也尝试捕获
                    if ct == ControlType::Pane && level > 3 {
                        let title = parent.get_name().unwrap_or_default();
                        if !title.is_empty() && title.len() > 5 {
                            println!("[Inspector] 🔍 在层级 {} 找到 Pane: {}", level, title);
                            return Some(title);
                        }
                    }

                    current = parent;
                },
                Err(_) => break,
            }
        }
    }

    None
}

#[cfg(not(target_os = "windows"))]
pub fn get_element_under_cursor_impl() -> Result<PickedElement> {
    let enigo = Enigo::new(&Settings::default()).map_err(|e| AutomatorError::InputError(e.to_string()))?;
    let (x, y) = enigo.location().map_err(|e| AutomatorError::InputError(e.to_string()))?;
    Ok(PickedElement { name: String::new(), role: String::new(), window_title: None, process_name: None, x, y })
}

/// 🚀 核心：分层级搜索 (Hierarchical Search)
pub fn resolve_target_to_coords(target: &ActionTarget) -> Result<(i32, i32)> {
    match target {
        ActionTarget::Coordinate { x, y } => Ok((*x, *y)),

        ActionTarget::Semantic { name, role: _, window_title, fallback_x, fallback_y, .. } => {
            println!("[Inspector] 🔍 解析目标: '{}' (窗口: {:?})", name, window_title);

            #[cfg(target_os = "windows")]
            {
                use uiautomation::UIAutomation;
                use uiautomation::types::Point;
                use std::thread;
                use std::time::Duration;

                let automation = UIAutomation::new().map_err(|e| AutomatorError::ScreenError(e.to_string()))?;

                // 🔥 预热 UIAutomation
                let _ = automation.get_root_element();
                thread::sleep(Duration::from_millis(100));

                // 1. 乐观验证 (Optimistic Check)
                if let Ok(element) = automation.element_from_point(Point::new(*fallback_x, *fallback_y)) {
                    if let Ok(current_name) = element.get_name() {
                        if current_name == *name {
                            println!("[Inspector] ⚡ 极速命中");
                            return Ok((*fallback_x, *fallback_y));
                        }
                    }
                }

                // 2. 窗口范围搜索 (Scoped Search)
                if let Ok(root) = automation.get_root_element() {
                    let mut search_root = root.clone();

                    // 如果我们知道它属于哪个窗口，先找到那个窗口！
                    if let Some(w_title) = window_title {
                        if !w_title.is_empty() {
                            println!("[Inspector] 🎯 正在定位窗口: {}", w_title);
                            let win_matcher = automation.create_matcher()
                                .from(root.clone())
                                .control_type(uiautomation::types::ControlType::Window)
                                .name(w_title)
                                .timeout(5000);

                            match win_matcher.find_first() {
                                Ok(win) => {
                                    search_root = win;
                                    println!("[Inspector] ✅ 窗口定位成功，缩小搜索范围");
                                },
                                Err(_) => {
                                    println!("[Inspector] ⚠️ 窗口定位失败，全屏搜索");
                                }
                            }
                        }
                    }

                    // 3. 在限定范围内搜索元素
                    if window_title.is_some() && window_title.as_ref().unwrap().is_empty() == false {
                        println!("[Inspector] 🔍 在窗口内搜索: {}", name);
                    } else {
                        println!("[Inspector] 🔍 全屏搜索: {}", name);
                    }

                    let matcher = automation.create_matcher()
                        .from(search_root)
                        .name(name)
                        .timeout(8000);

                    if let Ok(element) = matcher.find_first() {
                        if let Ok(rect) = element.get_bounding_rectangle() {
                            let cx = rect.get_left() + (rect.get_width() / 2);
                            let cy = rect.get_top() + (rect.get_height() / 2);
                            if cx > 0 && cy > 0 {
                                println!("[Inspector] ✅ 找回元素 @ ({}, {})", cx, cy);
                                return Ok((cx, cy));
                            }
                        }
                    }
                }
            }

            println!("[Inspector] ❌ 搜索失败，使用回退坐标 ({}, {})", fallback_x, fallback_y);
            Ok((*fallback_x, *fallback_y))
        }
    }
}
