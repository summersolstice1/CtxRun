use futures::future::join_all;
use std::collections::HashSet;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::{Mutex, mpsc};

use super::driver::MinerDriver;
use super::scope::{is_url_allowed, normalize_url};
use super::single_page::extract_single_page_with_page;
use crate::error::Result;
use crate::models::{MinerConfig, MinerEvent, SinglePageRequest};

/// 最大并发数限制
const MAX_CONCURRENCY: usize = 10;

pub type CrawlEventSink = Arc<dyn Fn(MinerEvent) + Send + Sync + 'static>;

fn emit_event(event_sink: &Option<CrawlEventSink>, event: MinerEvent) {
    if let Some(sink) = event_sink {
        sink(event);
    }
}

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
    let app_handle = app.clone();
    let event_sink: CrawlEventSink = Arc::new(move |event: MinerEvent| {
        let channel = match &event {
            MinerEvent::Progress { .. } => "miner:progress",
            MinerEvent::Finished { .. } => "miner:finished",
            MinerEvent::Error { .. } => "miner:error",
        };
        let _ = app_handle.emit(channel, event);
    });

    run_crawl_task_with_sink(config, is_running, Some(event_sink)).await
}

pub async fn run_crawl_task_with_sink(
    config: MinerConfig,
    is_running: Arc<AtomicBool>,
    event_sink: Option<CrawlEventSink>,
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

        let config_clone = config.clone();
        let is_running_clone = is_running.clone();
        let visited_clone = visited.clone();
        let tx_clone = tx.clone();
        let rx_clone = rx.clone();
        let crawled_count_clone = crawled_count.clone();
        let active_tasks_clone = active_tasks.clone();
        let queued_tasks_clone = queued_tasks.clone();
        let event_sink_clone = event_sink.clone();

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

                        emit_event(
                            &event_sink_clone,
                            MinerEvent::Progress {
                                current: task_number,
                                total_discovered: discovered,
                                current_url: current_url.clone(),
                                status: "Fetching".to_string(),
                            },
                        );

                        let page_request = SinglePageRequest {
                            url: current_url.clone(),
                            timeout_ms: None,
                            include_links: Some(true),
                            save_to_disk: Some(true),
                            output_dir: Some(config_clone.output_dir.clone()),
                        };

                        match extract_single_page_with_page(&page, &page_request).await {
                            Ok(page_result) => {
                                emit_event(
                                    &event_sink_clone,
                                    MinerEvent::Progress {
                                        current: task_number,
                                        total_discovered: discovered,
                                        current_url: current_url.clone(),
                                        status: "Saved".to_string(),
                                    },
                                );

                                if current_depth < config_clone.max_depth {
                                    let mut normalized_links = HashSet::new();
                                    for link in page_result.links {
                                        let norm_link = normalize_url(&link);
                                        if is_url_allowed(&norm_link, &config_clone.match_prefix) {
                                            normalized_links.insert(norm_link);
                                        }
                                    }

                                    // Keep queue growth bounded by remaining page budget.
                                    let remaining_slots = config_clone
                                        .max_pages
                                        .saturating_sub(crawled_count_clone.load(Ordering::SeqCst))
                                        .saturating_sub(
                                            queued_tasks_clone.load(Ordering::SeqCst) as u32
                                        )
                                        as usize;

                                    let mut pending_enqueue = Vec::new();
                                    if remaining_slots > 0 {
                                        pending_enqueue = Vec::with_capacity(
                                            normalized_links.len().min(remaining_slots),
                                        );
                                        let mut v_lock = visited_clone.lock().await;
                                        for norm_link in normalized_links {
                                            if pending_enqueue.len() >= remaining_slots {
                                                break;
                                            }
                                            if v_lock.insert(norm_link.clone()) {
                                                pending_enqueue.push(norm_link);
                                            }
                                        }
                                    }

                                    for norm_link in pending_enqueue {
                                        match tx_clone.send((norm_link.clone(), current_depth + 1))
                                        {
                                            Ok(_) => {
                                                queued_tasks_clone.fetch_add(1, Ordering::SeqCst);
                                            }
                                            Err(_) => {
                                                eprintln!(
                                                    "[Miner] Failed to enqueue discovered URL: {}",
                                                    norm_link
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                emit_event(
                                    &event_sink_clone,
                                    MinerEvent::Error {
                                        url: current_url.clone(),
                                        message: e.to_string(),
                                    },
                                );
                            }
                        }

                        active_tasks_clone.fetch_sub(1, Ordering::SeqCst);
                    }
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

    emit_event(
        &event_sink,
        MinerEvent::Finished {
            total_pages: final_count,
            output_dir: config.output_dir,
        },
    );

    Ok(())
}
