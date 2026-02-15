use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use enigo::{
    Enigo, Mouse, Keyboard, Button, Coordinate,
    Settings, Direction, Key, Axis
};
use crate::models::{AutomatorAction, Workflow, MouseButton};

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

pub fn run_workflow_task<R: Runtime>(
    app: AppHandle<R>,
    workflow: Workflow,
    running_flag: Arc<AtomicBool>
) {
    thread::spawn(move || {
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

        while running_flag.load(Ordering::SeqCst) {
            if workflow.repeat_count > 0 && current_loop >= workflow.repeat_count {
                break;
            }

            for (index, action) in workflow.actions.iter().enumerate() {
                if !running_flag.load(Ordering::SeqCst) { break; }

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
                        thread::sleep(Duration::from_millis(50));
                        let _ = enigo.button(btn, Direction::Click);
                    },
                    AutomatorAction::Type { text } => {
                        let _ = enigo.text(text);
                    },
                    AutomatorAction::KeyPress { key } => {
                        if let Some(k) = map_key(key) {
                            let _ = enigo.key(k, Direction::Click);
                        }
                    },
                    AutomatorAction::Scroll { delta } => {
                        let _ = enigo.scroll(*delta, Axis::Vertical);
                    },
                    AutomatorAction::Wait { ms } => {
                        thread::sleep(Duration::from_millis(*ms));
                    }
                }

                thread::sleep(Duration::from_millis(50));
            }

            current_loop += 1;
            let _ = app.emit("automator:loop_count", current_loop);
        }

        running_flag.store(false, Ordering::SeqCst);
        let _ = app.emit("automator:status", false);
        println!("[Automator] Stopped.");
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
        _ => None,
    }
}
