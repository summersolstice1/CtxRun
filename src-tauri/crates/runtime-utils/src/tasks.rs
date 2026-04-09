use std::future::Future;
use std::time::Duration;

use tokio::sync::watch;
use tokio::task::JoinHandle;
use tokio::time::{Instant, MissedTickBehavior, interval_at, sleep};

#[derive(Debug)]
pub struct BackgroundTaskHandle {
    cancel_tx: watch::Sender<bool>,
    join_handle: Option<JoinHandle<()>>,
}

impl BackgroundTaskHandle {
    pub fn cancel(&self) {
        let _ = self.cancel_tx.send(true);
    }

    pub fn is_finished(&self) -> bool {
        match &self.join_handle {
            Some(handle) => handle.is_finished(),
            None => true,
        }
    }

    pub async fn join(mut self) -> Result<(), tokio::task::JoinError> {
        if let Some(handle) = self.join_handle.take() {
            handle.await?;
        }
        Ok(())
    }

    pub async fn shutdown(mut self) -> Result<(), tokio::task::JoinError> {
        self.cancel();
        if let Some(handle) = self.join_handle.take() {
            handle.await?;
        }
        Ok(())
    }
}

impl Drop for BackgroundTaskHandle {
    fn drop(&mut self) {
        let _ = self.cancel_tx.send(true);
    }
}

#[derive(Debug, Clone, Copy)]
pub struct PeriodicTaskOptions {
    pub interval: Duration,
    pub run_immediately: bool,
    pub missed_tick_behavior: MissedTickBehavior,
}

impl PeriodicTaskOptions {
    pub fn new(interval: Duration) -> Self {
        Self {
            interval,
            run_immediately: false,
            missed_tick_behavior: MissedTickBehavior::Delay,
        }
    }

    pub fn with_run_immediately(mut self, run_immediately: bool) -> Self {
        self.run_immediately = run_immediately;
        self
    }

    pub fn with_missed_tick_behavior(mut self, behavior: MissedTickBehavior) -> Self {
        self.missed_tick_behavior = behavior;
        self
    }
}

pub fn spawn_delayed<F, Fut>(delay: Duration, task: F) -> BackgroundTaskHandle
where
    F: FnOnce() -> Fut + Send + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    let (cancel_tx, mut cancel_rx) = watch::channel(false);
    let join_handle = tokio::spawn(async move {
        tokio::select! {
            _ = cancel_rx.changed() => {}
            _ = sleep(delay) => {
                task().await;
            }
        }
    });

    BackgroundTaskHandle {
        cancel_tx,
        join_handle: Some(join_handle),
    }
}

pub fn spawn_periodic<F, Fut>(options: PeriodicTaskOptions, mut task: F) -> BackgroundTaskHandle
where
    F: FnMut() -> Fut + Send + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    let (cancel_tx, mut cancel_rx) = watch::channel(false);
    let interval = normalize_interval(options.interval);
    let start = if options.run_immediately {
        Instant::now()
    } else {
        Instant::now() + interval
    };

    let join_handle = tokio::spawn(async move {
        let mut ticker = interval_at(start, interval);
        ticker.set_missed_tick_behavior(options.missed_tick_behavior);

        loop {
            tokio::select! {
                _ = cancel_rx.changed() => break,
                _ = ticker.tick() => task().await,
            }
        }
    });

    BackgroundTaskHandle {
        cancel_tx,
        join_handle: Some(join_handle),
    }
}

fn normalize_interval(interval: Duration) -> Duration {
    if interval.is_zero() {
        Duration::from_millis(1)
    } else {
        interval
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

    #[tokio::test]
    async fn delayed_task_runs_after_delay() {
        let fired = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&fired);

        let handle = spawn_delayed(Duration::from_millis(10), move || async move {
            flag.store(true, Ordering::SeqCst);
        });

        handle.join().await.expect("delayed task should join");
        assert!(fired.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn periodic_task_runs_and_can_shutdown() {
        let ticks = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&ticks);

        let handle = spawn_periodic(
            PeriodicTaskOptions::new(Duration::from_millis(10)).with_run_immediately(true),
            move || {
                let counter = Arc::clone(&counter);
                async move {
                    counter.fetch_add(1, Ordering::SeqCst);
                }
            },
        );

        sleep(Duration::from_millis(35)).await;
        handle
            .shutdown()
            .await
            .expect("periodic task should shut down");

        assert!(ticks.load(Ordering::SeqCst) >= 2);
    }

    #[tokio::test]
    async fn cancelled_delayed_task_does_not_run() {
        let fired = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&fired);

        let handle = spawn_delayed(Duration::from_millis(25), move || async move {
            flag.store(true, Ordering::SeqCst);
        });

        handle
            .shutdown()
            .await
            .expect("cancelled task should shut down");
        assert!(!fired.load(Ordering::SeqCst));
    }
}
