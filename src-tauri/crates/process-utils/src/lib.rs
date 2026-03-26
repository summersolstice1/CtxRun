use std::ffi::OsStr;

const CREATE_NO_WINDOW_FLAG: u32 = 0x08000000;
const DETACHED_PROCESS_FLAG: u32 = 0x00000008;

pub trait ProcessCommandExt {
    fn set_windows_creation_flags(&mut self, flags: u32);
}

impl ProcessCommandExt for std::process::Command {
    fn set_windows_creation_flags(&mut self, flags: u32) {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;

            self.creation_flags(flags);
        }

        #[cfg(not(target_os = "windows"))]
        let _ = flags;
    }
}

#[cfg(feature = "tokio")]
impl ProcessCommandExt for tokio::process::Command {
    fn set_windows_creation_flags(&mut self, flags: u32) {
        #[cfg(target_os = "windows")]
        {
            self.creation_flags(flags);
        }

        #[cfg(not(target_os = "windows"))]
        let _ = flags;
    }
}

pub fn apply_background_flags(command: &mut impl ProcessCommandExt) {
    command.set_windows_creation_flags(CREATE_NO_WINDOW_FLAG);
}

pub fn apply_detached_flags(command: &mut impl ProcessCommandExt) {
    command.set_windows_creation_flags(DETACHED_PROCESS_FLAG);
}

pub fn new_background_command(program: impl AsRef<OsStr>) -> std::process::Command {
    let mut command = std::process::Command::new(program);
    apply_background_flags(&mut command);
    command
}

pub fn new_detached_command(program: impl AsRef<OsStr>) -> std::process::Command {
    let mut command = std::process::Command::new(program);
    apply_detached_flags(&mut command);
    command
}

#[cfg(feature = "tokio")]
pub fn new_tokio_background_command(program: impl AsRef<OsStr>) -> tokio::process::Command {
    let mut command = tokio::process::Command::new(program);
    apply_background_flags(&mut command);
    command
}

#[cfg(feature = "tokio")]
pub fn new_tokio_detached_command(program: impl AsRef<OsStr>) -> tokio::process::Command {
    let mut command = tokio::process::Command::new(program);
    apply_detached_flags(&mut command);
    command
}
