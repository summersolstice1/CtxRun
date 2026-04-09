use std::time::{Duration, Instant};

pub fn duration_from_millis(ms: u64) -> Duration {
    Duration::from_millis(ms)
}

pub fn duration_from_secs(secs: u64) -> Duration {
    Duration::from_secs(secs)
}

pub fn clamp_millis(requested: u64, min: u64, max: u64) -> u64 {
    assert!(min <= max, "min must be <= max");
    requested.clamp(min, max)
}

pub fn clamp_duration(requested: Duration, min: Duration, max: Duration) -> Duration {
    assert!(min <= max, "min must be <= max");
    requested.clamp(min, max)
}

pub fn deadline_after(timeout: Duration) -> Instant {
    Instant::now() + timeout
}

pub fn saturating_remaining(deadline: Instant, now: Instant) -> Duration {
    deadline.saturating_duration_since(now)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamp_helpers_bound_values() {
        assert_eq!(clamp_millis(5, 10, 20), 10);
        assert_eq!(clamp_millis(15, 10, 20), 15);
        assert_eq!(clamp_millis(25, 10, 20), 20);

        let min = Duration::from_millis(10);
        let max = Duration::from_millis(20);
        assert_eq!(clamp_duration(Duration::from_millis(5), min, max), min);
        assert_eq!(
            clamp_duration(Duration::from_millis(15), min, max),
            Duration::from_millis(15)
        );
        assert_eq!(clamp_duration(Duration::from_millis(25), min, max), max);
    }

    #[test]
    fn remaining_duration_saturates_at_zero() {
        let deadline = Instant::now() + Duration::from_millis(20);
        let after_deadline = deadline + Duration::from_millis(10);

        assert_eq!(
            saturating_remaining(deadline, after_deadline),
            Duration::ZERO
        );
    }
}
