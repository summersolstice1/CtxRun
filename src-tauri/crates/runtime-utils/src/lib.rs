pub mod idle;
pub mod tasks;
pub mod time;
pub mod wait;

pub use idle::{IdleLease, IdleSnapshot, IdleTracker};
pub use tasks::{BackgroundTaskHandle, PeriodicTaskOptions, spawn_delayed, spawn_periodic};
pub use time::{
    clamp_duration, clamp_millis, deadline_after, duration_from_millis, duration_from_secs,
    saturating_remaining,
};
pub use wait::{PollError, PollOptions, poll_until};
