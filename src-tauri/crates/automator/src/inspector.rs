//! Inspector module for UI element detection and resolution

use serde::{Deserialize, Serialize};
use crate::error::{AutomatorError, Result};
use crate::models::ActionTarget;
use enigo::{Enigo, Mouse, Settings};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PickedElement {
    pub name: String,
    pub role: String,
    pub x: i32,
    pub y: i32,
}

#[cfg(target_os = "windows")]
pub fn get_element_under_cursor_impl() -> Result<PickedElement> {
    use uiautomation::UIAutomation;
    use uiautomation::types::Point;

    let enigo = Enigo::new(&Settings::default()).map_err(|e| AutomatorError::InputError(e.to_string()))?;
    let (x, y) = enigo.location().map_err(|e| AutomatorError::InputError(e.to_string()))?;

    if let Ok(automation) = UIAutomation::new() {
        if let Ok(element) = automation.element_from_point(Point::new(x, y)) {
            let name = element.get_name().unwrap_or_default();
            let control_type = element.get_control_type().unwrap_or(uiautomation::types::ControlType::Custom);
            let role = format!("{:?}", control_type);
            return Ok(PickedElement { name, role, x, y });
        }
    }
    Ok(PickedElement { name: String::new(), role: String::new(), x, y })
}

#[cfg(not(target_os = "windows"))]
pub fn get_element_under_cursor_impl() -> Result<PickedElement> {
    let enigo = Enigo::new(&Settings::default()).map_err(|e| AutomatorError::InputError(e.to_string()))?;
    let (x, y) = enigo.location().map_err(|e| AutomatorError::InputError(e.to_string()))?;
    Ok(PickedElement { name: String::new(), role: String::new(), x, y })
}

/// 🚀 核心：智能坐标解析（带乐观验证）
pub fn resolve_target_to_coords(target: &ActionTarget) -> Result<(i32, i32)> {
    match target {
        ActionTarget::Coordinate { x, y } => Ok((*x, *y)),

        ActionTarget::Semantic { name, role: _, fallback_x, fallback_y } => {
            #[cfg(target_os = "windows")]
            {
                use uiautomation::UIAutomation;
                use uiautomation::types::Point;

                let automation = UIAutomation::new().map_err(|e| AutomatorError::ScreenError(e.to_string()))?;

                // ---------------------------------------------------------
                // ⚡ 策略 1：乐观验证 (0ms)
                // 直接看原来的坐标上，是不是我们要找的那个东西？
                // ---------------------------------------------------------
                if let Ok(element) = automation.element_from_point(Point::new(*fallback_x, *fallback_y)) {
                    if let Ok(current_name) = element.get_name() {
                        // 如果名字和当初录制的一样，直接命中！无需搜索！
                        if current_name == *name {
                            println!("[Inspector] ⚡ 极速命中: 元素仍在原位");
                            return Ok((*fallback_x, *fallback_y));
                        }
                    }
                }

                println!("[Inspector] 原位验证失败，尝试全屏搜索 (可能较慢)...");

                // ---------------------------------------------------------
                // 🔍 策略 2：全屏搜索 (重型操作)
                // ---------------------------------------------------------
                if !name.trim().is_empty() {
                    if let Ok(root) = automation.get_root_element() {
                        let matcher = automation.create_matcher()
                            .from(root)
                            .name(name)
                            .timeout(2000); // 2秒超时

                        if let Ok(element) = matcher.find_first() {
                            if let Ok(rect) = element.get_bounding_rectangle() {
                                let cx = rect.get_left() + (rect.get_width() / 2);
                                let cy = rect.get_top() + (rect.get_height() / 2);
                                if cx > 0 && cy > 0 {
                                    println!("[Inspector] ✅ 搜索成功: 元素已移动到 ({}, {})", cx, cy);
                                    return Ok((cx, cy));
                                }
                            }
                        }
                    }
                }
            }

            // 兜底：如果都失败了，还是返回老坐标，死马当活马医
            println!("[Inspector] ⚠️ 搜索彻底失败，强制使用回退坐标");
            Ok((*fallback_x, *fallback_y))
        }
    }
}
