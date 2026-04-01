use std::collections::HashSet;
use std::net::SocketAddr;
use std::path::Path;
use std::sync::{Arc, Mutex};

use listeners::{Protocol, get_all};
use once_cell::sync::Lazy;
use serde::Serialize;
use starship_battery::{
    Manager as BatteryManager,
    State as BatteryState,
    units::{
        electric_potential::volt,
        energy::watt_hour,
        power::watt,
        thermodynamic_temperature::degree_celsius,
        time::second,
    },
};
use sysinfo::{
    CpuRefreshKind, MemoryRefreshKind, Pid, ProcessRefreshKind, ProcessesToUpdate, RefreshKind,
    System, UpdateKind,
};
use tauri::State;
#[cfg(target_os = "windows")]
use walkdir::WalkDir;
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{ERROR_MORE_DATA, ERROR_SUCCESS, WIN32_ERROR};
#[cfg(target_os = "windows")]
use windows::Win32::System::RestartManager::{
    CCH_RM_SESSION_KEY, RM_PROCESS_INFO, RmEndSession, RmGetList, RmRegisterResources,
    RmStartSession,
};
#[cfg(target_os = "windows")]
use windows::Win32::System::Threading::{
    IsProcessCritical, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
};
#[cfg(target_os = "windows")]
use windows::core::{BOOL, PCWSTR, PWSTR};

static BATTERY_MANAGER: Lazy<Mutex<Option<BatteryManager>>> = Lazy::new(|| Mutex::new(None));

#[derive(Debug, Serialize, Clone)]
pub struct SystemMetrics {
    pub cpu_usage: f32,
    pub memory_used: u64,
    pub memory_total: u64,
    pub battery: Option<BatteryMetrics>,
}

#[derive(Debug, Serialize, Clone)]
pub struct BatteryMetrics {
    pub battery_count: u32,
    pub state: String,
    pub percent: f32,
    pub health_percent: Option<f32>,
    pub power_watts: Option<f32>,
    pub voltage_volts: Option<f32>,
    pub energy_wh: Option<f32>,
    pub energy_full_wh: Option<f32>,
    pub energy_design_wh: Option<f32>,
    pub cycle_count: Option<u32>,
    pub temperature_celsius: Option<f32>,
    pub time_to_full_minutes: Option<f32>,
    pub time_to_empty_minutes: Option<f32>,
    pub vendor: Option<String>,
    pub model: Option<String>,
    pub technology: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory: u64,
    pub user: String,
    pub is_system: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct PortInfo {
    pub port: u16,
    pub protocol: String,
    pub pid: u32,
    pub process_name: String,
    pub local_addr: String,
    pub is_system: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct LockedFileProcess {
    pub pid: u32,
    pub name: String,
    pub icon: Option<String>,
    pub user: String,
    pub is_system: bool,
}

fn normalize_battery_state(state: BatteryState) -> &'static str {
    match state {
        BatteryState::Charging => "charging",
        BatteryState::Discharging => "discharging",
        BatteryState::Empty => "empty",
        BatteryState::Full => "full",
        _ => "unknown",
    }
}

fn collect_battery_metrics() -> crate::error::Result<Option<BatteryMetrics>> {
    let mut manager_guard = BATTERY_MANAGER.lock().map_err(|e| e.to_string())?;
    if manager_guard.is_none() {
        *manager_guard = Some(BatteryManager::new().map_err(|e| e.to_string())?);
    }
    let manager = manager_guard.as_ref().expect("battery manager initialized");
    let batteries = manager.batteries().map_err(|e| e.to_string())?;

    let mut battery_count = 0_u32;
    let mut total_energy_wh = 0.0_f32;
    let mut total_energy_full_wh = 0.0_f32;
    let mut total_energy_design_wh = 0.0_f32;
    let mut total_power_watts = 0.0_f32;
    let mut total_voltage_volts = 0.0_f32;
    let mut voltage_samples = 0_u32;
    let mut total_temperature_celsius = 0.0_f32;
    let mut temperature_samples = 0_u32;
    let mut cycle_count = None;
    let mut time_to_full_minutes = None;
    let mut time_to_empty_minutes = None;
    let mut vendor = None;
    let mut model = None;
    let mut technology = None;
    let mut saw_charging = false;
    let mut saw_discharging = false;
    let mut saw_full = false;
    let mut saw_empty = false;
    let mut first_state = None;

    for next_battery in batteries {
        let battery = next_battery.map_err(|e| e.to_string())?;
        battery_count += 1;

        let state = battery.state();
        first_state.get_or_insert_with(|| normalize_battery_state(state).to_string());

        match state {
            BatteryState::Charging => saw_charging = true,
            BatteryState::Discharging => saw_discharging = true,
            BatteryState::Full => saw_full = true,
            BatteryState::Empty => saw_empty = true,
            _ => {}
        }

        total_energy_wh += battery.energy().get::<watt_hour>().max(0.0);
        total_energy_full_wh += battery.energy_full().get::<watt_hour>().max(0.0);
        total_energy_design_wh += battery.energy_full_design().get::<watt_hour>().max(0.0);
        total_power_watts += battery.energy_rate().get::<watt>().abs();

        let voltage = battery.voltage().get::<volt>();
        if voltage.is_finite() && voltage > 0.0 {
            total_voltage_volts += voltage;
            voltage_samples += 1;
        }

        if let Some(temp) = battery.temperature() {
            let celsius = temp.get::<degree_celsius>();
            if celsius.is_finite() {
                total_temperature_celsius += celsius;
                temperature_samples += 1;
            }
        }

        if cycle_count.is_none() {
            cycle_count = battery.cycle_count();
        }
        if time_to_full_minutes.is_none() {
            time_to_full_minutes = battery.time_to_full().map(|time| time.get::<second>() / 60.0);
        }
        if time_to_empty_minutes.is_none() {
            time_to_empty_minutes =
                battery.time_to_empty().map(|time| time.get::<second>() / 60.0);
        }
        if vendor.is_none() {
            vendor = battery.vendor().map(|value| value.to_string());
        }
        if model.is_none() {
            model = battery.model().map(|value| value.to_string());
        }
        if technology.is_none() {
            technology = Some(format!("{:?}", battery.technology()));
        }
    }

    if battery_count == 0 {
        return Ok(None);
    }

    let state = if saw_charging {
        "charging"
    } else if saw_discharging {
        "discharging"
    } else if saw_full && !saw_empty {
        "full"
    } else if saw_empty && !saw_full {
        "empty"
    } else {
        first_state.as_deref().unwrap_or("unknown")
    };

    let charge_percent = if total_energy_full_wh > 0.0 {
        ((total_energy_wh / total_energy_full_wh) * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };

    let health_percent = (total_energy_design_wh > 0.0)
        .then(|| ((total_energy_full_wh / total_energy_design_wh) * 100.0).clamp(0.0, 100.0));

    Ok(Some(BatteryMetrics {
        battery_count,
        state: state.to_string(),
        percent: charge_percent,
        health_percent,
        power_watts: (total_power_watts > 0.0).then_some(total_power_watts),
        voltage_volts: (voltage_samples > 0).then_some(total_voltage_volts / voltage_samples as f32),
        energy_wh: (total_energy_wh > 0.0).then_some(total_energy_wh),
        energy_full_wh: (total_energy_full_wh > 0.0).then_some(total_energy_full_wh),
        energy_design_wh: (total_energy_design_wh > 0.0).then_some(total_energy_design_wh),
        cycle_count,
        temperature_celsius: (temperature_samples > 0)
            .then_some(total_temperature_celsius / temperature_samples as f32),
        time_to_full_minutes,
        time_to_empty_minutes,
        vendor,
        model,
        technology,
    }))
}

pub fn is_critical_system_process(sys: &System, process: &sysinfo::Process) -> bool {
    let pid = process.pid().as_u32();

    if pid <= 4 {
        return true;
    }

    #[cfg(target_os = "windows")]
    {
        unsafe {
            match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                Ok(handle) => {
                    if !handle.is_invalid() {
                        let mut is_critical = BOOL(0);
                        if IsProcessCritical(handle, &mut is_critical).is_ok()
                            && bool::from(is_critical)
                        {
                            let _ = windows::Win32::Foundation::CloseHandle(handle);
                            return true;
                        }
                        let _ = windows::Win32::Foundation::CloseHandle(handle);
                    } else {
                        return true;
                    }
                }
                _ => {
                    return true;
                }
            }
        }

        let name = process.name().to_string_lossy().to_lowercase();
        if [
            "csrss.exe",
            "smss.exe",
            "wininit.exe",
            "services.exe",
            "lsass.exe",
            "memory compression",
            "spoolsv.exe",
        ]
        .contains(&name.as_str())
        {
            return true;
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(uid) = process.user_id()
            && uid.to_string() == "0"
        {
            return true;
        }
    }

    let _ = sys;
    false
}

#[tauri::command]
pub fn get_system_metrics(
    system: State<'_, Arc<Mutex<System>>>,
) -> crate::error::Result<SystemMetrics> {
    let (cpu_usage, memory_used, memory_total) = {
        let mut sys = system.lock().map_err(|e| e.to_string())?;

        sys.refresh_specifics(
            RefreshKind::nothing()
                .with_cpu(CpuRefreshKind::everything())
                .with_memory(MemoryRefreshKind::everything()),
        );

        (sys.global_cpu_usage(), sys.used_memory(), sys.total_memory())
    };

    Ok(SystemMetrics {
        cpu_usage,
        memory_used,
        memory_total,
        battery: match collect_battery_metrics() {
            Ok(metrics) => metrics,
            Err(err) => {
                eprintln!("battery metrics unavailable: {err}");
                None
            }
        },
    })
}

#[tauri::command]
pub fn get_top_processes(
    system: State<'_, Arc<Mutex<System>>>,
) -> crate::error::Result<Vec<ProcessInfo>> {
    let mut sys = system.lock().map_err(|e| e.to_string())?;

    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing()
            .with_cpu()
            .with_memory()
            .with_user(UpdateKind::Always),
    );

    let mut processes: Vec<ProcessInfo> = sys
        .processes()
        .iter()
        .filter_map(|(pid, process)| {
            let pid_u32 = pid.as_u32();
            if pid_u32 == 0 {
                return None;
            }

            let name = process.name().to_string_lossy().to_string();
            if name.is_empty() {
                return None;
            }

            let user = process
                .user_id()
                .map(|uid| uid.to_string().replace("Uid(", "").replace(")", ""))
                .unwrap_or_else(|| "Unknown".to_string());

            Some(ProcessInfo {
                pid: pid_u32,
                name,
                cpu_usage: process.cpu_usage(),
                memory: process.memory(),
                user,
                is_system: is_critical_system_process(&sys, process),
            })
        })
        .collect();

    processes.sort_unstable_by(|a, b| {
        b.memory
            .partial_cmp(&a.memory)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(processes.into_iter().take(30).collect())
}

#[tauri::command]
pub async fn get_active_ports(
    system: State<'_, Arc<Mutex<System>>>,
) -> crate::error::Result<Vec<PortInfo>> {
    let sys_state = system.inner().clone();

    tauri::async_runtime::spawn_blocking(move || {
        let listeners = get_all().map_err(|e| e.to_string())?;
        let mut sys = sys_state.lock().map_err(|e| e.to_string())?;

        sys.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing().with_user(UpdateKind::Always),
        );

        let mut port_infos = Vec::new();

        for listener in listeners {
            let pid_u32 = listener.process.pid;
            let pid = Pid::from(pid_u32 as usize);

            let (process_name, is_system) = if let Some(process) = sys.process(pid) {
                (
                    process.name().to_string_lossy().to_string(),
                    is_critical_system_process(&sys, process),
                )
            } else {
                (format!("Unknown ({pid_u32})"), false)
            };

            let local_addr = match listener.socket {
                SocketAddr::V4(v4) => v4.ip().to_string(),
                SocketAddr::V6(v6) => v6.ip().to_string(),
            };

            port_infos.push(PortInfo {
                port: listener.socket.port(),
                protocol: match listener.protocol {
                    Protocol::TCP => "TCP".to_string(),
                    Protocol::UDP => "UDP".to_string(),
                },
                pid: pid_u32,
                process_name,
                local_addr,
                is_system,
            });
        }

        port_infos.sort_by_key(|port| port.port);
        port_infos.dedup_by(|a, b| a.port == b.port && a.protocol == b.protocol);

        Ok(port_infos)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn check_file_locks(
    path: String,
    system: State<'_, Arc<Mutex<System>>>,
) -> crate::error::Result<Vec<LockedFileProcess>> {
    let path_obj = Path::new(&path);
    if !path_obj.exists() {
        return Err("Path does not exist".to_string());
    }

    let is_dir = path_obj.is_dir();
    let mut locking_pids = HashSet::new();

    #[cfg(target_os = "windows")]
    {
        let mut paths_to_check = Vec::new();

        if is_dir {
            for entry in WalkDir::new(&path)
                .min_depth(1)
                .into_iter()
                .filter_map(|entry| entry.ok())
            {
                if entry.file_type().is_file() {
                    paths_to_check.push(entry.path().to_string_lossy().to_string());
                }
            }
            paths_to_check.push(path.clone());
        } else {
            paths_to_check.push(path.clone());
        }

        let str_refs: Vec<&str> = paths_to_check.iter().map(String::as_str).collect();
        for chunk in str_refs.chunks(50) {
            if let Ok(pids) = get_locking_pids_windows(chunk) {
                for pid in pids {
                    locking_pids.insert(pid);
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = ctxrun_process_utils::new_background_command("lsof");

        if is_dir {
            cmd.arg("+D");
        }

        cmd.arg(&path);

        let output = cmd
            .output()
            .map_err(|e| format!("Failed to run lsof: {e}"))?;

        if output.status.success() {
            let out_str = String::from_utf8_lossy(&output.stdout);
            for line in out_str.lines() {
                if let Ok(pid) = line.trim().parse::<u32>() {
                    locking_pids.insert(pid);
                }
            }
        }
    }

    let mut sys = system.lock().map_err(|e| e.to_string())?;

    let pids_to_refresh: Vec<Pid> = locking_pids
        .iter()
        .map(|&pid| Pid::from(pid as usize))
        .collect();

    if pids_to_refresh.is_empty() {
        return Ok(Vec::new());
    }

    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&pids_to_refresh),
        false,
        ProcessRefreshKind::nothing().with_user(UpdateKind::Always),
    );

    let mut results = Vec::new();
    for pid_u32 in locking_pids {
        let sys_pid = Pid::from(pid_u32 as usize);
        if let Some(process) = sys.process(sys_pid) {
            let user = process
                .user_id()
                .map(|uid| uid.to_string().replace("Uid(", "").replace(")", ""))
                .unwrap_or_else(|| "Unknown".to_string());

            results.push(LockedFileProcess {
                pid: pid_u32,
                name: process.name().to_string_lossy().to_string(),
                icon: None,
                user,
                is_system: is_critical_system_process(&sys, process),
            });
        }
    }

    Ok(results)
}

#[cfg(target_os = "windows")]
fn get_locking_pids_windows(path_strs: &[&str]) -> crate::error::Result<Vec<u32>> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    unsafe {
        let mut session_handle: u32 = 0;
        let mut session_key = [0u16; (CCH_RM_SESSION_KEY + 1) as usize];

        let res = RmStartSession(
            &mut session_handle,
            Some(0u32),
            PWSTR(session_key.as_mut_ptr()),
        );
        if res != ERROR_SUCCESS {
            return Err(format!("RmStartSession failed: {res:?}"));
        }

        struct SessionGuard(u32);

        impl Drop for SessionGuard {
            fn drop(&mut self) {
                unsafe {
                    let _ = RmEndSession(self.0);
                }
            }
        }

        let _guard = SessionGuard(session_handle);

        let wide_paths_storage: Vec<Vec<u16>> = path_strs
            .iter()
            .map(|path| OsStr::new(path).encode_wide().chain(Some(0)).collect())
            .collect();

        let paths_ptrs: Vec<PCWSTR> = wide_paths_storage
            .iter()
            .map(|wide| PCWSTR(wide.as_ptr()))
            .collect();

        let res = RmRegisterResources(session_handle, Some(&paths_ptrs), None, None);
        if res != ERROR_SUCCESS {
            return Err(format!("RmRegisterResources failed: {res:?}"));
        }

        let mut proc_info_needed = 0u32;
        let mut proc_info: [RM_PROCESS_INFO; 10] = std::mem::zeroed();
        let mut reboot_reasons = 0u32;

        let res = RmGetList(
            session_handle,
            &mut proc_info_needed,
            &mut proc_info_needed,
            Some(proc_info.as_mut_ptr()),
            &mut reboot_reasons,
        );

        if res == ERROR_MORE_DATA {
            let mut vec_info =
                vec![std::mem::zeroed::<RM_PROCESS_INFO>(); proc_info_needed as usize];
            let mut count = proc_info_needed;
            let res = RmGetList(
                session_handle,
                &mut proc_info_needed,
                &mut count,
                Some(vec_info.as_mut_ptr()),
                &mut reboot_reasons,
            );
            if res != ERROR_SUCCESS {
                return Err(format!("RmGetList retry failed: {res:?}"));
            }

            return Ok(vec_info
                .into_iter()
                .map(|process| process.Process.dwProcessId)
                .collect());
        }

        if res != ERROR_SUCCESS {
            if res == WIN32_ERROR(0) {
                let count = proc_info_needed as usize;
                return Ok(proc_info[..count]
                    .iter()
                    .map(|process| process.Process.dwProcessId)
                    .collect());
            }
            return Err(format!("RmGetList failed: {res:?}"));
        }

        let count = proc_info_needed as usize;
        Ok(proc_info[..count]
            .iter()
            .map(|process| process.Process.dwProcessId)
            .collect())
    }
}
