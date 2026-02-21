use std::collections::{HashSet, VecDeque};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Runtime};

use crate::models::{MinerConfig, MinerEvent};
use crate::error::Result;
use super::driver::MinerDriver;
use super::scope::{is_url_allowed, normalize_url};
use super::storage::save_markdown;

/// 执行完整的爬虫任务
pub async fn run_crawl_task<R: Runtime>(
    app: AppHandle<R>,
    config: MinerConfig,
    is_running: Arc<AtomicBool>,
) -> Result<()> {
    // --- 启动阶段 ---
    // 只有运行到这一行，Chrome 才会出现在进程列表里
    let driver = MinerDriver::new()?;

    // 2. 初始化 BFS 队列和已访问集合
    let mut queue: VecDeque<(String, u32)> = VecDeque::new();
    let mut visited: HashSet<String> = HashSet::new();

    // 放入种子 URL
    let seed_url = normalize_url(&config.url);
    queue.push_back((seed_url.clone(), 0));
    visited.insert(seed_url);

    let mut crawled_count = 0;

    // 3. 开始消费队列
    while let Some((current_url, current_depth)) = queue.pop_front() {
        // 检查用户是否在 UI 上点击了"停止"
        if !is_running.load(Ordering::SeqCst) {
            println!("[Miner] Stop signal detected, cleaning up...");
            break;
        }

        // 检查全局数量限制
        if crawled_count >= config.max_pages {
            break;
        }

        // 通知前端：开始处理
        let _ = app.emit("miner:progress", MinerEvent::Progress {
            current: crawled_count + 1,
            total_discovered: visited.len() as u32,
            current_url: current_url.clone(),
            status: "Fetching".to_string(),
        });

        // 4. 调用 Driver 提取页面
        match driver.process_url(&current_url) {
            Ok(page_result) => {
                // 5. 保存到本地
                if let Err(e) = save_markdown(&config.output_dir, &page_result) {
                    eprintln!("[Miner] Failed to save {}: {}", current_url, e);
                }

                crawled_count += 1;

                // 通知前端：保存成功
                let _ = app.emit("miner:progress", MinerEvent::Progress {
                    current: crawled_count,
                    total_discovered: visited.len() as u32,
                    current_url: current_url.clone(),
                    status: "Saved".to_string(),
                });

                // 6. 将新发现的、符合限制条件的链接加入队列
                if current_depth < config.max_depth {
                    for link in page_result.links {
                        let normalized_link = normalize_url(&link);

                        // 核心：使用我们在 scope.rs 里写的严格判断
                        if is_url_allowed(&normalized_link, &config.match_prefix) {
                            if !visited.contains(&normalized_link) {
                                visited.insert(normalized_link.clone());
                                queue.push_back((normalized_link, current_depth + 1));
                            }
                        }
                    }
                }
            },
            Err(e) => {
                let _ = app.emit("miner:error", MinerEvent::Error {
                    url: current_url.clone(),
                    message: e.to_string(),
                });
            }
        }
    }

    // --- 清理阶段 ---
    // 显式释放所有 CDP 相关的句柄
    drop(driver); // 显式释放驱动。此时 Browser 对象的 Drop 被触发，进程关闭。

    println!("[Miner] Browser process terminated. Resources freed.");

    // 7. 任务结束
    is_running.store(false, Ordering::SeqCst);
    let _ = app.emit("miner:finished", MinerEvent::Finished {
        total_pages: crawled_count,
        output_dir: config.output_dir,
    });

    Ok(())
}
