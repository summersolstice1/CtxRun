use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::thread;
use std::time::Duration;
use crossbeam_channel::unbounded;
use tauri::{AppHandle, Emitter, Runtime};

use crate::models::{MinerConfig, MinerEvent};
use crate::error::Result;
use super::driver::MinerDriver;
use super::scope::{is_url_allowed, normalize_url};
use super::storage::save_markdown;
use super::extractor::extract_page;

/// 最佳并发数：5-8 个并发是 CPU/内存利用率的最甜点
const CONCURRENCY: usize = 5;

pub async fn run_crawl_task<R: Runtime>(
    app: AppHandle<R>,
    config: MinerConfig,
    is_running: Arc<AtomicBool>,
) -> Result<()> {
    // 1. 初始化共享状态
    let visited = Arc::new(Mutex::new(HashSet::new()));
    let crawled_count = Arc::new(AtomicU32::new(0));
    let active_tasks = Arc::new(AtomicUsize::new(0));

    // 任务通道：(目标URL, 当前深度)
    let (tx, rx) = unbounded::<(String, u32)>();

    // 压入种子 URL
    let seed_url = normalize_url(&config.url);
    visited.lock().unwrap().insert(seed_url.clone());
    tx.send((seed_url, 0)).unwrap();

    // 2. 初始化单例浏览器驱动
    let driver = Arc::new(MinerDriver::new()?);
    let mut worker_handles = vec![];

    // 3. 启动 Worker 线程池
    for worker_id in 0..CONCURRENCY {
        let app_clone = app.clone();
        let config_clone = config.clone();
        let is_running_clone = is_running.clone();
        let visited_clone = visited.clone();
        let tx_clone = tx.clone();
        let rx_clone = rx.clone();
        let crawled_count_clone = crawled_count.clone();
        let active_tasks_clone = active_tasks.clone();
        let driver_clone = driver.clone();

        // 每个 Worker 独占一个 Tab
        let tab = match driver_clone.new_tab() {
            Ok(t) => t,
            Err(e) => {
                eprintln!("[Miner] Worker {} failed to create tab: {}", worker_id, e);
                continue;
            }
        };

        let handle = thread::spawn(move || {
            loop {
                match rx_clone.recv_timeout(Duration::from_millis(500)) {
                    Ok((current_url, current_depth)) => {
                        active_tasks_clone.fetch_add(1, Ordering::SeqCst);

                        if !is_running_clone.load(Ordering::SeqCst) ||
                           crawled_count_clone.load(Ordering::SeqCst) >= config_clone.max_pages {
                            active_tasks_clone.fetch_sub(1, Ordering::SeqCst);
                            continue;
                        }

                        let current_idx = crawled_count_clone.load(Ordering::SeqCst) + 1;
                        let discovered = visited_clone.lock().unwrap().len() as u32;

                        let _ = app_clone.emit("miner:progress", MinerEvent::Progress {
                            current: current_idx,
                            total_discovered: discovered,
                            current_url: current_url.clone(),
                            status: "Fetching".to_string(),
                        });

                        match extract_page(&tab, &current_url) {
                            Ok(page_result) => {
                                if let Err(e) = save_markdown(&config_clone.output_dir, &page_result) {
                                    eprintln!("[Miner] Failed to save {}: {}", current_url, e);
                                }

                                let new_count = crawled_count_clone.fetch_add(1, Ordering::SeqCst) + 1;

                                let _ = app_clone.emit("miner:progress", MinerEvent::Progress {
                                    current: new_count,
                                    total_discovered: discovered,
                                    current_url: current_url.clone(),
                                    status: "Saved".to_string(),
                                });

                                // 解析新链接并推入队列
                                if current_depth < config_clone.max_depth {
                                    let mut v_lock = visited_clone.lock().unwrap();
                                    for link in page_result.links {
                                        let norm_link = normalize_url(&link);
                                        if is_url_allowed(&norm_link, &config_clone.match_prefix) {
                                            if !v_lock.contains(&norm_link) {
                                                v_lock.insert(norm_link.clone());
                                                let _ = tx_clone.send((norm_link, current_depth + 1));
                                            }
                                        }
                                    }
                                }
                            },
                            Err(e) => {
                                let _ = app_clone.emit("miner:error", MinerEvent::Error {
                                    url: current_url.clone(),
                                    message: e.to_string(),
                                });
                            }
                        }

                        active_tasks_clone.fetch_sub(1, Ordering::SeqCst);
                    },
                    Err(_) => {
                        let is_stop = !is_running_clone.load(Ordering::SeqCst);
                        let is_full = crawled_count_clone.load(Ordering::SeqCst) >= config_clone.max_pages;
                        let is_idle = active_tasks_clone.load(Ordering::SeqCst) == 0;

                        if is_stop || is_full || is_idle {
                            break;
                        }
                    }
                }
            }
        });
        worker_handles.push(handle);
    }

    // 4. 在异步运行时中等待所有物理线程结束
    tauri::async_runtime::spawn_blocking(move || {
        for h in worker_handles {
            let _ = h.join();
        }

        let final_count = crawled_count.load(Ordering::SeqCst);
        is_running.store(false, Ordering::SeqCst);

        let _ = app.emit("miner:finished", MinerEvent::Finished {
            total_pages: final_count,
            output_dir: config.output_dir,
        });
    }).await.unwrap();

    Ok(())
}
