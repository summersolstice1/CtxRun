use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use enigo::{Enigo, Mouse, Button, Coordinate, Settings, Direction};
use super::model::{ClickerConfig, ClickType, StopCondition};

// 全局运行状态锁
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

pub fn run_clicker_task(
    app: AppHandle,
    config: ClickerConfig,
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

        let mut count = 0u64;
        let button = match config.click_type {
            ClickType::Left => Button::Left,
            ClickType::Right => Button::Right,
            ClickType::Middle => Button::Middle,
        };

        println!("[Automator] Started. Interval: {}ms", config.interval_ms);

        while running_flag.load(Ordering::SeqCst) {
            // 1. 检查坐标锁定
            if config.use_fixed_location {
                // move_mouse 可能会失败（例如在某些受限窗口上），这里忽略错误继续尝试
                let _ = enigo.move_mouse(config.fixed_x, config.fixed_y, Coordinate::Abs);
            }

            // 2. 执行点击
            let _ = enigo.button(button, Direction::Click);

            // 3. 更新计数并通知前端
            count += 1;
            let _ = app.emit("automator:count", count);

            // 4. 检查停止条件
            if let StopCondition::MaxCount(max) = config.stop_condition {
                if count >= max {
                    break;
                }
            }

            // 5. 等待 (使用 thread::sleep 保证精度，并拆分等待时间以便快速响应停止信号)
            // 如果间隔大于 100ms，我们切分成小块 check，提高响应速度
            if config.interval_ms > 100 {
                let chunks = config.interval_ms / 50;
                for _ in 0..chunks {
                    if !running_flag.load(Ordering::SeqCst) { break; }
                    thread::sleep(Duration::from_millis(50));
                }
                // 补齐剩余时间
                thread::sleep(Duration::from_millis(config.interval_ms % 50));
            } else {
                thread::sleep(Duration::from_millis(config.interval_ms));
            }
        }

        // 任务结束，重置状态
        running_flag.store(false, Ordering::SeqCst);
        let _ = app.emit("automator:status", false);
        println!("[Automator] Stopped. Total clicks: {}", count);
    });
}
