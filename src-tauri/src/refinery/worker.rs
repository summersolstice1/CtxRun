use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use clipboard_rs::{
    Clipboard, ClipboardContext, ClipboardHandler,
    ClipboardWatcher, ClipboardWatcherContext, ContentFormat,
};
use clipboard_rs::common::RustImage;
use x_win::{get_active_window, get_browser_url};
use tokio::sync::mpsc;

use crate::db::DbState;
use super::model::{RefineryKind, RefineryMetadata};
use super::storage::{hash_content, save_image_to_disk, capture_clipboard_item};

struct RefineryHandler {
    app: AppHandle,
    last_text_hash: String, // 文本内容防抖
    last_image_hash: String, // 图片内容防抖
    cleanup_sender: Option<mpsc::Sender<()>>, // 通知 cleanup worker
}

impl RefineryHandler {
    pub fn new(app: AppHandle, cleanup_sender: Option<mpsc::Sender<()>>) -> Self {
        Self {
            app,
            last_text_hash: String::new(),
            last_image_hash: String::new(),
            cleanup_sender,
        }
    }

    // [新增] 获取当前活动应用名称的辅助函数
    fn get_current_app_name(&self) -> Option<String> {
        match get_active_window() {
            Ok(window) => Some(window.info.exec_name),
            Err(_) => None,
        }
    }

    // [新增] 获取当前浏览器的 URL
    fn get_browser_url(&self) -> Option<String> {
        match get_active_window() {
            Ok(window) => {
                // 尝试获取浏览器 URL，只在浏览器中有效
                match get_browser_url(&window) {
                    Ok(url) => Some(url),
                    Err(_) => None,
                }
            },
            Err(_) => None,
        }
    }

    // 检测是否是自己的应用
    fn is_self_app(&self, active_app: &str) -> bool {
        let current = active_app.to_lowercase();
        // 动态获取当前运行的 exe 名称
        let self_exe = std::env::current_exe()
            .ok()
            .and_then(|p| p.file_stem().map(|s| s.to_string_lossy().to_lowercase()))
            .unwrap_or_else(|| "ctxrun".to_string());

        // 适配多种可能性：ctxrun, ctxrun.exe, CtxRun, CtxRun.exe
        current == self_exe ||
        current == format!("{}.exe", self_exe) ||
        current.contains("ctxrun")
    }

    fn process_clipboard(&mut self) -> Result<(), String> {
        // 1. 先捕获当前活动窗口（必须在读取剪贴板之前）
        let source_app = self.get_current_app_name();

        // 2. 自我复制检测：如果来源是自己应用，直接跳过
        if source_app.as_deref().map_or(false, |app| self.is_self_app(app)) {
            println!("[Refinery] Skipping self-copy");
            return Ok(());
        }

        // 3. 尝试获取浏览器 URL (仅在浏览器中有效)
        let url = self.get_browser_url();

        // 每次变化时，创建一个新的读取上下文
        let ctx = ClipboardContext::new().map_err(|e| e.to_string())?;

        // 检测内容类型
        let has_image = ctx.has(ContentFormat::Image);
        let has_text = ctx.has(ContentFormat::Text);

        // 分支处理逻辑
        if has_image && has_text {
            // === 图文混合 (Mixed) ===
            self.handle_mixed(&ctx, source_app, url)
        } else if has_image {
            // === 纯图片 ===
            self.handle_image_only(&ctx, source_app, url)
        } else if has_text {
            // === 纯文本 ===
            self.handle_text_only(&ctx, source_app, url)
        } else {
            Ok(())
        }
    }

    // 处理图文混合内容
    fn handle_mixed(&mut self, ctx: &ClipboardContext, source_app: Option<String>, url: Option<String>) -> Result<(), String> {
        // 1. 获取文本
        let text = ctx.get_text().map_err(|e| e.to_string())?;
        let trimmed_text = text.trim();
        if trimmed_text.is_empty() {
            // 如果文本为空，降级为纯图片处理
            return self.handle_image_only(ctx, source_app, url);
        }

        // 2. 处理图片
        let rust_image = ctx.get_image().map_err(|e| e.to_string())?;
        let dyn_image = rust_image.get_dynamic_image().map_err(|e| e.to_string())?;

        // 尺寸检查防崩
        if dyn_image.width() > 5000 || dyn_image.height() > 5000 {
            // 图片太大，降级为纯文本处理
            return self.handle_text_only(ctx, source_app, url);
        }

        // 保存图片到磁盘
        let (file_path, img_hash) = save_image_to_disk(&self.app, &dyn_image)?;

        // 3. 生成混合哈希 (文本哈希 + 图片哈希)
        let text_hash = hash_content(text.as_bytes());
        let combined_hash = hash_content(format!("{}{}", text_hash, img_hash).as_bytes());

        // 防抖
        if combined_hash == self.last_text_hash {
            return Ok(());
        }
        self.last_text_hash = combined_hash.clone();

        // 4. 准备数据
        let char_count = text.chars().count();
        let size_info = format!("{} chars + {}x{}", char_count, dyn_image.width(), dyn_image.height());
        let preview = Some(text.chars().take(300).collect::<String>());

        let metadata = RefineryMetadata {
            width: Some(dyn_image.width()),
            height: Some(dyn_image.height()),
            format: Some("png".to_string()),
            tokens: None,
            image_path: Some(file_path.clone()), // 图片路径存在这里
        };

        // 5. 写入数据库 (Type = Mixed, Content = Text)
        self.write_to_db(RefineryKind::Mixed, Some(text), combined_hash, preview, source_app, url, Some(size_info), metadata)
    }

    // 纯图片处理
    fn handle_image_only(&mut self, ctx: &ClipboardContext, source_app: Option<String>, url: Option<String>) -> Result<(), String> {
        let rust_image = ctx.get_image().map_err(|e| e.to_string())?;
        let dyn_image = rust_image.get_dynamic_image().map_err(|e| format!("Failed to convert image: {}", e))?;

        // 尺寸检查
        if dyn_image.width() > 5000 || dyn_image.height() > 5000 {
            return Ok(());
        }

        let (file_path, hash) = save_image_to_disk(&self.app, &dyn_image)?;

        if hash == self.last_image_hash {
            return Ok(());
        }
        self.last_image_hash = hash.clone();

        let size_info = format!("{}x{}", dyn_image.width(), dyn_image.height());

        let metadata = RefineryMetadata {
            width: Some(dyn_image.width()),
            height: Some(dyn_image.height()),
            format: Some("png".to_string()),
            tokens: None,
            image_path: None,
        };

        self.write_to_db(RefineryKind::Image, Some(file_path), hash, Some("[Image]".into()), source_app, url, Some(size_info), metadata)
    }

    // 纯文本处理
    fn handle_text_only(&mut self, ctx: &ClipboardContext, source_app: Option<String>, url: Option<String>) -> Result<(), String> {
        let content = ctx.get_text().map_err(|e| e.to_string())?;
        if content.trim().is_empty() {
            return Ok(());
        }

        let hash = hash_content(content.as_bytes());
        if hash == self.last_text_hash {
            return Ok(());
        }
        self.last_text_hash = hash.clone();

        let size_info = format!("{} chars", content.chars().count());
        let preview = Some(content.chars().take(300).collect());

        let metadata = RefineryMetadata {
            width: None,
            height: None,
            format: None,
            tokens: None,
            image_path: None,
        };

        self.write_to_db(RefineryKind::Text, Some(content), hash, preview, source_app, url, Some(size_info), metadata)
    }

    // 更新参数列表，增加 source_app 和 url
    fn write_to_db(
        &self,
        kind: RefineryKind,
        content: Option<String>,
        hash: String,
        preview: Option<String>,
        source_app: Option<String>,
        url: Option<String>, // [新增]
        size_info: Option<String>,
        metadata: RefineryMetadata
    ) -> Result<(), String> {
        let state = self.app.state::<DbState>();
        let conn = state.conn.lock().map_err(|e| e.to_string())?;

        // 使用新的 capture_clipboard_item 函数
        let (is_new, id) = capture_clipboard_item(
            &conn, kind, content, hash, preview, source_app, url, size_info, metadata
        )?;

        // 通知前端
        // 如果是新记录：refinery://new-entry
        // 如果是更新：refinery://update
        let event_name = if is_new { "refinery://new-entry" } else { "refinery://update" };

        // 关键修复：通知前端刷新
        // 如果 emit 失败（例如没有窗口监听），不会导致 panic，只会忽略
        let _ = self.app.emit(event_name, &id);

        println!("[Refinery] Capture Saved: {} (New: {})", id, is_new);

        // 通知 cleanup worker 检查是否需要清理
        if is_new {
            if let Some(ref sender) = self.cleanup_sender {
                let _ = sender.blocking_send(());
            }
        }

        Ok(())
    }
}

impl ClipboardHandler for RefineryHandler {
    fn on_clipboard_change(&mut self) {
        if let Err(e) = self.process_clipboard() {
            eprintln!("[Refinery] Error processing clipboard: {}", e);
        }
    }
}

/// 启动监听器 (在 main.rs 中调用)
pub fn init_listener(app: AppHandle, cleanup_sender: Option<mpsc::Sender<()>>) {
    // 放入独立线程，避免阻塞 Tauri 主循环
    thread::spawn(move || {
        // 适当延迟，等待系统准备好
        thread::sleep(Duration::from_secs(1));

        println!("[Refinery] Starting Clipboard Watcher...");

        let manager = ClipboardWatcherContext::new();
        match manager {
            Ok(mut watcher) => {
                let handler = RefineryHandler::new(app, cleanup_sender);

                // 添加处理器并开始阻塞监听
                watcher.add_handler(handler);
                watcher.start_watch();
            }
            Err(e) => {
                eprintln!("[Refinery] Failed to initialize ClipboardWatcher: {}", e);
            }
        }
    });
}
