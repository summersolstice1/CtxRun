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

// 定义传递给消费者的事件载荷
// 我们在这里只持有数据，不进行耗时操作
enum ClipboardPayload {
    Text {
        content: String,
        source_app: Option<String>,
        url: Option<String>,
    },
    Image {
        image: DynamicImage, // 内存中的原始位图，尚未编码
        source_app: Option<String>,
        url: Option<String>,
    },
    Mixed {
        text: String,
        image: DynamicImage,
        source_app: Option<String>,
        url: Option<String>,
    }
}

// === 生产者：RefineryListener ===
// 只负责从系统剪贴板读取数据，放入通道

struct RefineryListener {
    tx: Sender<ClipboardPayload>,
    is_pasting: Arc<AtomicBool>,
}

impl RefineryListener {
    // 辅助：获取当前 App 上下文（虽然有点耗时，但为了数据完整性通常在这一层做）
    // 如果想要极致快，这部分也可以移到消费者，但可能会导致获取到的窗口不是当时的窗口
    fn get_context_info(&self) -> (Option<String>, Option<String>) {
        let app_name = match get_active_window() {
            Ok(window) => Some(window.info.exec_name),
            Err(_) => None,
        };

        // 过滤掉自己
        if let Some(ref name) = app_name {
             let current = name.to_lowercase();
             if current.contains("ctxrun") || current.contains("codeforge") {
                 return (None, None); // 标记为忽略
             }
        }

        let url = match get_active_window() {
            Ok(window) => get_browser_url(&window).ok(),
            Err(_) => None,
        };

        (app_name, url)
    }
}

impl ClipboardHandler for RefineryListener {
    fn on_clipboard_change(&mut self) {
        // 1. 检查是否是自身粘贴操作
        if self.is_pasting.load(Ordering::SeqCst) {
            return;
        }

        // 2. 初始化剪贴板上下文
        let ctx = match ClipboardContext::new() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[Refinery] Failed to acquire context: {}", e);
                return;
            }
        };

        // 3. 获取上下文信息 (窗口名, URL)
        let (source_app, url) = self.get_context_info();
        if source_app.is_none() && url.is_none() {
             // 这里的逻辑稍微调整：如果是自己App触发的，get_context_info返回了None，直接忽略
             // 但如果真的是未知窗口，我们还是应该记录。
             // 我们可以通过 PASTING_FLAG 已经过滤了大部分，这里做二次校验
        }

        let has_image = ctx.has(ContentFormat::Image);
        let has_text = ctx.has(ContentFormat::Text);

        // 4. 读取数据 (这里会有内存拷贝，但不会有编码/磁盘IO)
        let payload = if has_image && has_text {
            // Mixed
            let text = ctx.get_text().unwrap_or_default();
            if let Ok(rust_image) = ctx.get_image() {
                if let Ok(dyn_image) = rust_image.get_dynamic_image() {
                    Some(ClipboardPayload::Mixed { text, image: dyn_image, source_app, url })
                } else { None }
            } else { None }
        } else if has_image {
            // Image Only
            if let Ok(rust_image) = ctx.get_image() {
                if let Ok(dyn_image) = rust_image.get_dynamic_image() {
                    Some(ClipboardPayload::Image { image: dyn_image, source_app, url })
                } else { None }
            } else { None }
        } else if has_text {
            // Text Only
            if let Ok(text) = ctx.get_text() {
                if !text.trim().is_empty() {
                    Some(ClipboardPayload::Text { content: text, source_app, url })
                } else { None }
            } else { None }
        } else {
            None
        };

        // 5. 发送给消费者，非阻塞
        if let Some(p) = payload {
            // 如果通道满了，直接丢弃这次数据（防背压）
            // crossbeam-channel 的 bounded channel 会在满时返回错误
            let _ = self.tx.try_send(p);
        }
    }
}

// === 消费者：RefineryProcessor ===
// 负责哈希计算、图片编码、数据库写入

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
            }
        }
    }

    fn handle_text(&mut self, content: String, source_app: Option<String>, url: Option<String>) {
        let hash = hash_content_fast(content.as_bytes());

        if hash == self.last_text_hash { return; }
        self.last_text_hash = hash.clone();

        let size_info = format!("{} chars", content.chars().count());
        let preview = Some(content.chars().take(300).collect());

        // 这里的 Metadata 保持简单
        let metadata = RefineryMetadata { width: None, height: None, format: None, tokens: None, image_path: None };

        self.write_to_db(RefineryKind::Text, Some(content), hash, preview, source_app, url, Some(size_info), metadata);
    }

    fn handle_image(&mut self, image: DynamicImage, source_app: Option<String>, url: Option<String>) {
        // 限制尺寸，防止超级大图爆内存/磁盘
        if image.width() > 8000 || image.height() > 8000 { return; }

        // 此处调用优化后的 save_image_to_disk (使用 Fast PNG 压缩)
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
        // 与 handle_image 逻辑类似，但需要组合哈希
        if image.width() > 8000 || image.height() > 8000 {
            // 图片太大，降级为纯文本
            self.handle_text(text, source_app, url);
            return;
        }

        let save_result = save_image_to_disk(&self.app, &image);
        match save_result {
            Ok((file_path, img_hash)) => {
                let text_hash = hash_content_fast(text.as_bytes());
                // 组合哈希
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
        // 这一部分逻辑与原来保持一致，因为 SQLite 写入通常非常快 (ms 级别)
        // 且已经在独立的 Worker 线程中，不会阻塞 UI 或 剪贴板监听
        let state = self.app.state::<DbState>();
        // 注意：这里需要处理锁的竞争，但在 Consumer 线程中等待是可以接受的
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
    // 创建一个有界通道，容量为 5。
    // 如果处理不过来，我们宁愿丢弃中间的快速变化，也不要无限积压内存。
    let (tx, rx) = bounded::<ClipboardPayload>(5);

    // 1. 启动消费者线程 (Processor)
    let app_handle = app.clone();
    thread::spawn(move || {
        let mut processor = RefineryProcessor::new(app_handle, cleanup_sender);

        // 循环接收消息
        while let Ok(payload) = rx.recv() {
            // 防抖逻辑：
            // 如果通道里还有积压的消息，说明生产速度 > 消费速度
            // 我们只取最新的一个处理，丢弃中间过程（例如连续截图）
            // 在 channel 的 bounded(5) 机制下，结合 try_recv 可以实现简易防抖

            // 注意：对于 Image 这种重数据，如果已经读入内存了，丢弃也浪费了内存带宽。
            // 但为了保持同步，我们还是按序处理。
            // 如果想极致防抖，可以 sleep 一小会儿再 check channel len。

            // 简单处理：直接处理
            processor.process(payload);
        }
    });

    // 2. 启动生产者线程 (Listener)
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(1)); // 等待应用启动完全
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
