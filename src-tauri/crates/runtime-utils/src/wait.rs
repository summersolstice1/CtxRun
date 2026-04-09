use std::fmt;
use std::future::Future;
use std::time::Duration;

use tokio::time::{Instant, sleep};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PollOptions {
    pub timeout: Duration,
    pub interval: Duration,
    pub run_immediately: bool,
}

impl PollOptions {
    pub fn new(timeout: Duration, interval: Duration) -> Self {
        Self {
            timeout,
            interval,
            run_immediately: true,
        }
    }

    pub fn with_run_immediately(mut self, run_immediately: bool) -> Self {
        self.run_immediately = run_immediately;
        self
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PollTimeout {
    pub timeout: Duration,
    pub attempts: usize,
}

#[derive(Debug)]
pub enum PollError<E> {
    Timeout(PollTimeout),
    Inner(E),
}

impl<E: fmt::Display> fmt::Display for PollError<E> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Timeout(timeout) => write!(
                f,
                "condition was not satisfied within {:?} after {} attempts",
                timeout.timeout, timeout.attempts
            ),
            Self::Inner(error) => error.fmt(f),
        }
    }
}

impl<E: std::error::Error + 'static> std::error::Error for PollError<E> {}

pub async fn poll_until<F, Fut, T, E>(mut check: F, options: PollOptions) -> Result<T, PollError<E>>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<Option<T>, E>>,
{
    let timeout = normalize_duration(options.timeout);
    let interval = normalize_duration(options.interval);
    let deadline = Instant::now() + timeout;
    let mut attempts = 0usize;

    if !options.run_immediately {
        sleep(interval.min(deadline.saturating_duration_since(Instant::now()))).await;
    }

    loop {
        if Instant::now() > deadline {
            return Err(PollError::Timeout(PollTimeout { timeout, attempts }));
        }

        attempts += 1;
        match check().await {
            Ok(Some(value)) => return Ok(value),
            Ok(None) => {}
            Err(error) => return Err(PollError::Inner(error)),
        }

        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(PollError::Timeout(PollTimeout { timeout, attempts }));
        }

        sleep(interval.min(remaining)).await;
    }
}

fn normalize_duration(duration: Duration) -> Duration {
    if duration.is_zero() {
        Duration::from_millis(1)
    } else {
        duration
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test]
    async fn poll_until_returns_when_condition_matches() {
        let attempts = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&attempts);

        let result = poll_until(
            move || {
                let counter = Arc::clone(&counter);
                async move {
                    let next = counter.fetch_add(1, Ordering::SeqCst) + 1;
                    if next >= 3 {
                        Ok::<_, &'static str>(Some(next))
                    } else {
                        Ok(None)
                    }
                }
            },
            PollOptions::new(Duration::from_millis(200), Duration::from_millis(10)),
        )
        .await
        .expect("poll should succeed");

        assert_eq!(result, 3);
        assert_eq!(attempts.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn poll_until_returns_inner_error() {
        let result = poll_until(
            || async { Err::<Option<()>, _>("boom") },
            PollOptions::new(Duration::from_millis(100), Duration::from_millis(10)),
        )
        .await;

        assert!(matches!(result, Err(PollError::Inner("boom"))));
    }

    #[tokio::test]
    async fn poll_until_times_out() {
        let result = poll_until(
            || async { Ok::<Option<()>, &'static str>(None) },
            PollOptions::new(Duration::from_millis(30), Duration::from_millis(10)),
        )
        .await;

        match result {
            Err(PollError::Timeout(timeout)) => {
                assert!(timeout.attempts >= 1);
                assert_eq!(timeout.timeout, Duration::from_millis(30));
            }
            other => panic!("expected timeout, got {other:?}"),
        }
    }
}
