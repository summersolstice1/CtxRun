use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use clipboard_rs::{
    Clipboard, ClipboardContext, ClipboardHandler,
    ClipboardWatcher, ClipboardWatcherContext, ContentFormat,
};
use clipboard_rs::common::RustImage;
use active_win_pos_rs::get_active_window;

use crate::db::DbState;
use super::model::{RefineryKind, RefineryMetadata};
use super::storage::{hash_content, save_image_to_disk, upsert_record};

struct RefineryHandler {
    app: AppHandle,
    last_hash: String, // 内存中简单的防抖/防循环机制
}

impl RefineryHandler {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            last_hash: String::new()
        }
    }

    // [新增] 获取当前活动应用名称的辅助函数
    fn get_current_app_name(&self) -> Option<String> {
        match get_active_window() {
            Ok(window) => Some(window.app_name),
            Err(_) => None,
        }
    }

    fn process_clipboard(&mut self) -> Result<(), String> {
        // 1. 在读取剪贴板内容之前，先捕获当前活动窗口
        // (因为读取剪贴板可能耗时，或者后续逻辑会延迟)
        let source_app = self.get_current_app_name();

        // 每次变化时，创建一个新的读取上下文
        // 注意：在某些平台(Linux X11)读取操作可能会超时，这里需要健壮处理
        let ctx = ClipboardContext::new().map_err(|e| e.to_string())?;

        // 优先级策略：图片 > 文本
        // 因为很多时候复制文本也会伴随 HTML/RTF，但复制图片通常意图明确

        if ctx.has(ContentFormat::Image) {
            return self.handle_image(&ctx, source_app);
        }

        if ctx.has(ContentFormat::Text) {
            return self.handle_text(&ctx, source_app);
        }

        Ok(())
    }

    // 更新函数签名，接收 source_app
    fn handle_image(&mut self, ctx: &ClipboardContext, source_app: Option<String>) -> Result<(), String> {
        let rust_image = ctx.get_image().map_err(|e| e.to_string())?;

        // 转换为 image crate 的 DynamicImage
        // clipboard-rs 的 RustImageData 提供了 get_dynamic_image() 方法
        let dyn_image = rust_image.get_dynamic_image().map_err(|e| format!("Failed to convert image: {}", e))?;

        // 1. 保存图片并获取哈希
        let (file_path, hash) = save_image_to_disk(&self.app, &dyn_image)?;

        // 防抖：如果哈希和上次一样，跳过
        if hash == self.last_hash {
            return Ok(());
        }
        self.last_hash = hash.clone();

        // 2. 准备元数据
        let width = dyn_image.width();
        let height = dyn_image.height();
        let size_info = format!("{}x{}", width, height);

        // 生成极小的缩略图 Base64 作为 preview (可选，这里暂时存 Path 或者空)
        // 考虑到性能，preview 字段存 "[Image]" 字符串或者前端直接加载本地文件
        let preview = Some("[Image]".to_string());

        let metadata = RefineryMetadata {
            width: Some(width),
            height: Some(height),
            format: Some("png".to_string()),
            tokens: None,
        };

        // 3. 写入数据库，传入 source_app
        self.write_to_db(RefineryKind::Image, Some(file_path), hash, preview, source_app, Some(size_info), metadata)
    }

    // 更新函数签名，接收 source_app
    fn handle_text(&mut self, ctx: &ClipboardContext, source_app: Option<String>) -> Result<(), String> {
        let content = ctx.get_text().map_err(|e| e.to_string())?;
        let trimmed = content.trim();

        if trimmed.is_empty() {
            return Ok(());
        }

        // 1. 计算哈希
        let hash = hash_content(content.as_bytes());

        // 防抖
        if hash == self.last_hash {
            return Ok(());
        }
        self.last_hash = hash.clone();

        // 2. 准备元数据
        let char_count = content.chars().count();
        let size_info = format!("{} chars", char_count);

        // 预览取前 150 个字符
        let preview_text: String = content.chars()
            .take(150)
            .collect();
        let preview = Some(preview_text);

        let metadata = RefineryMetadata {
            width: None,
            height: None,
            format: None,
            tokens: None, // 后续可用 tiktoken 计算
        };

        // 3. 写入数据库，传入 source_app
        self.write_to_db(RefineryKind::Text, Some(content), hash, preview, source_app, Some(size_info), metadata)
    }

    // 更新参数列表，增加 source_app
    fn write_to_db(
        &self,
        kind: RefineryKind,
        content: Option<String>,
        hash: String,
        preview: Option<String>,
        source_app: Option<String>, // [新增]
        size_info: Option<String>,
        metadata: RefineryMetadata
    ) -> Result<(), String> {
        let state = self.app.state::<DbState>();
        let conn = state.conn.lock().map_err(|e| e.to_string())?;

        let (is_new, id) = upsert_record(
            &conn, kind, content, hash, preview, source_app, size_info, metadata
        )?;

        // 4. 通知前端
        // 如果是新记录：refinery://new-entry
        // 如果是更新：refinery://update
        let event_name = if is_new { "refinery://new-entry" } else { "refinery://update" };

        // 关键修复：通知前端刷新
        // 如果 emit 失败（例如没有窗口监听），不会导致 panic，只会忽略
        let _ = self.app.emit(event_name, &id);

        println!("[Refinery] Saved: {} (New: {})", id, is_new);

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
pub fn init_listener(app: AppHandle) {
    // 放入独立线程，避免阻塞 Tauri 主循环
    thread::spawn(move || {
        // 适当延迟，等待系统准备好
        thread::sleep(Duration::from_secs(1));

        println!("[Refinery] Starting Clipboard Watcher...");

        let manager = ClipboardWatcherContext::new();
        match manager {
            Ok(mut watcher) => {
                let handler = RefineryHandler::new(app);

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
