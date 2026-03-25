use regex::Regex;
use reqwest::{Client, Url};
use serde::Serialize;
use std::collections::BTreeSet;
use std::process::Command;
use std::time::{Duration, Instant};
use tokio::net::{TcpStream, lookup_host};
use tokio::time::timeout;

const HTTP_TIMEOUT: Duration = Duration::from_secs(6);
const TCP_TIMEOUT: Duration = Duration::from_secs(3);
const DEFAULT_PING_TARGET: &str = "1.1.1.1";
const PING_ATTEMPTS: u32 = 6;

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NetworkHealthStatus {
    Healthy,
    Degraded,
    Offline,
}

#[derive(Debug, Serialize, Clone)]
pub struct NetworkProbeResult {
    pub id: String,
    pub name: String,
    pub category: String,
    pub url: String,
    pub host: String,
    pub status: NetworkHealthStatus,
    pub dns_ms: Option<u128>,
    pub tcp_ms: Option<u128>,
    pub http_ms: Option<u128>,
    pub total_ms: Option<u128>,
    pub status_code: Option<u16>,
    pub ip_addresses: Vec<String>,
    pub observations: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct NetworkPingStats {
    pub target: String,
    pub status: NetworkHealthStatus,
    pub sent: u32,
    pub received: u32,
    pub loss_percent: f64,
    pub min_ms: Option<f64>,
    pub avg_ms: Option<f64>,
    pub max_ms: Option<f64>,
    pub jitter_ms: Option<f64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct NetworkDiagnosticsSummary {
    pub overall_status: NetworkHealthStatus,
    pub healthy_count: usize,
    pub degraded_count: usize,
    pub offline_count: usize,
    pub issue_codes: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct NetworkDiagnosticsReport {
    pub summary: NetworkDiagnosticsSummary,
    pub ping: Option<NetworkPingStats>,
    pub probes: Vec<NetworkProbeResult>,
}

#[derive(Clone, Copy)]
struct ProbeTarget {
    id: &'static str,
    name: &'static str,
    category: &'static str,
    url: &'static str,
}

#[derive(Clone)]
struct ProbeRequest {
    id: String,
    name: String,
    category: String,
    url: String,
}

const TARGETS: [ProbeTarget; 6] = [
    ProbeTarget {
        id: "cloudflare",
        name: "Cloudflare Edge",
        category: "edge",
        url: "https://www.cloudflare.com/cdn-cgi/trace",
    },
    ProbeTarget {
        id: "github",
        name: "GitHub",
        category: "developer",
        url: "https://github.com",
    },
    ProbeTarget {
        id: "npm",
        name: "NPM Registry",
        category: "developer",
        url: "https://registry.npmjs.org/-/ping",
    },
    ProbeTarget {
        id: "pypi",
        name: "PyPI",
        category: "developer",
        url: "https://pypi.org/simple/",
    },
    ProbeTarget {
        id: "crates",
        name: "crates.io",
        category: "developer",
        url: "https://crates.io",
    },
    ProbeTarget {
        id: "baidu",
        name: "Baidu",
        category: "regional",
        url: "https://www.baidu.com",
    },
];

#[tauri::command]
pub async fn diagnose_network() -> crate::error::Result<NetworkDiagnosticsReport> {
    let client = build_http_client()?;

    let mut handles = Vec::with_capacity(TARGETS.len());
    for target in TARGETS {
        let client = client.clone();
        handles.push(tauri::async_runtime::spawn(async move {
            probe_target(client, target).await
        }));
    }

    let mut probes = Vec::with_capacity(TARGETS.len());
    for handle in handles {
        probes.push(handle.await.map_err(|error| error.to_string())?);
    }

    probes.sort_by_key(|probe| {
        TARGETS
            .iter()
            .position(|target| target.id == probe.id)
            .unwrap_or(usize::MAX)
    });

    let ping = tauri::async_runtime::spawn_blocking(|| run_ping_probe(DEFAULT_PING_TARGET))
        .await
        .ok()
        .flatten();
    let summary = summarize_report(&probes, ping.as_ref());

    Ok(NetworkDiagnosticsReport {
        summary,
        ping,
        probes,
    })
}

#[tauri::command]
pub async fn probe_network_target(url: String) -> crate::error::Result<NetworkProbeResult> {
    let client = build_http_client()?;
    let request = normalize_probe_request(&url)?;
    Ok(probe_request(client, request).await)
}

fn build_http_client() -> crate::error::Result<Client> {
    Client::builder()
        .user_agent(format!(
            "{}/{}",
            env!("CARGO_PKG_NAME"),
            env!("CARGO_PKG_VERSION")
        ))
        .timeout(HTTP_TIMEOUT)
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|error| error.to_string())
}

async fn probe_target(client: Client, target: ProbeTarget) -> NetworkProbeResult {
    probe_request(
        client,
        ProbeRequest {
            id: target.id.to_string(),
            name: target.name.to_string(),
            category: target.category.to_string(),
            url: target.url.to_string(),
        },
    )
    .await
}

async fn probe_request(client: Client, request: ProbeRequest) -> NetworkProbeResult {
    let mut observations = Vec::new();
    let total_start = Instant::now();
    let parsed = match Url::parse(&request.url) {
        Ok(parsed) => parsed,
        Err(_) => {
            observations.push("invalid_target_url".to_string());
            return NetworkProbeResult {
                id: request.id,
                name: request.name,
                category: request.category,
                url: request.url,
                host: String::new(),
                status: NetworkHealthStatus::Offline,
                dns_ms: None,
                tcp_ms: None,
                http_ms: None,
                total_ms: None,
                status_code: None,
                ip_addresses: Vec::new(),
                observations,
            };
        }
    };

    let host = parsed.host_str().unwrap_or_default().to_string();
    let port = parsed.port_or_known_default().unwrap_or(443);

    let dns_start = Instant::now();
    let lookup_host_value = host.clone();
    let resolved_addrs = match lookup_host((lookup_host_value.as_str(), port)).await {
        Ok(addrs) => addrs.collect::<Vec<_>>(),
        Err(_) => {
            observations.push("dns_resolution_failed".to_string());
            return NetworkProbeResult {
                id: request.id,
                name: request.name,
                category: request.category,
                url: request.url,
                host,
                status: NetworkHealthStatus::Offline,
                dns_ms: None,
                tcp_ms: None,
                http_ms: None,
                total_ms: Some(total_start.elapsed().as_millis()),
                status_code: None,
                ip_addresses: Vec::new(),
                observations,
            };
        }
    };
    let dns_ms = dns_start.elapsed().as_millis();

    let ip_addresses = resolved_addrs
        .iter()
        .map(|addr| addr.ip().to_string())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    if dns_ms >= 500 {
        observations.push("dns_latency_high".to_string());
    }

    let mut tcp_ms = None;
    let mut tcp_ok = false;
    for addr in &resolved_addrs {
        let connect_start = Instant::now();
        match timeout(TCP_TIMEOUT, TcpStream::connect(*addr)).await {
            Ok(Ok(stream)) => {
                tcp_ms = Some(connect_start.elapsed().as_millis());
                tcp_ok = true;
                drop(stream);
                break;
            }
            Ok(Err(_)) => {}
            Err(_) => {}
        }
    }

    if !tcp_ok {
        observations.push("tcp_connect_failed".to_string());
        return NetworkProbeResult {
            id: request.id,
            name: request.name,
            category: request.category,
            url: request.url,
            host,
            status: NetworkHealthStatus::Offline,
            dns_ms: Some(dns_ms),
            tcp_ms: None,
            http_ms: None,
            total_ms: Some(total_start.elapsed().as_millis()),
            status_code: None,
            ip_addresses,
            observations,
        };
    }

    if tcp_ms.unwrap_or_default() >= 500 {
        observations.push("tcp_latency_high".to_string());
    }

    let http_start = Instant::now();
    let response = client
        .get(&request.url)
        .header(reqwest::header::CACHE_CONTROL, "no-cache")
        .send()
        .await;
    let http_ms = http_start.elapsed().as_millis();

    match response {
        Ok(response) => {
            let status_code = response.status().as_u16();
            let reachable = status_code < 500;

            if !reachable {
                observations.push("http_error_status".to_string());
            }
            if http_ms >= 1_200 {
                observations.push("http_latency_high".to_string());
            }

            let total_ms = total_start.elapsed().as_millis();
            let status = if !reachable {
                NetworkHealthStatus::Degraded
            } else if dns_ms >= 500
                || tcp_ms.unwrap_or_default() >= 500
                || http_ms >= 1_200
                || total_ms >= 1_500
            {
                NetworkHealthStatus::Degraded
            } else {
                NetworkHealthStatus::Healthy
            };

            NetworkProbeResult {
                id: request.id,
                name: request.name,
                category: request.category,
                url: request.url,
                host,
                status,
                dns_ms: Some(dns_ms),
                tcp_ms,
                http_ms: Some(http_ms),
                total_ms: Some(total_ms),
                status_code: Some(status_code),
                ip_addresses,
                observations,
            }
        }
        Err(_) => {
            observations.push("http_request_failed".to_string());
            NetworkProbeResult {
                id: request.id,
                name: request.name,
                category: request.category,
                url: request.url,
                host,
                status: NetworkHealthStatus::Offline,
                dns_ms: Some(dns_ms),
                tcp_ms,
                http_ms: None,
                total_ms: Some(total_start.elapsed().as_millis()),
                status_code: None,
                ip_addresses,
                observations,
            }
        }
    }
}

fn normalize_probe_request(raw_url: &str) -> crate::error::Result<ProbeRequest> {
    let candidate = raw_url.trim();
    if candidate.is_empty() {
        return Err("Probe target cannot be empty.".into());
    }

    let normalized_url = if candidate.contains("://") {
        candidate.to_string()
    } else {
        format!("https://{candidate}")
    };

    let parsed = Url::parse(&normalized_url).map_err(|_| "Invalid probe target URL.")?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Only HTTP and HTTPS targets are supported.".into());
    }

    let host = parsed
        .host_str()
        .ok_or("Probe target URL is missing a host.")?
        .to_string();
    let label = host.clone();
    let id = format!("custom-{}", sanitize_probe_identifier(&host));

    Ok(ProbeRequest {
        id,
        name: label,
        category: "custom".to_string(),
        url: normalized_url,
    })
}

fn sanitize_probe_identifier(value: &str) -> String {
    value.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect()
}

fn summarize_report(
    probes: &[NetworkProbeResult],
    ping: Option<&NetworkPingStats>,
) -> NetworkDiagnosticsSummary {
    let healthy_count = probes
        .iter()
        .filter(|probe| probe.status == NetworkHealthStatus::Healthy)
        .count();
    let degraded_count = probes
        .iter()
        .filter(|probe| probe.status == NetworkHealthStatus::Degraded)
        .count();
    let offline_count = probes
        .iter()
        .filter(|probe| probe.status == NetworkHealthStatus::Offline)
        .count();

    let mut issue_codes = Vec::new();
    if probes.iter().all(|probe| probe.status == NetworkHealthStatus::Offline) {
        issue_codes.push("network_unreachable".to_string());
    }
    if probes
        .iter()
        .filter(|probe| probe.dns_ms.unwrap_or_default() >= 500)
        .count()
        >= 2
    {
        issue_codes.push("dns_slow".to_string());
    }

    let global_dev_failures = probes
        .iter()
        .filter(|probe| {
            probe.category == "developer" && probe.status == NetworkHealthStatus::Offline
        })
        .count();
    let regional_healthy = probes
        .iter()
        .any(|probe| probe.category == "regional" && probe.status == NetworkHealthStatus::Healthy);
    if global_dev_failures >= 2 && regional_healthy {
        issue_codes.push("global_routes_degraded".to_string());
    }

    if let Some(ping) = ping {
        if ping.received == 0 {
            issue_codes.push("icmp_unreachable".to_string());
        } else {
            if ping.loss_percent >= 5.0 {
                issue_codes.push("packet_loss".to_string());
            }
            if ping.jitter_ms.unwrap_or_default() >= 20.0 {
                issue_codes.push("high_jitter".to_string());
            }
            if ping.avg_ms.unwrap_or_default() >= 150.0 {
                issue_codes.push("high_latency".to_string());
            }
        }
    }

    let overall_status = if offline_count == probes.len() {
        NetworkHealthStatus::Offline
    } else if degraded_count > 0 || offline_count > 0 || !issue_codes.is_empty() {
        NetworkHealthStatus::Degraded
    } else {
        NetworkHealthStatus::Healthy
    };

    NetworkDiagnosticsSummary {
        overall_status,
        healthy_count,
        degraded_count,
        offline_count,
        issue_codes,
    }
}

fn run_ping_probe(target: &str) -> Option<NetworkPingStats> {
    #[cfg(target_os = "windows")]
    if let Some(stats) = run_powershell_ping_probe(target) {
        return Some(stats);
    }

    let output = ping_command(target).output().ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = if stdout.trim().is_empty() {
        stderr.to_string()
    } else {
        stdout.to_string()
    };

    parse_ping_output(target, &combined)
}

#[cfg(target_os = "windows")]
fn run_powershell_ping_probe(target: &str) -> Option<NetworkPingStats> {
    let command = format!(
        "$r = Test-Connection -TargetName '{target}' -Count {count} -ErrorAction SilentlyContinue | Select-Object Address,Latency,Status; $r | ConvertTo-Json -Compress",
        target = target,
        count = PING_ATTEMPTS
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &command])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let value: serde_json::Value = serde_json::from_str(stdout.trim()).ok()?;
    let rows = match value {
        serde_json::Value::Array(rows) => rows,
        serde_json::Value::Object(_) => vec![value],
        _ => return None,
    };

    let samples = rows
        .iter()
        .filter_map(|row| row.get("Latency"))
        .filter_map(|latency| latency.as_f64().or_else(|| latency.as_i64().map(|v| v as f64)))
        .collect::<Vec<_>>();

    Some(build_ping_stats(target, PING_ATTEMPTS, samples))
}

fn ping_command(target: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("ping");
        command.args([
            "-n",
            &PING_ATTEMPTS.to_string(),
            "-w",
            "1000",
            target,
        ]);
        command
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut command = Command::new("ping");
        command.args([
            "-c",
            &PING_ATTEMPTS.to_string(),
            "-W",
            "1",
            target,
        ]);
        command
    }
}

fn parse_ping_output(target: &str, output: &str) -> Option<NetworkPingStats> {
    let packet_regexes = [
        Regex::new(r"Sent = (\d+), Received = (\d+), Lost = (\d+) \(([\d.]+)% loss\)").ok()?,
        Regex::new(r"(\d+) packets transmitted, (\d+) (?:packets )?received, .*?([\d.]+)% packet loss")
            .ok()?,
    ];
    let rtt_regexes = [
        Regex::new(r"Minimum = ([\d.]+)ms, Maximum = ([\d.]+)ms, Average = ([\d.]+)ms").ok()?,
        Regex::new(r"min/avg/max(?:/mdev)? = ([\d.]+)/([\d.]+)/([\d.]+)").ok()?,
    ];
    let sample_regex = Regex::new(r"time[=<] ?([\d.]+) ?ms").ok()?;

    let mut sent = 0;
    let mut received = 0;
    let mut loss_percent = 100.0;
    let mut matched_packets = false;

    for (index, regex) in packet_regexes.iter().enumerate() {
        if let Some(captures) = regex.captures(output) {
            sent = captures.get(1)?.as_str().parse().ok()?;
            received = captures.get(2)?.as_str().parse().ok()?;
            loss_percent = if index == 0 {
                captures.get(4)?.as_str().parse().ok()?
            } else {
                captures.get(3)?.as_str().parse().ok()?
            };
            matched_packets = true;
            break;
        }
    }

    if !matched_packets {
        return None;
    }

    let samples = sample_regex
        .captures_iter(output)
        .filter_map(|capture| capture.get(1)?.as_str().parse::<f64>().ok())
        .collect::<Vec<_>>();

    let mut min_ms = None;
    let mut avg_ms = None;
    let mut max_ms = None;
    for regex in &rtt_regexes {
        if let Some(captures) = regex.captures(output) {
            min_ms = captures.get(1).and_then(|value| value.as_str().parse().ok());
            avg_ms = captures.get(2).and_then(|value| value.as_str().parse().ok());
            max_ms = captures.get(3).and_then(|value| value.as_str().parse().ok());
            break;
        }
    }

    if min_ms.is_none() && !samples.is_empty() {
        min_ms = samples.iter().cloned().reduce(f64::min);
        max_ms = samples.iter().cloned().reduce(f64::max);
        avg_ms = Some(samples.iter().sum::<f64>() / samples.len() as f64);
    }

    if min_ms.is_none() || avg_ms.is_none() || max_ms.is_none() {
        return Some(build_ping_stats(target, sent, samples));
    }

    let jitter_ms = jitter_from_samples(&samples);
    let status = ping_status(received, loss_percent, avg_ms);

    Some(NetworkPingStats {
        target: target.to_string(),
        status,
        sent,
        received,
        loss_percent,
        min_ms,
        avg_ms,
        max_ms,
        jitter_ms,
    })
}

fn build_ping_stats(target: &str, sent: u32, samples: Vec<f64>) -> NetworkPingStats {
    let received = samples.len() as u32;
    let loss_percent = if sent == 0 {
        100.0
    } else {
        ((sent.saturating_sub(received)) as f64 / sent as f64) * 100.0
    };
    let min_ms = samples.iter().cloned().reduce(f64::min);
    let max_ms = samples.iter().cloned().reduce(f64::max);
    let avg_ms = if samples.is_empty() {
        None
    } else {
        Some(samples.iter().sum::<f64>() / samples.len() as f64)
    };
    let jitter_ms = jitter_from_samples(&samples);

    NetworkPingStats {
        target: target.to_string(),
        status: ping_status(received, loss_percent, avg_ms),
        sent,
        received,
        loss_percent,
        min_ms,
        avg_ms,
        max_ms,
        jitter_ms,
    }
}

fn jitter_from_samples(samples: &[f64]) -> Option<f64> {
    if samples.len() < 2 {
        return None;
    }

    let total_delta = samples
        .windows(2)
        .map(|pair| (pair[1] - pair[0]).abs())
        .sum::<f64>();
    Some(total_delta / (samples.len() - 1) as f64)
}

fn ping_status(received: u32, loss_percent: f64, avg_ms: Option<f64>) -> NetworkHealthStatus {
    if received == 0 {
        NetworkHealthStatus::Offline
    } else if loss_percent >= 5.0 || avg_ms.unwrap_or_default() >= 150.0 {
        NetworkHealthStatus::Degraded
    } else {
        NetworkHealthStatus::Healthy
    }
}
