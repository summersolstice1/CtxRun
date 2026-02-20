//! Inspector module for UI element detection and resolution

use serde::{Deserialize, Serialize};
use crate::error::{AutomatorError, Result};
use crate::models::{ActionTarget, UIElementNode}; // 引入刚定义的 UIElementNode
use enigo::{Enigo, Mouse, Settings};

#[cfg(target_os = "windows")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PickedElement {
    pub name: String,
    pub role: String,
    pub window_title: Option<String>,
    pub process_name: Option<String>,
    pub path: Vec<UIElementNode>, // 🚀 传给前端的路径
    pub x: i32,
    pub y: i32,
}

#[cfg(target_os = "windows")]
pub fn get_element_under_cursor_impl() -> Result<PickedElement> {
    use uiautomation::UIAutomation;
    use uiautomation::types::{Point, ControlType};
    use std::thread;
    use std::time::Duration;

    let enigo = Enigo::new(&Settings::default()).map_err(|e| AutomatorError::InputError(e.to_string()))?;
    let (x, y) = enigo.location().map_err(|e| AutomatorError::InputError(e.to_string()))?;

    // 初始化多线程 COM 模型
    unsafe {
        let _ = windows::Win32::System::Com::CoInitializeEx(None, windows::Win32::System::Com::COINIT_MULTITHREADED);
    }

    if let Ok(automation) = UIAutomation::new() {
        let _ = automation.get_root_element(); // 预热
        thread::sleep(Duration::from_millis(200));

        for attempt in 0..3 {
            if let Ok(element) = automation.element_from_point(Point::new(x, y)) {
                let name = element.get_name().unwrap_or_default();

                if !name.is_empty() || attempt == 2 {
                    let control_type = element.get_control_type().unwrap_or(ControlType::Custom);
                    let role = format!("{:?}", control_type);

                    // 🚀 核心：向上追溯，构建 UI 路径 (Breadcrumbs)
                    let mut path = Vec::new();
                    let mut current = element.clone();
                    let mut window_title = None;

                    if let Ok(walker) = automation.get_control_view_walker() {
                        if let Ok(root) = automation.get_root_element() {
                            for _ in 0..50 { // 防止死循环，最多往上找 50 层
                                let c_name = current.get_name().unwrap_or_default();
                                let c_role = format!("{:?}", current.get_control_type().unwrap_or(ControlType::Custom));
                                let c_class = current.get_classname().unwrap_or_default();

                                path.push(UIElementNode {
                                    name: c_name.clone(),
                                    role: c_role.clone(),
                                    class_name: c_class,
                                });

                                // 如果当前是 Window，顺便记录一下 title
                                if c_role == "Window" && window_title.is_none() && !c_name.is_empty() {
                                    window_title = Some(c_name);
                                }

                                if let Ok(parent) = walker.get_parent(&current) {
                                    // 如果父节点是桌面(Root)，则停止
                                    if automation.compare_elements(&parent, &root).unwrap_or(false) {
                                        break;
                                    }
                                    current = parent;
                                } else {
                                    break;
                                }
                            }
                        }
                    }

                    // 刚才追溯是从子节点到父节点，我们需要反转，变成 父节点 -> 子节点
                    path.reverse();

                    println!("[Inspector] 🍞 构建 UI 路径成功，层级深度: {}", path.len());

                    return Ok(PickedElement {
                        name,
                        role,
                        window_title,
                        process_name: None,
                        path,
                        x,
                        y
                    });
                }
            }
            if attempt < 2 {
                thread::sleep(Duration::from_millis(300));
            }
        }
    }

    Ok(PickedElement { name: String::new(), role: String::new(), window_title: None, process_name: None, path: vec![], x, y })
}

#[cfg(not(target_os = "windows"))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PickedElement {
    pub name: String,
    pub role: String,
    pub window_title: Option<String>,
    pub process_name: Option<String>,
    pub path: Vec<UIElementNode>,
    pub x: i32,
    pub y: i32,
}

#[cfg(not(target_os = "windows"))]
pub fn get_element_under_cursor_impl() -> Result<PickedElement> {
    let enigo = Enigo::new(&Settings::default()).map_err(|e| AutomatorError::InputError(e.to_string()))?;
    let (x, y) = enigo.location().map_err(|e| AutomatorError::InputError(e.to_string()))?;
    Ok(PickedElement { name: String::new(), role: String::new(), window_title: None, process_name: None, path: vec![], x, y })
}

/// 🚀 核心：标题锚定 + 弹性 BFS 扫描 (Bulletproof Search)
pub fn resolve_target_to_coords(target: &ActionTarget) -> Result<(i32, i32)> {
    match target {
        ActionTarget::Coordinate { x, y } => Ok((*x, *y)),

        ActionTarget::Semantic { name, role: _, window_title, process_name: _, path, fallback_x, fallback_y } => {
            println!("[Inspector] 🔍 解析目标: '{}' (窗口: {:?})", name, window_title);

            #[cfg(target_os = "windows")]
            {
                use uiautomation::UIAutomation;
                use uiautomation::types::Point;
                use std::thread;
                use std::time::Duration;

                unsafe {
                    let _ = windows::Win32::System::Com::CoInitializeEx(None, windows::Win32::System::Com::COINIT_MULTITHREADED);
                }

                let automation = match UIAutomation::new() {
                    Ok(a) => a,
                    Err(e) => {
                        println!("[Inspector] ❌ UIA 初始化失败: {}", e);
                        return Ok((*fallback_x, *fallback_y));
                    }
                };

                // --- 1. 极速路径：原坐标验证 (耗时 50ms) ---
                thread::sleep(Duration::from_millis(50));
                if let Ok(element) = automation.element_from_point(Point::new(*fallback_x, *fallback_y)) {
                    if let Ok(current_name) = element.get_name() {
                        if current_name == *name {
                            println!("[Inspector] ⚡ 极速命中原坐标");
                            return Ok((*fallback_x, *fallback_y));
                        }
                    }
                }

                // --- 2. 基于标题锁定目标窗口 (防缩放错位) ---
                let mut target_window = None;

                // 优先用 window_title，如果没有则用录制时 path 的顶层节点名
                let expected_win_name = window_title.clone().unwrap_or_else(|| {
                    path.first().map(|n| n.name.clone()).unwrap_or_default()
                });

                if !expected_win_name.is_empty() {
                    if let Ok(root) = automation.get_root_element() {
                        if let Ok(walker) = automation.get_control_view_walker() {
                            if let Ok(mut child) = walker.get_first_child(&root) {
                                loop {
                                    let w_name = child.get_name().unwrap_or_default();
                                    // 模糊包含匹配，应对 "CtxRun" 和 "CtxRun - Web 内容"
                                    if !w_name.is_empty() && (w_name.contains(&expected_win_name) || expected_win_name.contains(&w_name)) {
                                        target_window = Some(child.clone());
                                        break;
                                    }
                                    if let Ok(next) = walker.get_next_sibling(&child) {
                                        child = next;
                                    } else {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                // --- 3. 在目标窗口内部执行安全搜索 ---
                let mut found_element = None;

                if let Some(win) = target_window {
                    println!("[Inspector] 🎯 已锁定目标窗口, 开启沙箱内深搜...");

                    // 策略 A: 尝试 UIA 原生搜索
                    let matcher = automation.create_matcher().from(win.clone()).name(name).timeout(2000);
                    if let Ok(elem) = matcher.find_first() {
                        println!("[Inspector] ✅ 沙箱原生匹配成功!");
                        found_element = Some(elem);
                    } else {
                        // 策略 B: 弹性 BFS 扫描 (彻底解决 Chromium 树断裂和虚拟化问题)
                        println!("[Inspector] ⚠️ 原生搜索未命中, 启动弹性 BFS 扫描...");
                        let mut queue = std::collections::VecDeque::new();
                        queue.push_back(win);
                        let mut count = 0;

                        if let Ok(walker) = automation.get_control_view_walker() {
                            while let Some(node) = queue.pop_front() {
                                count += 1;
                                if count > 2500 {
                                    println!("[Inspector] 🛑 达到安全节点扫描上限 (2500)，强行停止。");
                                    break;
                                }

                                let c_name = node.get_name().unwrap_or_default();

                                // 精确匹配
                                if c_name == *name {
                                    println!("[Inspector] ✅ 弹性 BFS 扫描精确命中 (扫描节点数: {})!", count);
                                    found_element = Some(node);
                                    break;
                                }
                                // 模糊匹配作为备选，不 break 继续找看有没有更精确的
                                else if !name.is_empty() && c_name.contains(name) {
                                    found_element = Some(node.clone());
                                }

                                // 将子节点加入队列
                                if let Ok(mut child) = walker.get_first_child(&node) {
                                    queue.push_back(child.clone());
                                    while let Ok(next) = walker.get_next_sibling(&child) {
                                        queue.push_back(next.clone());
                                        child = next;
                                    }
                                }
                            }
                        }
                    }
                } else {
                    println!("[Inspector] ⚠️ 未能根据标题找到目标窗口!");
                }

                // --- 4. 坐标提取 ---
                if let Some(elem) = found_element {
                    // 首选 Bounding Rectangle 计算中心 (兼容性最好)
                    if let Ok(rect) = elem.get_bounding_rectangle() {
                        let cx = rect.get_left() + (rect.get_width() / 2);
                        let cy = rect.get_top() + (rect.get_height() / 2);
                        if cx > 0 && cy > 0 {
                            println!("[Inspector] 📍 提取矩形中心坐标: ({}, {})", cx, cy);
                            return Ok((cx, cy));
                        }
                    }
                }

                println!("[Inspector] ❌ 彻底搜索失败，使用回退坐标 ({}, {})", fallback_x, fallback_y);
                Ok((*fallback_x, *fallback_y))
            }

            #[cfg(not(target_os = "windows"))]
            {
                Ok((*fallback_x, *fallback_y))
            }
        }
    }
}
