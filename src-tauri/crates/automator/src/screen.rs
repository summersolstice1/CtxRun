use crate::error::{AutomatorError, Result};
use thiserror::Error;
use xcap::Monitor;

#[derive(Debug, Error)]
pub enum ColorPickError {
    #[error("No monitor found containing coordinates ({x}, {y})")]
    NoScreenFound { x: i32, y: i32 },
    #[error("Failed to capture screen: {0}")]
    CaptureFailed(String),
    #[error("Coordinates ({x}, {y}) out of bounds ({width}x{height})")]
    OutOfBounds {
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    },
}

impl From<ColorPickError> for AutomatorError {
    fn from(err: ColorPickError) -> Self {
        AutomatorError::ScreenError(err.to_string())
    }
}

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

pub fn get_color_at(x: i32, y: i32) -> Result<String> {
    let monitors = Monitor::all()
        .map_err(|e| ColorPickError::CaptureFailed(format!("Failed to get monitors: {}", e)))?;

    if monitors.is_empty() {
        return Err(ColorPickError::CaptureFailed("No monitors found".into()).into());
    }

    let target_monitor = monitors.iter().find(|m| {
        let mx = m.x().unwrap_or(0);
        let my = m.y().unwrap_or(0);
        let mw = m.width().unwrap_or(0) as i32;
        let mh = m.height().unwrap_or(0) as i32;
        x >= mx && x < mx + mw && y >= my && y < my + mh
    });

    let monitor = match target_monitor {
        Some(m) => m,
        None => return Err(ColorPickError::NoScreenFound { x, y }.into()),
    };

    let image = monitor
        .capture_image()
        .map_err(|e| ColorPickError::CaptureFailed(format!("capture_image failed: {}", e)))?;
    let monitor_x = monitor.x().unwrap_or(0);
    let monitor_y = monitor.y().unwrap_or(0);
    let local_x = (x - monitor_x) as u32;
    let local_y = (y - monitor_y) as u32;
    let (img_w, img_h) = image.dimensions();
    if local_x >= img_w || local_y >= img_h {
        return Err(ColorPickError::OutOfBounds {
            x,
            y,
            width: img_w,
            height: img_h,
        }
        .into());
    }
    let pixel = image.get_pixel(local_x, local_y);
    let r = pixel[0];
    let g = pixel[1];
    let b = pixel[2];

    Ok(format!("#{:02X}{:02X}{:02X}", r, g, b))
}

pub fn get_all_screens_info() -> Result<Vec<ScreenInfo>> {
    let monitors = Monitor::all()
        .map_err(|e| ColorPickError::CaptureFailed(format!("Failed to get monitors: {}", e)))?;

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
        .collect::<std::result::Result<Vec<_>, xcap::XCapError>>()
        .map_err(|e| ColorPickError::CaptureFailed(format!("Failed to get monitor info: {}", e)))?;

    Ok(infos)
}
