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

/// 最大并发数限制
const MAX_CONCURRENCY: usize = 10;

pub async fn run_crawl_task<R: Runtime>(
    app: AppHandle<R>,
    config: MinerConfig,
    is_running: Arc<AtomicBool>,
) -> Result<()> {
    // 从配置获取并发数，限制在 1-10 之间
    let concurrency = config.concurrency.clamp(1, MAX_CONCURRENCY as u32) as usize;

    let visited = Arc::new(Mutex::new(HashSet::new()));
    let crawled_count = Arc::new(AtomicU32::new(0));
    let active_tasks = Arc::new(AtomicUsize::new(0));

    let (tx, rx) = unbounded::<(String, u32)>();

    let seed_url = normalize_url(&config.url);
    visited.lock().unwrap().insert(seed_url.clone());
    tx.send((seed_url, 0)).unwrap();

    let driver = Arc::new(MinerDriver::new()?);
    let mut worker_handles = vec![];

    for worker_id in 0..concurrency {
        let app_clone = app.clone();
        let config_clone = config.clone();
        let is_running_clone = is_running.clone();
        let visited_clone = visited.clone();
        let tx_clone = tx.clone();
        let rx_clone = rx.clone();
        let crawled_count_clone = crawled_count.clone();
        let active_tasks_clone = active_tasks.clone();
        let driver_clone = driver.clone();

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
                        let task_number = crawled_count_clone.fetch_add(1, Ordering::SeqCst) + 1;

                        active_tasks_clone.fetch_add(1, Ordering::SeqCst);

                        if task_number > config_clone.max_pages || !is_running_clone.load(Ordering::SeqCst) {
                            active_tasks_clone.fetch_sub(1, Ordering::SeqCst);
                            continue;
                        }

                        let discovered = visited_clone.lock().unwrap().len() as u32;

                        let _ = app_clone.emit("miner:progress", MinerEvent::Progress {
                            current: task_number,
                            total_discovered: discovered,
                            current_url: current_url.clone(),
                            status: "Fetching".to_string(),
                        });

                        match extract_page(&tab, &current_url) {
                            Ok(page_result) => {
                                if let Err(e) = save_markdown(&config_clone.output_dir, &page_result) {
                                    eprintln!("[Miner] Failed to save {}: {}", current_url, e);
                                }

                                let _ = app_clone.emit("miner:progress", MinerEvent::Progress {
                                    current: task_number,
                                    total_discovered: discovered,
                                    current_url: current_url.clone(),
                                    status: "Saved".to_string(),
                                });

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
                        let current_count = crawled_count_clone.load(Ordering::SeqCst);
                        let is_full = current_count >= config_clone.max_pages;
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
