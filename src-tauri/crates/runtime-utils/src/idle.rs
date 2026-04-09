use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct IdleTracker {
    inner: Arc<Mutex<IdleTrackerInner>>,
}

#[derive(Debug)]
struct IdleTrackerInner {
    ttl: Duration,
    last_touched_at: Instant,
    active_uses: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct IdleSnapshot {
    pub ttl: Duration,
    pub active_uses: usize,
    pub idle_for: Duration,
    pub expires_in: Option<Duration>,
    pub is_expired: bool,
}

#[derive(Debug)]
pub struct IdleLease {
    inner: Arc<Mutex<IdleTrackerInner>>,
    released: bool,
}

impl IdleTracker {
    pub fn new(ttl: Duration) -> Self {
        Self {
            inner: Arc::new(Mutex::new(IdleTrackerInner {
                ttl,
                last_touched_at: Instant::now(),
                active_uses: 0,
            })),
        }
    }

    pub fn begin_use(&self) -> IdleLease {
        let mut inner = lock_recover(&self.inner);
        inner.active_uses += 1;
        inner.last_touched_at = Instant::now();

        IdleLease {
            inner: Arc::clone(&self.inner),
            released: false,
        }
    }

    pub fn touch(&self) {
        let mut inner = lock_recover(&self.inner);
        inner.last_touched_at = Instant::now();
    }

    pub fn set_ttl(&self, ttl: Duration) {
        let mut inner = lock_recover(&self.inner);
        inner.ttl = ttl;
    }

    pub fn ttl(&self) -> Duration {
        lock_recover(&self.inner).ttl
    }

    pub fn active_uses(&self) -> usize {
        lock_recover(&self.inner).active_uses
    }

    pub fn is_in_use(&self) -> bool {
        self.active_uses() > 0
    }

    pub fn is_idle_expired(&self) -> bool {
        self.snapshot().is_expired
    }

    pub fn snapshot(&self) -> IdleSnapshot {
        let inner = lock_recover(&self.inner);
        let idle_for = Instant::now().saturating_duration_since(inner.last_touched_at);
        let is_expired = inner.active_uses == 0 && idle_for >= inner.ttl;
        let expires_in = if inner.active_uses > 0 {
            None
        } else {
            Some(inner.ttl.saturating_sub(idle_for))
        };

        IdleSnapshot {
            ttl: inner.ttl,
            active_uses: inner.active_uses,
            idle_for,
            expires_in,
            is_expired,
        }
    }
}

impl IdleLease {
    pub fn release(&mut self) {
        if self.released {
            return;
        }

        let mut inner = lock_recover(&self.inner);
        inner.active_uses = inner.active_uses.saturating_sub(1);
        inner.last_touched_at = Instant::now();
        self.released = true;
    }
}

impl Drop for IdleLease {
    fn drop(&mut self) {
        self.release();
    }
}

fn lock_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn tracker_expires_after_ttl() {
        let tracker = IdleTracker::new(Duration::from_millis(20));
        thread::sleep(Duration::from_millis(30));

        let snapshot = tracker.snapshot();
        assert!(snapshot.is_expired);
        assert_eq!(snapshot.active_uses, 0);
    }

    #[test]
    fn active_lease_blocks_idle_expiration() {
        let tracker = IdleTracker::new(Duration::from_millis(10));
        let lease = tracker.begin_use();
        thread::sleep(Duration::from_millis(25));

        assert!(tracker.is_in_use());
        assert!(!tracker.is_idle_expired());

        drop(lease);
        assert_eq!(tracker.active_uses(), 0);
    }

    #[test]
    fn releasing_lease_resets_idle_timer() {
        let tracker = IdleTracker::new(Duration::from_millis(25));
        let lease = tracker.begin_use();
        thread::sleep(Duration::from_millis(10));
        drop(lease);

        let snapshot = tracker.snapshot();
        assert!(!snapshot.is_expired);
        assert_eq!(snapshot.active_uses, 0);
        assert!(snapshot.idle_for < Duration::from_millis(25));
    }
}
