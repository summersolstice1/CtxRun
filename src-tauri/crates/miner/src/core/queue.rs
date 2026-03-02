use std::collections::HashSet;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::time::Duration;
use futures::future::join_all;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::{Mutex, mpsc};

use crate::models::{MinerConfig, MinerEvent};
use crate::error::Result;
use super::driver::MinerDriver;
use super::scope::{is_url_allowed, normalize_url};
use super::storage::save_markdown;
use super::extractor::extract_page;

/// 最大并发数限制
const MAX_CONCURRENCY: usize = 10;

fn decrement_counter(counter: &AtomicUsize) {
    let _ = counter.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |current| {
        Some(current.saturating_sub(1))
    });
}

fn try_reserve_task_slot(counter: &AtomicU32, max_pages: u32) -> Option<u32> {
    loop {
        let current = counter.load(Ordering::SeqCst);
        if current >= max_pages {
            return None;
        }

        let next = current + 1;
        if counter
            .compare_exchange(current, next, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            return Some(next);
        }
    }
}

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
    let queued_tasks = Arc::new(AtomicUsize::new(0));

    let (tx, rx) = mpsc::unbounded_channel::<(String, u32)>();
    let rx = Arc::new(Mutex::new(rx));

    let seed_url = normalize_url(&config.url);
    visited.lock().await.insert(seed_url.clone());
    tx.send((seed_url, 0))
        .map_err(|_| crate::error::MinerError::SystemError("Failed to enqueue seed URL".into()))?;
    queued_tasks.store(1, Ordering::SeqCst);

    let mut driver = MinerDriver::new().await?;
    let mut worker_futures = Vec::with_capacity(concurrency);

    for worker_id in 0..concurrency {
        let page = match driver.new_page().await {
            Ok(p) => p,
            Err(e) => {
                eprintln!("[Miner] Worker {} failed to create page: {}", worker_id, e);
                continue;
            }
        };

        let app_clone = app.clone();
        let config_clone = config.clone();
        let is_running_clone = is_running.clone();
        let visited_clone = visited.clone();
        let tx_clone = tx.clone();
        let rx_clone = rx.clone();
        let crawled_count_clone = crawled_count.clone();
        let active_tasks_clone = active_tasks.clone();
        let queued_tasks_clone = queued_tasks.clone();

        worker_futures.push(async move {
            loop {
                let receive_result = {
                    let mut receiver = rx_clone.lock().await;
                    tokio::time::timeout(Duration::from_millis(500), receiver.recv()).await
                };

                match receive_result {
                    Ok(Some((current_url, current_depth))) => {
                        decrement_counter(queued_tasks_clone.as_ref());
                        active_tasks_clone.fetch_add(1, Ordering::SeqCst);

                        if !is_running_clone.load(Ordering::SeqCst) {
                            active_tasks_clone.fetch_sub(1, Ordering::SeqCst);
                            continue;
                        }

                        let task_number = match try_reserve_task_slot(
                            crawled_count_clone.as_ref(),
                            config_clone.max_pages,
                        ) {
                            Some(n) => n,
                            None => {
                                active_tasks_clone.fetch_sub(1, Ordering::SeqCst);
                                continue;
                            }
                        };

                        let discovered = visited_clone.lock().await.len() as u32;

                        let _ = app_clone.emit("miner:progress", MinerEvent::Progress {
                            current: task_number,
                            total_discovered: discovered,
                            current_url: current_url.clone(),
                            status: "Fetching".to_string(),
                        });

                        match extract_page(&page, &current_url).await {
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
                                    let mut normalized_links = HashSet::new();
                                    for link in page_result.links {
                                        let norm_link = normalize_url(&link);
                                        if is_url_allowed(&norm_link, &config_clone.match_prefix) {
                                            normalized_links.insert(norm_link);
                                        }
                                    }

                                    let mut pending_enqueue = Vec::new();
                                    {
                                        let mut v_lock = visited_clone.lock().await;
                                        for norm_link in normalized_links {
                                            if v_lock.insert(norm_link.clone()) {
                                                pending_enqueue.push(norm_link);
                                            }
                                        }
                                    }

                                    for norm_link in pending_enqueue {
                                        match tx_clone.send((norm_link.clone(), current_depth + 1)) {
                                            Ok(_) => {
                                                queued_tasks_clone.fetch_add(1, Ordering::SeqCst);
                                            }
                                            Err(_) => {
                                                eprintln!("[Miner] Failed to enqueue discovered URL: {}", norm_link);
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
                    Ok(None) => break,
                    Err(_) => {
                        let is_stop = !is_running_clone.load(Ordering::SeqCst);
                        let current_count = crawled_count_clone.load(Ordering::SeqCst);
                        let is_full = current_count >= config_clone.max_pages;
                        let is_idle = active_tasks_clone.load(Ordering::SeqCst) == 0;
                        let queue_empty = queued_tasks_clone.load(Ordering::SeqCst) == 0;

                        if is_stop || is_full || (is_idle && queue_empty) {
                            break;
                        }
                    }
                }
            }

            let _ = page.close().await;
        });
    }

    drop(tx);
    join_all(worker_futures).await;
    driver.shutdown().await;

    let final_count = crawled_count.load(Ordering::SeqCst);
    is_running.store(false, Ordering::SeqCst);

    let _ = app.emit("miner:finished", MinerEvent::Finished {
        total_pages: final_count,
        output_dir: config.output_dir,
    });

    Ok(())
}
