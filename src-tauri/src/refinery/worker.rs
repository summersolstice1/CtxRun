use std::thread;
use std::time::Duration;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::LazyLock;
use tauri::{AppHandle, Emitter, Manager};
use clipboard_rs::{
    Clipboard, ClipboardContext, ClipboardHandler,
    ClipboardWatcher, ClipboardWatcherContext, ContentFormat,
};
use clipboard_rs::common::RustImage;
use image::DynamicImage;
use tokio::sync::mpsc;
use crossbeam_channel::{bounded, Sender};
use x_win::{get_active_window, get_browser_url};

use crate::db::DbState;
use super::model::{RefineryKind, RefineryMetadata};
use super::storage::{hash_content_fast, save_image_to_disk, capture_clipboard_item};

pub static PASTING_FLAG: LazyLock<Arc<AtomicBool>> =
    LazyLock::new(|| Arc::new(AtomicBool::new(false)));

// === 数据结构定义 ===

enum ClipboardPayload {
    Text {
        content: String,
        source_app: Option<String>,
        url: Option<String>,
    },
    Image {
        image: DynamicImage,
        source_app: Option<String>,
        url: Option<String>,
    },
    Mixed {
        text: String,
        image: DynamicImage,
        source_app: Option<String>,
        url: Option<String>,
    },
    Files {
        paths: Vec<String>,
        source_app: Option<String>,
    }
}

// === 生产者：RefineryListener ===

struct RefineryListener {
    tx: Sender<ClipboardPayload>,
    is_pasting: Arc<AtomicBool>,
}

impl RefineryListener {
    // 恢复原先健壮的检测逻辑
    fn is_self_app(&self, active_app: &str) -> bool {
        let current = active_app.to_lowercase();

        // 动态获取当前运行的 exe 名称
        let self_exe = std::env::current_exe()
            .ok()
            .and_then(|p| p.file_stem().map(|s| s.to_string_lossy().to_lowercase()))
            .unwrap_or_else(|| "ctxrun".to_string());

        // 匹配 Exe 名称 或 包含 ctxrun 关键字
        current == self_exe ||
        current == format!("{}.exe", self_exe) ||
        current.contains("ctxrun")
    }
}

impl ClipboardHandler for RefineryListener {
    fn on_clipboard_change(&mut self) {
        // 1. 内部标志位检测 (用于 spotlight_paste 等内部操作)
        if self.is_pasting.load(Ordering::SeqCst) {
            return;
        }

        // 2. 获取当前活动窗口信息
        // 注意：x_win 在某些系统可能略有耗时，但为了过滤必须在读取剪贴板前执行
        let active_window = get_active_window().ok();
        let app_name = active_window.as_ref().map(|w| w.info.exec_name.clone());

        // 3. 核心修复：如果是自身应用，直接中断！
        if let Some(ref name) = app_name {
            if self.is_self_app(name) {
                // 这里不做任何操作，直接返回，不读取剪贴板
                return;
            }
        }

        // 4. 获取 URL (仅当不是自身时才尝试获取)
        let url = active_window.as_ref().and_then(|w| get_browser_url(w).ok());

        // 5. 初始化剪贴板上下文
        let ctx = match ClipboardContext::new() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[Refinery] Failed to acquire context: {}", e);
                return;
            }
        };

        // 6. 优先检查文件列表 (Files)
        if ctx.has(ContentFormat::Files) {
            if let Ok(paths) = ctx.get_files() {
                if !paths.is_empty() {
                    let _ = self.tx.try_send(ClipboardPayload::Files {
                        paths,
                        source_app: app_name
                    });
                    return;
                }
            }
        }

        // 7. 图片/混合内容处理
        let has_image = ctx.has(ContentFormat::Image);
        let has_text = ctx.has(ContentFormat::Text);

        let payload = if has_image && has_text {
            let text = ctx.get_text().unwrap_or_default();
            if let Ok(rust_image) = ctx.get_image() {
                if let Ok(dyn_image) = rust_image.get_dynamic_image() {
                    Some(ClipboardPayload::Mixed { text, image: dyn_image, source_app: app_name, url })
                } else { None }
            } else { None }
        } else if has_image {
            if let Ok(rust_image) = ctx.get_image() {
                if let Ok(dyn_image) = rust_image.get_dynamic_image() {
                    Some(ClipboardPayload::Image { image: dyn_image, source_app: app_name, url })
                } else { None }
            } else { None }
        } else if has_text {
            if let Ok(text) = ctx.get_text() {
                if !text.trim().is_empty() {
                    Some(ClipboardPayload::Text { content: text, source_app: app_name, url })
                } else { None }
            } else { None }
        } else {
            None
        };

        // 8. 发送给消费者
        if let Some(p) = payload {
            let _ = self.tx.try_send(p);
        }
    }
}

// === 消费者：RefineryProcessor ===

struct RefineryProcessor {
    app: AppHandle,
    last_text_hash: String,
    last_image_hash: String,
    cleanup_sender: Option<mpsc::Sender<()>>,
}

impl RefineryProcessor {
    fn new(app: AppHandle, cleanup_sender: Option<mpsc::Sender<()>>) -> Self {
        Self {
            app,
            last_text_hash: String::new(),
            last_image_hash: String::new(),
            cleanup_sender,
        }
    }

    fn process(&mut self, payload: ClipboardPayload) {
        match payload {
            ClipboardPayload::Text { content, source_app, url } => {
                self.handle_text(content, source_app, url);
            },
            ClipboardPayload::Image { image, source_app, url } => {
                self.handle_image(image, source_app, url);
            },
            ClipboardPayload::Mixed { text, image, source_app, url } => {
                self.handle_mixed(text, image, source_app, url);
            },
            ClipboardPayload::Files { paths, source_app } => {
                self.handle_files(paths, source_app);
            }
        }
    }

    fn handle_text(&mut self, content: String, source_app: Option<String>, url: Option<String>) {
        let hash = hash_content_fast(content.as_bytes());

        if hash == self.last_text_hash { return; }
        self.last_text_hash = hash.clone();

        let char_count = content.chars().count();
        let size_info = format!("{} chars", char_count);
        let preview: String = content.chars().take(300).collect();

        let metadata = RefineryMetadata {
            width: None, height: None, format: Some("text".into()),
            tokens: Some(char_count / 4),
            image_path: None
        };

        self.write_to_db(RefineryKind::Text, Some(content), hash, Some(preview), source_app, url, Some(size_info), metadata);
    }

    fn handle_files(&mut self, paths: Vec<String>, source_app: Option<String>) {
        let content = paths.join("\n");
        let hash = hash_content_fast(content.as_bytes());

        if hash == self.last_text_hash { return; }
        self.last_text_hash = hash.clone();

        let file_count = paths.len();
        let size_info = format!("{} files", file_count);

        let preview = paths.iter()
            .take(5)
            .map(|p| std::path::Path::new(p).file_name().unwrap_or_default().to_string_lossy())
            .collect::<Vec<_>>()
            .join("\n") + if file_count > 5 { "\n..." } else { "" };

        let metadata = RefineryMetadata {
            width: None, height: None, format: Some("file-list".into()),
            tokens: None, image_path: None
        };

        self.write_to_db(RefineryKind::Text, Some(content), hash, Some(preview), source_app, None, Some(size_info), metadata);
    }

    fn handle_image(&mut self, image: DynamicImage, source_app: Option<String>, url: Option<String>) {
        if image.width() > 8000 || image.height() > 8000 { return; }

        let save_result = save_image_to_disk(&self.app, &image);

        match save_result {
            Ok((file_path, hash)) => {
                if hash == self.last_image_hash { return; }
                self.last_image_hash = hash.clone();

                let size_info = format!("{}x{}", image.width(), image.height());
                let metadata = RefineryMetadata {
                    width: Some(image.width()),
                    height: Some(image.height()),
                    format: Some("png".to_string()),
                    tokens: None,
                    image_path: None,
                };

                self.write_to_db(RefineryKind::Image, Some(file_path), hash, Some("[Image]".into()), source_app, url, Some(size_info), metadata);
            },
            Err(e) => eprintln!("[Refinery] Image save failed: {}", e),
        }
    }

    fn handle_mixed(&mut self, text: String, image: DynamicImage, source_app: Option<String>, url: Option<String>) {
        if image.width() > 8000 || image.height() > 8000 {
            self.handle_text(text, source_app, url);
            return;
        }

        let save_result = save_image_to_disk(&self.app, &image);
        match save_result {
            Ok((file_path, img_hash)) => {
                let text_hash = hash_content_fast(text.as_bytes());
                let combined_hash = hash_content_fast(format!("{}{}", text_hash, img_hash).as_bytes());

                if combined_hash == self.last_text_hash { return; }
                self.last_text_hash = combined_hash.clone();

                let char_count = text.chars().count();
                let size_info = format!("{} chars + {}x{}", char_count, image.width(), image.height());
                let preview = Some(text.chars().take(300).collect());

                let metadata = RefineryMetadata {
                    width: Some(image.width()),
                    height: Some(image.height()),
                    format: Some("png".to_string()),
                    tokens: None,
                    image_path: Some(file_path),
                };

                self.write_to_db(RefineryKind::Mixed, Some(text), combined_hash, preview, source_app, url, Some(size_info), metadata);
            },
            Err(_) => self.handle_text(text, source_app, url),
        }
    }

    fn write_to_db(
        &self,
        kind: RefineryKind,
        content: Option<String>,
        hash: String,
        preview: Option<String>,
        source_app: Option<String>,
        url: Option<String>,
        size_info: Option<String>,
        metadata: RefineryMetadata
    ) {
        let state = self.app.state::<DbState>();
        if let Ok(conn) = state.conn.lock() {
            if let Ok((is_new, id)) = capture_clipboard_item(
                &conn, kind, content, hash, preview, source_app, url, size_info, metadata
            ) {
                let event_name = if is_new { "refinery:create" } else { "refinery:update" };
                let _ = self.app.emit(event_name, &id);

                if is_new {
                    if let Some(ref sender) = self.cleanup_sender {
                        let _ = sender.blocking_send(());
                    }
                }
            }
        }
    }
}

// === 启动入口 ===

pub fn init_listener(app: AppHandle, cleanup_sender: Option<mpsc::Sender<()>>) {
    let (tx, rx) = bounded::<ClipboardPayload>(5);

    // 1. 启动消费者线程 (Processor)
    let app_handle = app.clone();
    thread::spawn(move || {
        let mut processor = RefineryProcessor::new(app_handle, cleanup_sender);

        while let Ok(payload) = rx.recv() {
            processor.process(payload);
        }
    });

    // 2. 启动生产者线程 (Listener)
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(1));
        println!("[Refinery] Starting Clipboard Producer...");

        let manager = ClipboardWatcherContext::new();
        match manager {
            Ok(mut watcher) => {
                let listener = RefineryListener {
                    tx,
                    is_pasting: PASTING_FLAG.clone(),
                };
                watcher.add_handler(listener);
                watcher.start_watch();
            }
            Err(e) => {
                eprintln!("[Refinery] Failed to initialize ClipboardWatcher: {}", e);
            }
        }
    });
}
