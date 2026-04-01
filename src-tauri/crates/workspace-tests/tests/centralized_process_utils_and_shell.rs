use std::{
    fs,
    path::PathBuf,
    process,
    time::{SystemTime, UNIX_EPOCH},
};

use ctxrun_process_utils::{ProcessCommandExt, apply_background_flags, apply_detached_flags};

#[path = "../../../src/error.rs"]
mod error;

#[path = "../../../src/tray_support.rs"]
mod tray_support;

#[path = "../../../src/fs_commands.rs"]
mod fs_commands;

#[allow(dead_code)]
mod apps_under_test {
    include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../src/apps.rs"));

    #[test]
    fn finalize_apps_sorts_and_deduplicates_by_path() {
        let apps = vec![
            ctxrun_db::AppEntry {
                name: "B".into(),
                path: "/b".into(),
                icon: None,
                usage_count: 0,
            },
            ctxrun_db::AppEntry {
                name: "A".into(),
                path: "/a".into(),
                icon: None,
                usage_count: 0,
            },
            ctxrun_db::AppEntry {
                name: "A duplicate".into(),
                path: "/a".into(),
                icon: None,
                usage_count: 3,
            },
        ];

        let finalized = finalize_apps(apps);
        assert_eq!(finalized.len(), 2);
        assert_eq!(finalized[0].path, "/a");
        assert_eq!(finalized[1].path, "/b");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_shortcut_filter_blocks_ignored_dirs_and_keywords() {
        assert!(is_windows_shortcut_ignored(
            r"c:\programdata\microsoft\windows\start menu\programs\powershell\pwsh.lnk",
            "PowerShell 7"
        ));
        assert!(is_windows_shortcut_ignored(
            r"c:\users\flynn\appdata\roaming\microsoft\windows\start menu\programs\myapp.lnk",
            "My App Uninstall"
        ));
        assert!(!is_windows_shortcut_ignored(
            r"c:\users\flynn\appdata\roaming\microsoft\windows\start menu\programs\myapp.lnk",
            "My App"
        ));
    }
}

mod monitor_under_test {
    include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../src/monitor.rs"));

    fn state_of<'a, T: Send + Sync + 'static>(value: &'a T) -> tauri::State<'a, T> {
        unsafe { std::mem::transmute::<&'a T, tauri::State<'a, T>>(value) }
    }

    #[test]
    fn kill_process_rejects_missing_processes() {
        let system = std::sync::Arc::new(std::sync::Mutex::new(sysinfo::System::new()));
        let result = kill_process(u32::MAX, state_of(&system));

        let error = result.expect_err("missing pid should fail");
        assert!(error.to_string().contains("Process not found"));
    }
}

#[derive(Default)]
struct FakeCommand {
    flags: Vec<u32>,
}

impl ProcessCommandExt for FakeCommand {
    fn set_windows_creation_flags(&mut self, flags: u32) {
        self.flags.push(flags);
    }
}

fn temp_root(prefix: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let root = std::env::temp_dir().join(format!(
        "ctxrun-workspace-tests-{prefix}-{}-{nanos}",
        process::id()
    ));
    fs::create_dir_all(&root).expect("create temp root");
    root
}

#[test]
fn centralized_process_utils_apply_background_flags_uses_expected_constant() {
    let mut command = FakeCommand::default();
    apply_background_flags(&mut command);
    assert_eq!(command.flags, vec![0x08000000]);
}

#[test]
fn centralized_process_utils_apply_detached_flags_uses_expected_constant() {
    let mut command = FakeCommand::default();
    apply_detached_flags(&mut command);
    assert_eq!(command.flags, vec![0x00000008]);
}

#[test]
fn centralized_tray_language_logic_maps_expected_variants() {
    assert_eq!(tray_support::normalize_tray_language("en"), "en");
    assert_eq!(tray_support::normalize_tray_language("en-US"), "en");
    assert_eq!(tray_support::normalize_tray_language("en_US"), "en");
    assert_eq!(tray_support::normalize_tray_language("zh-CN"), "zh");
    assert_eq!(tray_support::normalize_tray_language(""), "zh");

    assert_eq!(tray_support::tray_menu_texts("en").quit, "Quit");
    assert_eq!(tray_support::tray_menu_texts("zh").quit, "退出");
}

#[test]
fn centralized_fs_commands_get_file_size_returns_size_or_zero_for_missing_files() {
    let root = temp_root("file-size");
    let file = root.join("sample.txt");
    fs::write(&file, "hello world").expect("write sample file");

    assert_eq!(fs_commands::get_file_size(file.to_string_lossy().to_string()), 11);
    assert_eq!(
        fs_commands::get_file_size(root.join("missing.txt").to_string_lossy().to_string()),
        0
    );

    let _ = fs::remove_dir_all(root);
}

#[test]
fn centralized_fs_commands_open_folder_rejects_files_and_missing_paths() {
    let root = temp_root("open-folder");
    let file = root.join("sample.txt");
    fs::write(&file, "hello").expect("write sample file");

    let missing = fs_commands::open_folder_in_file_manager(
        root.join("missing").to_string_lossy().to_string(),
    )
    .expect_err("missing path should error");
    assert!(missing.to_string().contains("Failed to access path"));

    let not_dir =
        fs_commands::open_folder_in_file_manager(file.to_string_lossy().to_string())
            .expect_err("files should be rejected");
    assert_eq!(not_dir.to_string(), "Path is not a directory");

    let _ = fs::remove_dir_all(root);
}
