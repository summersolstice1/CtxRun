use clipboard_rs::common::RustImage;
use clipboard_rs::{
    Clipboard, ClipboardContext, ClipboardHandler, ClipboardWatcher, ClipboardWatcherContext,
    ContentFormat,
};
use crossbeam_channel::{Sender, bounded};
use image::DynamicImage;
use std::sync::Arc;
use std::sync::LazyLock;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::sync::mpsc;
use x_win::{get_active_window, get_browser_url};

use super::models::{ClipboardCapture, RefineryKind, RefineryMetadata};
use super::storage::{capture_clipboard_item, hash_content, save_image_to_disk};
use ctxrun_db::DbState;

pub static PASTING_FLAG: LazyLock<Arc<AtomicBool>> =
    LazyLock::new(|| Arc::new(AtomicBool::new(false)));

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
    },
}

struct RefineryListener {
    tx: Sender<ClipboardPayload>,
    is_pasting: Arc<AtomicBool>,
}

impl RefineryListener {
    fn is_self_app(&self, active_app: &str) -> bool {
        let current = active_app.to_lowercase();
        let self_exe = std::env::current_exe()
            .ok()
            .and_then(|p| p.file_stem().map(|s| s.to_string_lossy().to_lowercase()))
            .unwrap_or_else(|| "ctxrun".to_string());

        current == self_exe || current == format!("{}.exe", self_exe) || current.contains("ctxrun")
    }
}

impl ClipboardHandler for RefineryListener {
    fn on_clipboard_change(&mut self) {
        if self.is_pasting.load(Ordering::SeqCst) {
            return;
        }

        let active_window = get_active_window().ok();
        let app_name = active_window.as_ref().map(|w| w.info.exec_name.clone());

        if let Some(ref name) = app_name
            && self.is_self_app(name)
        {
            return;
        }

        let url = active_window.as_ref().and_then(|w| get_browser_url(w).ok());

        let ctx = match ClipboardContext::new() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[Refinery] Failed to acquire context: {}", e);
                return;
            }
        };

        if ctx.has(ContentFormat::Files)
            && let Ok(paths) = ctx.get_files()
            && !paths.is_empty()
        {
            let _ = self.tx.try_send(ClipboardPayload::Files {
                paths,
                source_app: app_name,
            });
            return;
        }

        let has_image = ctx.has(ContentFormat::Image);
        let has_text = ctx.has(ContentFormat::Text);

        let payload = if has_image && has_text {
            let text = ctx.get_text().unwrap_or_default();
            if let Ok(rust_image) = ctx.get_image() {
                if let Ok(dyn_image) = rust_image.get_dynamic_image() {
                    Some(ClipboardPayload::Mixed {
                        text,
                        image: dyn_image,
                        source_app: app_name,
                        url,
                    })
                } else {
                    None
                }
            } else {
                None
            }
        } else if has_image {
            if let Ok(rust_image) = ctx.get_image() {
                if let Ok(dyn_image) = rust_image.get_dynamic_image() {
                    Some(ClipboardPayload::Image {
                        image: dyn_image,
                        source_app: app_name,
                        url,
                    })
                } else {
                    None
                }
            } else {
                None
            }
        } else if has_text {
            if let Ok(text) = ctx.get_text() {
                if !text.trim().is_empty() {
                    Some(ClipboardPayload::Text {
                        content: text,
                        source_app: app_name,
                        url,
                    })
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        if let Some(p) = payload {
            let _ = self.tx.try_send(p);
        }
    }
}

// === 消费者：RefineryProcessor ===

struct RefineryProcessor<R: Runtime> {
    app: AppHandle<R>,
    last_text_hash: String,
    last_image_hash: String,
    cleanup_sender: Option<mpsc::Sender<()>>,
}

impl<R: Runtime> RefineryProcessor<R> {
    fn new(app: AppHandle<R>, cleanup_sender: Option<mpsc::Sender<()>>) -> Self {
        Self {
            app,
            last_text_hash: String::new(),
            last_image_hash: String::new(),
            cleanup_sender,
        }
    }

    fn process(&mut self, payload: ClipboardPayload) {
        match payload {
            ClipboardPayload::Text {
                content,
                source_app,
                url,
            } => {
                self.handle_text(content, source_app, url);
            }
            ClipboardPayload::Image {
                image,
                source_app,
                url,
            } => {
                self.handle_image(image, source_app, url);
            }
            ClipboardPayload::Mixed {
                text,
                image,
                source_app,
                url,
            } => {
                self.handle_mixed(text, image, source_app, url);
            }
            ClipboardPayload::Files { paths, source_app } => {
                self.handle_files(paths, source_app);
            }
        }
    }

    fn handle_text(&mut self, content: String, source_app: Option<String>, url: Option<String>) {
        let hash = hash_content(content.as_bytes());

        if hash == self.last_text_hash {
            return;
        }
        self.last_text_hash = hash.clone();

        let char_count = content.chars().count();
        let size_info = format!("{} chars", char_count);
        let preview: String = content.chars().take(300).collect();

        let metadata = RefineryMetadata {
            width: None,
            height: None,
            format: Some("text".into()),
            tokens: Some(char_count / 4),
            image_path: None,
        };

        self.write_to_db(ClipboardCapture {
            kind: RefineryKind::Text,
            content: Some(content),
            hash,
            preview: Some(preview),
            source_app,
            url,
            size_info: Some(size_info),
            metadata,
        });
    }

    fn handle_files(&mut self, paths: Vec<String>, source_app: Option<String>) {
        let content = paths.join("\n");
        let hash = hash_content(content.as_bytes());

        if hash == self.last_text_hash {
            return;
        }
        self.last_text_hash = hash.clone();

        let file_count = paths.len();
        let size_info = format!("{} files", file_count);

        let preview = paths
            .iter()
            .take(5)
            .map(|p| {
                std::path::Path::new(p)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
            })
            .collect::<Vec<_>>()
            .join("\n")
            + if file_count > 5 { "\n..." } else { "" };

        let metadata = RefineryMetadata {
            width: None,
            height: None,
            format: Some("file-list".into()),
            tokens: None,
            image_path: None,
        };

        self.write_to_db(ClipboardCapture {
            kind: RefineryKind::Text,
            content: Some(content),
            hash,
            preview: Some(preview),
            source_app,
            url: None,
            size_info: Some(size_info),
            metadata,
        });
    }

    fn handle_image(
        &mut self,
        image: DynamicImage,
        source_app: Option<String>,
        url: Option<String>,
    ) {
        if image.width() > 8000 || image.height() > 8000 {
            return;
        }

        let save_result = save_image_to_disk(&self.app, &image);

        match save_result {
            Ok((file_path, hash)) => {
                if hash == self.last_image_hash {
                    return;
                }
                self.last_image_hash = hash.clone();

                let size_info = format!("{}x{}", image.width(), image.height());
                let metadata = RefineryMetadata {
                    width: Some(image.width()),
                    height: Some(image.height()),
                    format: Some("png".to_string()),
                    tokens: None,
                    image_path: None,
                };

                self.write_to_db(ClipboardCapture {
                    kind: RefineryKind::Image,
                    content: Some(file_path),
                    hash,
                    preview: Some("[Image]".into()),
                    source_app,
                    url,
                    size_info: Some(size_info),
                    metadata,
                });
            }
            Err(e) => eprintln!("[Refinery] Image save failed: {}", e),
        }
    }

    fn handle_mixed(
        &mut self,
        text: String,
        image: DynamicImage,
        source_app: Option<String>,
        url: Option<String>,
    ) {
        if image.width() > 8000 || image.height() > 8000 {
            self.handle_text(text, source_app, url);
            return;
        }

        let save_result = save_image_to_disk(&self.app, &image);
        match save_result {
            Ok((file_path, img_hash)) => {
                let text_hash = hash_content(text.as_bytes());
                let combined_hash = hash_content(format!("{}{}", text_hash, img_hash).as_bytes());

                if combined_hash == self.last_text_hash {
                    return;
                }
                self.last_text_hash = combined_hash.clone();

                let char_count = text.chars().count();
                let size_info = format!(
                    "{} chars + {}x{}",
                    char_count,
                    image.width(),
                    image.height()
                );
                let preview = Some(text.chars().take(300).collect());

                let metadata = RefineryMetadata {
                    width: Some(image.width()),
                    height: Some(image.height()),
                    format: Some("png".to_string()),
                    tokens: None,
                    image_path: Some(file_path),
                };

                self.write_to_db(ClipboardCapture {
                    kind: RefineryKind::Mixed,
                    content: Some(text),
                    hash: combined_hash,
                    preview,
                    source_app,
                    url,
                    size_info: Some(size_info),
                    metadata,
                });
            }
            Err(_) => self.handle_text(text, source_app, url),
        }
    }

    fn write_to_db(&self, item: ClipboardCapture) {
        let state = self.app.state::<DbState>();
        if let Ok(conn) = state.conn.lock()
            && let Ok((is_new, id)) = capture_clipboard_item(&conn, item)
        {
            let event_name = if is_new {
                "refinery:create"
            } else {
                "refinery:update"
            };
            let _ = self.app.emit(event_name, &id);

            if let Some(ref sender) = self.cleanup_sender {
                let _ = sender.blocking_send(());
            }
        }
    }
}

pub fn init_listener<R: Runtime>(app: AppHandle<R>, cleanup_sender: Option<mpsc::Sender<()>>) {
    let (tx, rx) = bounded::<ClipboardPayload>(5);

    let app_handle = app.clone();
    thread::spawn(move || {
        let mut processor = RefineryProcessor::new(app_handle, cleanup_sender);

        while let Ok(payload) = rx.recv() {
            processor.process(payload);
        }
    });

    thread::spawn(move || {
        thread::sleep(Duration::from_secs(1));

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
