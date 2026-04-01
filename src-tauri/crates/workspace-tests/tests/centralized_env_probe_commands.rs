use std::{
    fs,
    net::TcpListener,
    path::PathBuf,
    process,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use ctxrun_env_probe::{
    commands::{
        environment, monitoring,
        system_info,
    },
    env_probe::{self, traits::ProjectScanner},
};
use serde_json::Value;
use sysinfo::System;

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

fn state_of<'a, T: Send + Sync + 'static>(value: &'a T) -> tauri::State<'a, T> {
    unsafe { std::mem::transmute::<&'a T, tauri::State<'a, T>>(value) }
}

fn make_tauri_fixture() -> PathBuf {
    let root = temp_root("tauri-project");
    fs::create_dir_all(root.join("src-tauri")).expect("create src-tauri dir");
    fs::write(
        root.join("package.json"),
        r#"{
  "dependencies": {
    "react": "^19.0.0",
    "@tauri-apps/api": "^2.0.0"
  },
  "devDependencies": {
    "vite": "^7.0.0"
  }
}"#,
    )
    .expect("write package.json");
    fs::write(
        root.join("src-tauri").join("Cargo.toml"),
        r#"[dependencies]
tauri = "2"
serde = "1"
tokio = { version = "1" }
"#,
    )
    .expect("write Cargo.toml");
    root
}

#[test]
fn centralized_get_system_info_returns_sane_metrics() {
    let system = Arc::new(Mutex::new(System::new()));
    let info = system_info::get_system_info(state_of(&system)).expect("system info should succeed");
    let json = serde_json::to_value(&info).expect("system info should serialize");

    let cpu_usage = json
        .get("cpu_usage")
        .and_then(Value::as_f64)
        .expect("cpu_usage");
    let memory_total = json
        .get("memory_total")
        .and_then(Value::as_u64)
        .expect("memory_total");
    let memory_usage = json
        .get("memory_usage")
        .and_then(Value::as_u64)
        .expect("memory_usage");
    let memory_available = json
        .get("memory_available")
        .and_then(Value::as_u64)
        .expect("memory_available");

    assert!(cpu_usage >= 0.0);
    assert!(memory_total >= memory_usage);
    assert!(memory_total >= memory_available);
}

#[tokio::test]
async fn centralized_check_python_env_returns_a_known_outcome() {
    let result = system_info::check_python_env().await;

    match result {
        Ok(version) => assert!(!version.trim().is_empty()),
        Err(err) => assert!(
            err == "Not Found" || err == "Not Installed",
            "unexpected error: {err}"
        ),
    }
}

#[test]
fn centralized_get_system_metrics_returns_memory_and_cpu_data() {
    let system = Arc::new(Mutex::new(System::new()));
    let probes = monitoring::MonitorProbeState::default();
    let metrics = monitoring::get_system_metrics(state_of(&system), state_of(&probes))
        .expect("metrics should succeed");

    assert!(metrics.cpu_usage >= 0.0);
    assert!(metrics.memory_total >= metrics.memory_used);
    assert!(!metrics.summary.cpu_arch.trim().is_empty());
    assert!(metrics.summary.logical_core_count > 0);
    assert!(metrics
        .disks
        .iter()
        .all(|disk| disk.total_space >= disk.available_space));
    assert!(metrics
        .network_interfaces
        .iter()
        .all(|network| !network.name.trim().is_empty()));
    assert!(metrics.network_interfaces.iter().all(|network| !network.interface_type.is_empty()));
    assert!(metrics
        .network_interfaces
        .iter()
        .all(|network| !network.connection_status.is_empty()));
}

#[test]
fn centralized_get_top_processes_returns_named_entries_with_limit() {
    let system = Arc::new(Mutex::new(System::new()));
    let processes =
        monitoring::get_top_processes(state_of(&system)).expect("top processes should succeed");

    assert!(!processes.is_empty());
    assert!(processes.len() <= 30);
    assert!(processes.iter().all(|process| !process.name.trim().is_empty()));
}

#[tokio::test]
async fn centralized_get_active_ports_detects_a_bound_tcp_listener() {
    let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind test listener");
    let port = listener.local_addr().expect("listener addr").port();
    let system = Arc::new(Mutex::new(System::new()));

    std::thread::sleep(Duration::from_millis(150));

    let ports = monitoring::get_active_ports(state_of(&system))
        .await
        .expect("active ports should succeed");

    assert!(
        ports
            .iter()
            .any(|entry| entry.port == port && entry.protocol == "TCP"),
        "expected bound TCP listener on port {port}"
    );
}

#[test]
fn centralized_check_file_locks_rejects_missing_paths() {
    let system = Arc::new(Mutex::new(System::new()));
    let missing = temp_root("missing").join("does-not-exist.txt");

    let error = monitoring::check_file_locks(
        missing.to_string_lossy().to_string(),
        state_of(&system),
    )
    .expect_err("missing path should fail");
    assert!(error.contains("Path does not exist"));
}

#[test]
fn centralized_check_file_locks_handles_existing_unlocked_files() {
    let system = Arc::new(Mutex::new(System::new()));
    let root = temp_root("locks");
    let file = root.join("sample.txt");
    fs::write(&file, "hello").expect("write sample file");

    let locks = monitoring::check_file_locks(file.to_string_lossy().to_string(), state_of(&system))
        .expect("existing file should be checked");
    assert!(locks.iter().all(|process| !process.name.trim().is_empty()));

    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn centralized_get_ai_context_detects_tauri_projects() {
    let root = make_tauri_fixture();
    let report = environment::get_ai_context(root.to_string_lossy().to_string())
        .await
        .expect("ai context should succeed");

    assert_eq!(report.project_type, env_probe::ProjectType::Tauri);
    assert!(report.dependencies.contains_key("tauri"));
    assert!(report.markdown.contains("Context: Tauri"));

    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn centralized_get_env_info_returns_system_summary_for_project() {
    let root = make_tauri_fixture();
    let system = Arc::new(Mutex::new(System::new()));

    let report =
        environment::get_env_info(state_of(&system), Some(root.to_string_lossy().to_string()))
            .await
            .expect("env info should succeed");

    assert!(report.system.is_some());
    assert!(report.languages.iter().all(|tool| !tool.name.is_empty()));

    let _ = fs::remove_dir_all(root);
}

#[test]
fn centralized_env_probe_scanners_detect_expected_dependencies() {
    let node_root = temp_root("node");
    fs::write(
        node_root.join("package.json"),
        r#"{
  "dependencies": {
    "react": "^19.0.0",
    "@tauri-apps/api": "^2.0.0",
    "lodash": "^4.17.0"
  },
  "devDependencies": {
    "vite": "^7.0.0"
  }
}"#,
    )
    .expect("write package.json");
    let node_deps = env_probe::scanners::NodeScanner
        .parse_dependencies(node_root.to_string_lossy().as_ref());
    assert_eq!(node_deps.get("react"), Some(&"^19.0.0".to_string()));
    assert_eq!(node_deps.get("vite"), Some(&"^7.0.0".to_string()));
    assert!(!node_deps.contains_key("lodash"));

    let rust_root = temp_root("rust");
    fs::create_dir_all(rust_root.join("src-tauri")).expect("create src-tauri dir");
    fs::write(
        rust_root.join("src-tauri").join("Cargo.toml"),
        r#"[dependencies]
tauri = "2"
serde = "1"
tauri-plugin-shell = "2"
rand = "0.9"
"#,
    )
    .expect("write Cargo.toml");
    let rust_deps = env_probe::scanners::RustScanner
        .parse_dependencies(rust_root.to_string_lossy().as_ref());
    assert_eq!(rust_deps.get("tauri"), Some(&"2".to_string()));
    assert_eq!(rust_deps.get("tauri-plugin-shell"), Some(&"2".to_string()));
    assert!(!rust_deps.contains_key("rand"));

    let python_root = temp_root("python");
    fs::write(
        python_root.join("requirements.txt"),
        "fastapi==0.110.0\nrequests>=2.32.0\nblack==24.0.0\n",
    )
    .expect("write requirements");
    let python_deps = env_probe::scanners::PythonScanner
        .parse_dependencies(python_root.to_string_lossy().as_ref());
    assert_eq!(python_deps.get("fastapi"), Some(&"pip".to_string()));
    assert_eq!(python_deps.get("requests"), Some(&"pip".to_string()));
    assert!(!python_deps.contains_key("black"));

    let go_root = temp_root("go");
    fs::write(
        go_root.join("go.mod"),
        "module example\n\nrequire (\n  github.com/gin-gonic/gin v1.9.0\n  github.com/google/uuid v1.6.0\n)\n",
    )
    .expect("write go.mod");
    let go_deps = env_probe::scanners::GoScanner
        .parse_dependencies(go_root.to_string_lossy().as_ref());
    assert_eq!(go_deps.get("gin"), Some(&"1.9.0".to_string()));
    assert!(!go_deps.contains_key("uuid"));

    let php_root = temp_root("php");
    fs::write(
        php_root.join("composer.json"),
        r#"{
  "require": {
    "laravel/framework": "^11.0",
    "guzzlehttp/guzzle": "^7.0",
    "monolog/monolog": "^3.0"
  }
}"#,
    )
    .expect("write composer.json");
    let php_deps = env_probe::scanners::PhpScanner
        .parse_dependencies(php_root.to_string_lossy().as_ref());
    assert_eq!(php_deps.get("laravel/framework"), Some(&"^11.0".to_string()));
    assert_eq!(php_deps.get("guzzlehttp/guzzle"), Some(&"^7.0".to_string()));
    assert!(!php_deps.contains_key("monolog/monolog"));

    let dotnet_root = temp_root("dotnet");
    fs::write(
        dotnet_root.join("Sample.csproj"),
        r#"<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer" Version="8.0.0" />
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
    <PackageReference Include="Serilog" Version="4.0.0" />
  </ItemGroup>
</Project>"#,
    )
    .expect("write csproj");
    let dotnet_deps = env_probe::scanners::DotNetScanner
        .parse_dependencies(dotnet_root.to_string_lossy().as_ref());
    assert_eq!(
        dotnet_deps.get("Microsoft.EntityFrameworkCore.SqlServer"),
        Some(&"8.0.0".to_string())
    );
    assert_eq!(dotnet_deps.get("Newtonsoft.Json"), Some(&"13.0.3".to_string()));
    assert!(!dotnet_deps.contains_key("Serilog"));

    let mobile_root = temp_root("flutter");
    fs::write(
        mobile_root.join("pubspec.yaml"),
        "dependencies:\n  flutter: 3.22.0\n  provider: ^6.1.2\n  http: ^1.2.0\n",
    )
    .expect("write pubspec");
    let mobile_deps = env_probe::scanners::MobileScanner
        .parse_dependencies(mobile_root.to_string_lossy().as_ref());
    assert_eq!(mobile_deps.get("flutter"), Some(&"3.22.0".to_string()));
    assert_eq!(mobile_deps.get("provider"), Some(&"6.1.2".to_string()));
    assert!(!mobile_deps.contains_key("http"));

    let tauri_root = make_tauri_fixture();
    let report = env_probe::scan_logic::scan_ai_context(tauri_root.to_string_lossy().as_ref());
    assert_eq!(report.project_type, env_probe::ProjectType::Tauri);
    assert!(report.markdown.contains("Context: Tauri"));
    assert!(report.markdown.contains("- tauri: 2"));

    for root in [
        node_root,
        rust_root,
        python_root,
        go_root,
        php_root,
        dotnet_root,
        mobile_root,
        tauri_root,
    ] {
        let _ = fs::remove_dir_all(root);
    }
}
