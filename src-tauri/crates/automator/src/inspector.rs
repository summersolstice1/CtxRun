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

/// 🚀 核心：隐式等待 + 坐标逆推 + 弹性 BFS 扫描
pub fn resolve_target_to_coords(target: &ActionTarget) -> Result<(i32, i32)> {
    match target {
        ActionTarget::Coordinate { x, y } => Ok((*x, *y)),

        ActionTarget::Semantic { name, role: _, window_title, process_name: _, path, fallback_x, fallback_y } => {
            println!("[Inspector] 🔍 解析目标: '{}' (预期窗口: {:?})", name, window_title);

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

                // --- 1. 极速路径 (耗时 50ms) ---
                thread::sleep(Duration::from_millis(50));
                if let Ok(element) = automation.element_from_point(Point::new(*fallback_x, *fallback_y)) {
                    if let Ok(current_name) = element.get_name() {
                        if current_name == *name {
                            println!("[Inspector] ⚡ 极速命中原坐标");
                            return Ok((*fallback_x, *fallback_y));
                        }
                    }
                }

                // --- 2. 隐式等待与重试机制 (RPA 的灵魂) ---
                let expected_win_name = window_title.clone().unwrap_or_else(|| {
                    if !path.is_empty() { path[0].name.clone() } else { String::new() }
                });

                let mut found_element = None;
                let max_attempts = 4; // 🔴 最多重试4次，每次等800ms，留给网页加载和渲染

                if let Ok(root) = automation.get_root_element() {
                    if let Ok(walker) = automation.get_control_view_walker() {

                        for attempt in 1..=max_attempts {
                            let mut target_window = None;

                            // 策略 A: 基于标题锁定窗口 (兼容包含匹配)
                            if !expected_win_name.is_empty() {
                                if let Ok(mut child) = walker.get_first_child(&root) {
                                    loop {
                                        let w_name = child.get_name().unwrap_or_default();
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

                            // 策略 B: 如果网页跳转导致标题变了，通过原来拾取的历史坐标逆推它所在的窗口
                            if target_window.is_none() {
                                if let Ok(element_at_point) = automation.element_from_point(Point::new(*fallback_x, *fallback_y)) {
                                    let mut curr = element_at_point;
                                    for _ in 0..50 {
                                        if let Ok(parent) = walker.get_parent(&curr) {
                                            if automation.compare_elements(&parent, &root).unwrap_or(false) {
                                                target_window = Some(curr.clone());
                                                if attempt == 1 {
                                                    println!("[Inspector] ⚠️ 标题失效，已通过历史坐标逆推锁定目标窗口!");
                                                }
                                                break;
                                            }
                                            curr = parent;
                                        } else {
                                            break;
                                        }
                                    }
                                }
                            }

                            // 开始在锁定的窗口内扫描
                            if let Some(win) = target_window {
                                // 1. 先用原生短超时搜索试试运气
                                let matcher = automation.create_matcher().from(win.clone()).name(name).timeout(500);
                                if let Ok(elem) = matcher.find_first() {
                                    println!("[Inspector] ✅ 沙箱原生匹配成功!");
                                    found_element = Some(elem);
                                } else {
                                    // 2. 弹性 BFS 扫描
                                    let mut queue = std::collections::VecDeque::new();
                                    queue.push_back(win);
                                    let mut count = 0;

                                    while let Some(node) = queue.pop_front() {
                                        count += 1;
                                        if count > 2500 { break; } // 安全阈值

                                        let c_name = node.get_name().unwrap_or_default();

                                        if c_name == *name {
                                            println!("[Inspector] ✅ 弹性 BFS 扫描精确命中 (扫描节点数: {})!", count);
                                            found_element = Some(node);
                                            break;
                                        } else if !name.is_empty() && c_name.contains(name) {
                                            found_element = Some(node.clone());
                                        }

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

                            // 找到了就直接跳出重试循环
                            if found_element.is_some() {
                                break;
                            }

                            // 没找到，说明网页还在加载，休眠等待
                            if attempt < max_attempts {
                                println!("[Inspector] ⏳ 元素未就绪 (网页加载中...)，等待 800ms 后重试 ({}/{})", attempt, max_attempts);
                                thread::sleep(Duration::from_millis(800));
                            }
                        }
                    }
                }

                // --- 3. 提取最精准的坐标 ---
                if let Some(elem) = found_element {
                    if let Ok(Some(point)) = elem.get_clickable_point() {
                        if point.get_x() > 0 && point.get_y() > 0 {
                            println!("[Inspector] 📍 提取 Clickable Point: ({}, {})", point.get_x(), point.get_y());
                            return Ok((point.get_x(), point.get_y()));
                        }
                    }
                    if let Ok(rect) = elem.get_bounding_rectangle() {
                        let cx = rect.get_left() + (rect.get_width() / 2);
                        let cy = rect.get_top() + (rect.get_height() / 2);
                        if cx > 0 && cy > 0 {
                            println!("[Inspector] 📍 提取 Rect Center: ({}, {})", cx, cy);
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
