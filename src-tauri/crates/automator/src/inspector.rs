//! Inspector module for UI element detection and resolution

use crate::error::{AutomatorError, Result};
use crate::models::{ActionTarget, UIElementNode};
use enigo::{Enigo, Mouse, Settings};
use serde::{Deserialize, Serialize};

// Keep tree traversal bounded to avoid pathological UIA scans hanging automation.
#[cfg(target_os = "windows")]
const PATH_ASCEND_LIMIT: usize = 50;
#[cfg(target_os = "windows")]
const WINDOW_RESOLVE_RETRIES: u32 = 4;
#[cfg(target_os = "windows")]
const BFS_NODE_SCAN_LIMIT: usize = 2500;

#[cfg(target_os = "windows")]
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

#[cfg(target_os = "windows")]
pub fn get_element_under_cursor_impl() -> Result<PickedElement> {
    use std::thread;
    use std::time::Duration;
    use uiautomation::UIAutomation;
    use uiautomation::types::{ControlType, Point};

    let enigo =
        Enigo::new(&Settings::default()).map_err(|e| AutomatorError::InputError(e.to_string()))?;
    let (x, y) = enigo
        .location()
        .map_err(|e| AutomatorError::InputError(e.to_string()))?;

    // 初始化多线程 COM 模型
    unsafe {
        let _ = windows::Win32::System::Com::CoInitializeEx(
            None,
            windows::Win32::System::Com::COINIT_MULTITHREADED,
        );
    }

    if let Ok(automation) = UIAutomation::new() {
        let _ = automation.get_root_element();
        thread::sleep(Duration::from_millis(200));

        for attempt in 0..3 {
            if let Ok(element) = automation.element_from_point(Point::new(x, y)) {
                let name = element.get_name().unwrap_or_default();

                if !name.is_empty() || attempt == 2 {
                    let control_type = element.get_control_type().unwrap_or(ControlType::Custom);
                    let role = format!("{:?}", control_type);

                    let mut path = Vec::new();
                    let mut current = element.clone();
                    let mut window_title = None;

                    if let Ok(walker) = automation.get_control_view_walker()
                        && let Ok(root) = automation.get_root_element()
                    {
                        for _ in 0..PATH_ASCEND_LIMIT {
                            let c_name = current.get_name().unwrap_or_default();
                            let c_role = format!(
                                "{:?}",
                                current.get_control_type().unwrap_or(ControlType::Custom)
                            );
                            let c_class = current.get_classname().unwrap_or_default();

                            path.push(UIElementNode {
                                name: c_name.clone(),
                                role: c_role.clone(),
                                class_name: c_class,
                            });

                            if c_role == "Window"
                                && window_title.is_none()
                                && !c_name.is_empty()
                            {
                                window_title = Some(c_name);
                            }

                            if let Ok(parent) = walker.get_parent(&current) {
                                if automation.compare_elements(&parent, &root).unwrap_or(false) {
                                    break;
                                }
                                current = parent;
                            } else {
                                break;
                            }
                        }
                    }

                    path.reverse();

                    return Ok(PickedElement {
                        name,
                        role,
                        window_title,
                        process_name: None,
                        path,
                        x,
                        y,
                    });
                }
            }
            if attempt < 2 {
                thread::sleep(Duration::from_millis(300));
            }
        }
    }

    Ok(PickedElement {
        name: String::new(),
        role: String::new(),
        window_title: None,
        process_name: None,
        path: vec![],
        x,
        y,
    })
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
    let enigo =
        Enigo::new(&Settings::default()).map_err(|e| AutomatorError::InputError(e.to_string()))?;
    let (x, y) = enigo
        .location()
        .map_err(|e| AutomatorError::InputError(e.to_string()))?;
    Ok(PickedElement {
        name: String::new(),
        role: String::new(),
        window_title: None,
        process_name: None,
        path: vec![],
        x,
        y,
    })
}

pub fn resolve_target_to_coords(target: &ActionTarget) -> Result<(i32, i32)> {
    match target {
        ActionTarget::Coordinate { x, y } => Ok((*x, *y)),

        ActionTarget::WebSelector {
            fallback_x,
            fallback_y,
            ..
        } => Ok((*fallback_x, *fallback_y)),

        ActionTarget::Semantic {
            fallback_x,
            fallback_y,
            ..
        } => {
            #[cfg(target_os = "windows")]
            {
                resolve_semantic_target_windows(target, *fallback_x, *fallback_y)
            }

            #[cfg(not(target_os = "windows"))]
            {
                Ok((*fallback_x, *fallback_y))
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn resolve_semantic_target_windows(
    target: &ActionTarget,
    fallback_x: i32,
    fallback_y: i32,
) -> Result<(i32, i32)> {
    use std::thread;
    use std::time::Duration;
    use uiautomation::UIAutomation;
    use uiautomation::types::Point;

    let ActionTarget::Semantic {
        name,
        window_title,
        path,
        ..
    } = target
    else {
        return Ok((fallback_x, fallback_y));
    };

    unsafe {
        let _ = windows::Win32::System::Com::CoInitializeEx(
            None,
            windows::Win32::System::Com::COINIT_MULTITHREADED,
        );
    }

    let automation = match UIAutomation::new() {
        Ok(a) => a,
        Err(_) => {
            return Ok((fallback_x, fallback_y));
        }
    };

    thread::sleep(Duration::from_millis(50));
    if let Ok(element) = automation.element_from_point(Point::new(fallback_x, fallback_y))
        && let Ok(current_name) = element.get_name()
        && current_name == *name
    {
        return Ok((fallback_x, fallback_y));
    }

    let expected_win_name = window_title.clone().unwrap_or_else(|| {
        if !path.is_empty() {
            path[0].name.clone()
        } else {
            String::new()
        }
    });

    let mut found_element = None;
    let max_attempts = WINDOW_RESOLVE_RETRIES;

    if let Ok(root) = automation.get_root_element()
        && let Ok(walker) = automation.get_control_view_walker()
    {
        for attempt in 1..=max_attempts {
            let mut target_window = None;

            if !expected_win_name.is_empty()
                && let Ok(mut child) = walker.get_first_child(&root)
            {
                loop {
                    let w_name = child.get_name().unwrap_or_default();
                    if !w_name.is_empty()
                        && (w_name.contains(&expected_win_name) || expected_win_name.contains(&w_name))
                    {
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

            if target_window.is_none()
                && let Ok(element_at_point) =
                    automation.element_from_point(Point::new(fallback_x, fallback_y))
            {
                let mut curr = element_at_point;
                for _ in 0..PATH_ASCEND_LIMIT {
                    if let Ok(parent) = walker.get_parent(&curr) {
                        if automation.compare_elements(&parent, &root).unwrap_or(false) {
                            target_window = Some(curr.clone());
                            break;
                        }
                        curr = parent;
                    } else {
                        break;
                    }
                }
            }

            if let Some(win) = target_window {
                let matcher = automation
                    .create_matcher()
                    .from(win.clone())
                    .name(name)
                    .timeout(500);
                if let Ok(elem) = matcher.find_first() {
                    found_element = Some(elem);
                } else {
                    let mut queue = std::collections::VecDeque::new();
                    queue.push_back(win);
                    let mut count = 0;

                    while let Some(node) = queue.pop_front() {
                        count += 1;
                        if count > BFS_NODE_SCAN_LIMIT {
                            break;
                        }

                        let c_name = node.get_name().unwrap_or_default();

                        if c_name == *name {
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

            if found_element.is_some() {
                break;
            }

            if attempt < max_attempts {
                thread::sleep(Duration::from_millis(800));
            }
        }
    }

    if let Some(elem) = found_element {
        if let Ok(Some(point)) = elem.get_clickable_point()
            && point.get_x() > 0
            && point.get_y() > 0
        {
            return Ok((point.get_x(), point.get_y()));
        }
        if let Ok(rect) = elem.get_bounding_rectangle() {
            let cx = rect.get_left() + (rect.get_width() / 2);
            let cy = rect.get_top() + (rect.get_height() / 2);
            if cx > 0 && cy > 0 {
                return Ok((cx, cy));
            }
        }
    }

    Ok((fallback_x, fallback_y))
}
