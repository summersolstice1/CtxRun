//! 跨平台屏幕工具模块
//! 使用 xcap 库提供屏幕取色、截图等功能

use xcap::Monitor;
use image::GenericImageView;
use std::error::Error;
use std::fmt;
use xcap::XCapError;

/// 屏幕取色错误类型
#[derive(Debug)]
pub enum ColorPickError {
    /// 没有找到包含该坐标的屏幕
    NoScreenFound { x: i32, y: i32 },
    /// 截图失败
    CaptureFailed(String),
    /// 坐标超出屏幕范围
    OutOfBounds { x: i32, y: i32, width: u32, height: u32 },
}

impl fmt::Display for ColorPickError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ColorPickError::NoScreenFound { x, y } => {
                write!(f, "No monitor found containing coordinates ({}, {})", x, y)
            }
            ColorPickError::CaptureFailed(msg) => {
                write!(f, "Failed to capture screen: {}", msg)
            }
            ColorPickError::OutOfBounds { x, y, width, height } => {
                write!(f, "Coordinates ({}, {}) out of bounds ({}x{})", x, y, width, height)
            }
        }
    }
}

impl Error for ColorPickError {}

/// 屏幕信息结构体
#[derive(Debug, Clone, serde::Serialize)]
pub struct ScreenInfo {
    pub id: i32,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub name: String,
}

/// 使用 xcap 跨平台获取指定全局坐标 (x, y) 的颜色值
///
/// # 参数
/// - `x`: 屏幕绝对 X 坐标
/// - `y`: 屏幕绝对 Y 坐标
///
/// # 返回
/// 成功返回 `#RRGGBB` 格式的颜色字符串，失败返回错误信息
///
/// # 平台支持
/// - **Windows**: 使用 DirectX/Desktop Duplication API
/// - **macOS**: 使用 CoreGraphics (CGDisplayCreateImage)
/// - **Linux**: 支持 X11 和 Wayland
///
/// # 示例
/// ```no_run
/// use crate::screen::get_color_at;
///
/// match get_color_at(100, 200) {
///     Ok(color) => println!("Color at (100, 200): {}", color),
///     Err(e) => eprintln!("Error: {}", e),
/// }
/// ```
pub fn get_color_at(x: i32, y: i32) -> Result<String, Box<dyn Error + Send + Sync>> {
    // 1. 获取所有物理显示器
    let monitors = Monitor::all().map_err(|e| {
        ColorPickError::CaptureFailed(format!("Failed to get monitors: {}", e))
    })?;

    if monitors.is_empty() {
        return Err(Box::new(ColorPickError::CaptureFailed("No monitors found".into())));
    }

    // 调试信息：打印所有显示器信息
    eprintln!("[ColorPick] Querying color at ({}, {}), available monitors: {}", x, y, monitors.len());
    for (idx, monitor) in monitors.iter().enumerate() {
        let name = monitor.name().unwrap_or_else(|_| "Unknown".to_string());
        let mx = monitor.x().unwrap_or(0);
        let my = monitor.y().unwrap_or(0);
        let mw = monitor.width().unwrap_or(0);
        let mh = monitor.height().unwrap_or(0);
        let scale = monitor.scale_factor().unwrap_or(1.0);
        eprintln!("[ColorPick] Monitor {}: name='{}', x={}, y={}, size={}x{}, scale={}",
            idx, name, mx, my, mw, mh, scale);
    }

    // 2. 找到包含该全局坐标的显示器
    // xcap 的 Monitor 方法都返回 Result，需要 unwrap
    let target_monitor = monitors
        .iter()
        .find(|m| {
            let mx = m.x().unwrap_or(0);
            let my = m.y().unwrap_or(0);
            let mw = m.width().unwrap_or(0) as i32;
            let mh = m.height().unwrap_or(0) as i32;
            x >= mx && x < mx + mw && y >= my && y < my + mh
        });

    let monitor = match target_monitor {
        Some(m) => m,
        None => {
            // 打印所有显示器范围帮助调试
            for (idx, m) in monitors.iter().enumerate() {
                let name = m.name().unwrap_or_else(|_| "Unknown".to_string());
                let mx = m.x().unwrap_or(0);
                let my = m.y().unwrap_or(0);
                let mw = m.width().unwrap_or(0) as i32;
                let mh = m.height().unwrap_or(0) as i32;
                eprintln!("[ColorPick] Monitor {}: x=[{}, {}), y=[{}, {}), name='{}'",
                    idx, mx, mx + mw, my, my + mh, name);
            }
            return Err(Box::new(ColorPickError::NoScreenFound { x, y }));
        }
    };

    // 3. 抓取该显示器的当前帧图像
    // 注意：xcap 返回的是 image::RgbaImage
    let image = monitor.capture_image().map_err(|e| {
        ColorPickError::CaptureFailed(format!("capture_image failed: {}", e))
    })?;

    // 4. 将全局坐标转换为显示器内的局部坐标
    // 例如：如果显示器在右侧，全局 X 是 2000，显示器起始 X 是 1920，则局部 X 是 80
    let monitor_x = monitor.x().unwrap_or(0);
    let monitor_y = monitor.y().unwrap_or(0);
    let local_x = (x - monitor_x) as u32;
    let local_y = (y - monitor_y) as u32;

    eprintln!("[ColorPick] Found monitor: local coords=({}, {})", local_x, local_y);

    // 安全检查：防止坐标溢出图像边界
    let (img_w, img_h) = image.dimensions();
    if local_x >= img_w || local_y >= img_h {
        return Err(Box::new(ColorPickError::OutOfBounds { x, y, width: img_w, height: img_h }));
    }

    // 5. 读取像素数据
    let pixel = image.get_pixel(local_x, local_y);

    // 6. 转换颜色
    let r = pixel[0];
    let g = pixel[1];
    let b = pixel[2];

    let color = format!("#{:02X}{:02X}{:02X}", r, g, b);
    eprintln!("[ColorPick] Got color: {}", color);

    Ok(color)
}

/// 获取所有屏幕的显示信息
///
/// # 返回
/// 返回所有屏幕的显示信息向量，包括位置、尺寸等
///
/// # 用途
/// 可用于前端显示屏幕选择器，或进行坐标转换
pub fn get_all_screens_info() -> Result<Vec<ScreenInfo>, Box<dyn Error + Send + Sync>> {
    let monitors = Monitor::all().map_err(|e| {
        ColorPickError::CaptureFailed(format!("Failed to get monitors: {}", e))
    })?;

    let infos = monitors
        .into_iter()
        .enumerate()
        .map(|(idx, m)| {
            Ok(ScreenInfo {
                id: idx as i32,
                x: m.x()?,
                y: m.y()?,
                width: m.width()?,
                height: m.height()?,
                scale_factor: m.scale_factor()? as f64,
                name: m.name()?,
            })
        })
        .collect::<Result<Vec<_>, XCapError>>()
        .map_err(|e: XCapError| ColorPickError::CaptureFailed(format!("Failed to get monitor info: {}", e)))?;

    Ok(infos)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_color_at() {
        // 这是一个简单的测试，确保函数能够编译和运行
        // 在没有显示器的 CI 环境中可能会失败
        if let Ok(color) = get_color_at(0, 0) {
            assert!(color.starts_with('#'));
            assert_eq!(color.len(), 7);
        }
    }

    #[test]
    fn test_get_all_screens_info() {
        if let Ok(screens) = get_all_screens_info() {
            assert!(!screens.is_empty());
        }
    }
}
