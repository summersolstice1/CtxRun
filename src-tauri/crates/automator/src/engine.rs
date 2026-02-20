use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Emitter, Runtime};
use enigo::{
    Enigo, Mouse, Keyboard, Button, Coordinate,
    Settings, Direction, Key, Axis
};
use crate::models::{AutomatorAction, Workflow, WorkflowGraph, MouseButton, ActionTarget};
use crate::screen;
use crate::cdp::CdpSession;

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

async fn resolve_coords_with_timeout(target: &ActionTarget) -> (i32, i32) {
    let t_clone = target.clone();

    let task = tauri::async_runtime::spawn_blocking(move || {
        crate::inspector::resolve_target_to_coords(&t_clone)
    });

    match tokio::time::timeout(Duration::from_secs(15), task).await {
        Ok(Ok(Ok((x, y)))) => (x, y),
        Ok(Ok(Err(_e))) => extract_fallback(target),
        Ok(Err(_e)) => extract_fallback(target),
        Err(_) => extract_fallback(target)
    }
}

fn extract_fallback(target: &ActionTarget) -> (i32, i32) {
    match target {
        ActionTarget::Coordinate { x, y } => (*x, *y),
        ActionTarget::Semantic { fallback_x, fallback_y, .. } => (*fallback_x, *fallback_y),
        ActionTarget::WebSelector { fallback_x, fallback_y, .. } => (*fallback_x, *fallback_y),
    }
}

async fn execute_smart_action(enigo: &mut Enigo, action: &AutomatorAction) {
    match action {
        AutomatorAction::MoveTo { target } => {
            let (x, y) = resolve_coords_with_timeout(target).await;
            let _ = enigo.move_mouse(x, y, Coordinate::Abs);
        },

        AutomatorAction::Click { button, target } => {
            let mut cdp_handled = false;

            if let Some(ActionTarget::WebSelector { selector, url_contain, .. }) = target {
                match CdpSession::connect(9222, url_contain.as_deref()).await {
                    Ok(mut session) => {
                        match session.get_element_viewport_center(selector).await {
                            Ok((x, y)) => {
                                if session.simulate_mouse_click(x, y).await.is_ok() {
                                    cdp_handled = true;
                                }
                            },
                            Err(_) => {},
                        }
                    },
                    Err(_) => {}
                }
            }

            if !cdp_handled {
                if let Some(t) = target {
                    let (x, y) = resolve_coords_with_timeout(t).await;

                    if x == 0 && y == 0 {
                        return;
                    }
                    let _ = enigo.move_mouse(x, y, Coordinate::Abs);
                    tokio::time::sleep(Duration::from_millis(100)).await;
                    let btn = map_button(button);
                    let _ = enigo.button(btn, Direction::Click);
                }
            }
        },

        AutomatorAction::DoubleClick { button, target } => {
            if let Some(t) = target {
                let (x, y) = resolve_coords_with_timeout(t).await;
                let _ = enigo.move_mouse(x, y, Coordinate::Abs);
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            let btn = map_button(button);
            let _ = enigo.button(btn, Direction::Click);
            tokio::time::sleep(Duration::from_millis(50)).await;
            let _ = enigo.button(btn, Direction::Click);
        },

        AutomatorAction::Type { text, target } => {
            let mut cdp_handled = false;

            if let Some(ActionTarget::WebSelector { selector, url_contain, .. }) = target {
                match CdpSession::connect(9222, url_contain.as_deref()).await {
                    Ok(mut session) => {
                        if session.simulate_text_entry(selector, text).await.is_ok() {
                            cdp_handled = true;
                        }
                    },
                    Err(_) => {}
                }
            }

            if !cdp_handled {
                if let Some(t) = target {
                    let (x, y) = resolve_coords_with_timeout(t).await;

                    if x == 0 && y == 0 {
                        return;
                    }
                    let _ = enigo.move_mouse(x, y, Coordinate::Abs);
                    tokio::time::sleep(Duration::from_millis(50)).await;
                    let _ = enigo.button(Button::Left, Direction::Click);
                    tokio::time::sleep(Duration::from_millis(200)).await;
                }
                let _ = enigo.text(text);
            }
        },

        AutomatorAction::KeyPress { key, target } => {
            let mut handled = false;

            if let Some(ActionTarget::WebSelector { url_contain, .. }) = target {
                match CdpSession::connect(9222, url_contain.as_deref()).await {
                    Ok(mut session) => {
                        if session.simulate_key_press(key).await.is_ok() {
                            handled = true;
                        }
                    },
                    Err(_) => {}
                }
            }

            if !handled {
                execute_key_combination(enigo, key);
            }
        },

        AutomatorAction::Scroll { delta } => {
            let _ = enigo.scroll(*delta, Axis::Vertical);
        },

        AutomatorAction::Wait { ms } => {
            tokio::time::sleep(Duration::from_millis(*ms)).await;
        },

        AutomatorAction::CheckColor { .. } => {},
        AutomatorAction::Iterate { .. } => {},
        AutomatorAction::LaunchBrowser { browser, url, use_temp_profile } => {
            let is_edge = browser.to_lowercase().as_str() == "edge";

            let url_clone = url.clone();
            let use_temp = *use_temp_profile;
            let res = tauri::async_runtime::spawn_blocking(move || {
                launch_browser_internal(is_edge, url_clone, use_temp)
            }).await;

            if res.is_ok() {
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        },
    }
}

pub fn run_workflow_task<R: Runtime>(
    app: AppHandle<R>,
    workflow: Workflow,
    running_flag: Arc<AtomicBool>
) {
    tauri::async_runtime::spawn(async move {
        let mut enigo = match Enigo::new(&Settings::default()) {
            Ok(e) => e,
            Err(_e) => {
                running_flag.store(false, Ordering::SeqCst);
                let _ = app.emit("automator:status", false);
                return;
            }
        };

        let mut current_loop = 0;

        'outer: while running_flag.load(Ordering::SeqCst) {
            if workflow.repeat_count > 0 && current_loop >= workflow.repeat_count {
                break 'outer;
            }

            for (index, action) in workflow.actions.iter().enumerate() {
                if !running_flag.load(Ordering::SeqCst) {
                    break 'outer;
                }

                let _ = app.emit("automator:step", index);

                execute_smart_action(&mut enigo, action).await;

                tokio::time::sleep(Duration::from_millis(100)).await;
            }

            current_loop += 1;
            let _ = app.emit("automator:loop_count", current_loop);
        }

        reset_all_inputs_surgical(&mut enigo);

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
        "home" => Some(Key::Home),
        "end" => Some(Key::End),
        "pageup" | "page up" => Some(Key::PageUp),
        "pagedown" | "page down" => Some(Key::PageDown),
        "up" | "arrowup" | "arrow up" => Some(Key::UpArrow),
        "down" | "arrowdown" | "arrow down" => Some(Key::DownArrow),
        "left" | "arrowleft" | "arrow left" => Some(Key::LeftArrow),
        "right" | "arrowright" | "arrow right" => Some(Key::RightArrow),
        "f1" => Some(Key::F1), "f2" => Some(Key::F2), "f3" => Some(Key::F3),
        "f4" => Some(Key::F4), "f5" => Some(Key::F5), "f6" => Some(Key::F6),
        "f7" => Some(Key::F7), "f8" => Some(Key::F8), "f9" => Some(Key::F9),
        "f10" => Some(Key::F10), "f11" => Some(Key::F11), "f12" => Some(Key::F12),
        "a" => Some(Key::Unicode('a')), "b" => Some(Key::Unicode('b')), "c" => Some(Key::Unicode('c')),
        "d" => Some(Key::Unicode('d')), "e" => Some(Key::Unicode('e')), "f" => Some(Key::Unicode('f')),
        "g" => Some(Key::Unicode('g')), "h" => Some(Key::Unicode('h')), "i" => Some(Key::Unicode('i')),
        "j" => Some(Key::Unicode('j')), "k" => Some(Key::Unicode('k')), "l" => Some(Key::Unicode('l')),
        "m" => Some(Key::Unicode('m')), "n" => Some(Key::Unicode('n')), "o" => Some(Key::Unicode('o')),
        "p" => Some(Key::Unicode('p')), "q" => Some(Key::Unicode('q')), "r" => Some(Key::Unicode('r')),
        "s" => Some(Key::Unicode('s')), "t" => Some(Key::Unicode('t')), "u" => Some(Key::Unicode('u')),
        "v" => Some(Key::Unicode('v')), "w" => Some(Key::Unicode('w')), "x" => Some(Key::Unicode('x')),
        "y" => Some(Key::Unicode('y')), "z" => Some(Key::Unicode('z')),
        "0" => Some(Key::Unicode('0')), "1" => Some(Key::Unicode('1')), "2" => Some(Key::Unicode('2')),
        "3" => Some(Key::Unicode('3')), "4" => Some(Key::Unicode('4')), "5" => Some(Key::Unicode('5')),
        "6" => Some(Key::Unicode('6')), "7" => Some(Key::Unicode('7')), "8" => Some(Key::Unicode('8')),
        "9" => Some(Key::Unicode('9')),
        _ => None,
    }
}

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

    for m in &modifiers { let _ = enigo.key(*m, Direction::Press); }
    if let Some(k) = main_key { let _ = enigo.key(k, Direction::Click); }
    else if modifiers.is_empty() {}
    else { if let Some(m) = modifiers.first() { let _ = enigo.key(*m, Direction::Click); } }
    for m in modifiers.iter().rev() { let _ = enigo.key(*m, Direction::Release); }
}

fn reset_all_inputs_surgical(enigo: &mut Enigo) {
    let buttons = [Button::Left, Button::Right, Button::Middle];
    for btn in buttons { let _ = enigo.button(btn, Direction::Release); }
    let modifiers = [Key::Alt, Key::Control, Key::Shift, Key::Meta];
    for key in modifiers { let _ = enigo.key(key, Direction::Release); }
}

fn color_match(actual: &str, expected: &str, tolerance: u32) -> bool {
    if actual.len() != 7 || expected.len() != 7 {
        return false;
    }
    if !actual.starts_with('#') || !expected.starts_with('#') {
        return false;
    }
    let parse = |s: &str| u32::from_str_radix(s, 16).unwrap_or(0);
    let ar = parse(&actual[1..3]); let ag = parse(&actual[3..5]); let ab = parse(&actual[5..7]);
    let er = parse(&expected[1..3]); let eg = parse(&expected[3..5]); let eb = parse(&expected[5..7]);
    let diff_r = (ar as i32 - er as i32).unsigned_abs();
    let diff_g = (ag as i32 - eg as i32).unsigned_abs();
    let diff_b = (ab as i32 - eb as i32).unsigned_abs();
    diff_r <= tolerance && diff_g <= tolerance && diff_b <= tolerance
}

pub fn run_graph_task<R: Runtime>(
    app: AppHandle<R>,
    graph: WorkflowGraph,
    running_flag: Arc<AtomicBool>
) {
    tauri::async_runtime::spawn(async move {
        let mut enigo = match Enigo::new(&Settings::default()) {
            Ok(e) => e,
            Err(_e) => {
                running_flag.store(false, Ordering::SeqCst);
                let _ = app.emit("automator:status", false);
                return;
            }
        };

        let mut node_counters: HashMap<String, u32> = HashMap::new();
        let mut current_id = Some(graph.start_node_id.clone());
        let mut execution_count = 0u32;
        const MAX_EXECUTION_COUNT: u32 = 10000;

        while let Some(id) = current_id {
            execution_count += 1;
            if execution_count > MAX_EXECUTION_COUNT {
                break;
            }

            if !running_flag.load(Ordering::SeqCst) {
                break;
            }

            let node = match graph.nodes.get(&id) {
                Some(n) => n,
                None => {
                    break;
                }
            };

            let _ = app.emit("automator:step", &id);

            match &node.action {
                AutomatorAction::CheckColor { x, y, expected_hex, tolerance } => {
                    let x_coord = *x;
                    let y_coord = *y;
                    let expected_hex_clone = expected_hex.clone();
                    let tolerance_clone = *tolerance;

                    let color_res = tauri::async_runtime::spawn_blocking(move || {
                        screen::get_color_at(x_coord, y_coord)
                    }).await;

                    match color_res {
                        Ok(Ok(actual_color)) => {
                            let is_match = color_match(&actual_color, &expected_hex_clone, tolerance_clone);
                            current_id = if is_match {
                                node.true_id.clone()
                            } else {
                                node.false_id.clone()
                            };
                        },
                        Ok(Err(_e)) => {
                            current_id = node.false_id.clone();
                        },
                        Err(_e) => {
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
                    execute_smart_action(&mut enigo, &node.action).await;
                    current_id = node.next_id.clone();
                }
            }

            tokio::time::sleep(Duration::from_millis(50)).await;
        }

        reset_all_inputs_surgical(&mut enigo);

        running_flag.store(false, Ordering::SeqCst);
        let _ = app.emit("automator:status", false);
    });
}

fn launch_browser_internal(is_edge: bool, url: Option<String>, use_temp_profile: bool) -> Result<(), String> {
    let mut paths = Vec::new();

    #[cfg(target_os = "windows")]
    {
        let program_files = std::env::var("ProgramFiles").unwrap_or(r"C:\Program Files".to_string());
        let program_files_x86 = std::env::var("ProgramFiles(x86)").unwrap_or(r"C:\Program Files (x86)".to_string());
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();

        if is_edge {
            paths.push(PathBuf::from(&program_files).join(r"Microsoft\Edge\Application\msedge.exe"));
            paths.push(PathBuf::from(&program_files_x86).join(r"Microsoft\Edge\Application\msedge.exe"));
        } else {
            paths.push(PathBuf::from(&program_files).join(r"Google\Chrome\Application\chrome.exe"));
            paths.push(PathBuf::from(&program_files_x86).join(r"Google\Chrome\Application\chrome.exe"));
            paths.push(PathBuf::from(&local_app_data).join(r"Google\Chrome\Application\chrome.exe"));
        }
    }

    #[cfg(target_os = "macos")]
    {
        if is_edge {
            paths.push(PathBuf::from("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"));
        } else {
            paths.push(PathBuf::from("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"));
        }
    }

    #[cfg(target_os = "linux")]
    {
        if is_edge {
            paths.push(PathBuf::from("microsoft-edge"));
        } else {
            paths.push(PathBuf::from("google-chrome"));
            paths.push(PathBuf::from("google-chrome-stable"));
            paths.push(PathBuf::from("chromium"));
        }
    }

    let exe_path = paths.into_iter().find(|p| {
        #[cfg(target_os = "linux")]
        return which::which(p).is_ok();
        #[cfg(not(target_os = "linux"))]
        return p.exists();
    }).ok_or_else(|| "Browser executable not found".to_string())?;

    let mut cmd = Command::new(exe_path);
    cmd.arg("--remote-debugging-port=9222");
    cmd.arg("--no-first-run");
    cmd.arg("--no-default-browser-check");

    if use_temp_profile {
        let temp_dir = std::env::temp_dir().join("ctxrun_browser_profile");
        cmd.arg(format!("--user-data-dir={}", temp_dir.to_string_lossy()));
    }

    if let Some(u) = url {
        cmd.arg(u);
    } else {
        cmd.arg("about:blank");
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x00000008;
        cmd.creation_flags(DETACHED_PROCESS);
    }

    cmd.spawn()
        .map_err(|e| format!("Failed to launch browser: {}", e))?;
    Ok(())
}
