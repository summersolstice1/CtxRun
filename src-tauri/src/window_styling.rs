#[cfg(target_os = "windows")]
use tauri::WebviewWindow;

#[cfg(target_os = "windows")]
pub fn configure_guard_window(window: &WebviewWindow) {
    let _ = window.set_shadow(false);
    let _ = window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));

    #[cfg(target_os = "windows")]
    windows::apply_guard_window_style(window);
}

#[cfg(target_os = "windows")]
mod windows {
    use std::mem::size_of_val;

    use tauri::WebviewWindow;
    use windows::Win32::Graphics::Dwm::{
        DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, DWMWA_WINDOW_CORNER_PREFERENCE,
        DWM_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND, DwmSetWindowAttribute,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SetWindowPos,
    };

    pub fn apply_guard_window_style(window: &WebviewWindow) {
        apply_window_style(window, DWMWCP_DONOTROUND);
    }

    fn apply_window_style(
        window: &WebviewWindow,
        corner_preference: DWM_WINDOW_CORNER_PREFERENCE,
    ) {
        let Ok(hwnd) = window.hwnd() else {
            return;
        };

        unsafe {
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &corner_preference as *const _ as _,
                size_of_val(&corner_preference) as u32,
            );

            let border_color = DWMWA_COLOR_NONE;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_BORDER_COLOR,
                &border_color as *const _ as _,
                size_of_val(&border_color) as u32,
            );

            let _ = SetWindowPos(
                hwnd,
                None,
                0,
                0,
                0,
                0,
                SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
            );
        }
    }
}
