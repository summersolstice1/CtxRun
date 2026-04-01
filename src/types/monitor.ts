export interface SystemMetrics {
  cpu_usage: number;
  memory_used: number;
  memory_total: number;
  battery: BatteryMetrics | null;
}

export interface BatteryMetrics {
  battery_count: number;
  state: string;
  percent: number;
  health_percent: number | null;
  power_watts: number | null;
  voltage_volts: number | null;
  energy_wh: number | null;
  energy_full_wh: number | null;
  energy_design_wh: number | null;
  cycle_count: number | null;
  temperature_celsius: number | null;
  time_to_full_minutes: number | null;
  time_to_empty_minutes: number | null;
  vendor: string | null;
  model: string | null;
  technology: string | null;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu_usage: number;
  memory: number;
  user: string;
  is_system: boolean;
}

export interface PortInfo {
  port: number;
  protocol: string;
  pid: number;
  process_name: string;
  local_addr?: string;
  is_system: boolean;
}

export type NetworkHealthStatus = 'healthy' | 'degraded' | 'offline';

export interface NetworkProbeResult {
  id: string;
  name: string;
  category: string;
  url: string;
  host: string;
  status: NetworkHealthStatus;
  dns_ms: number | null;
  tcp_ms: number | null;
  http_ms: number | null;
  total_ms: number | null;
  status_code: number | null;
  ip_addresses: string[];
  observations: string[];
}

export interface NetworkPingStats {
  target: string;
  status: NetworkHealthStatus;
  sent: number;
  received: number;
  loss_percent: number;
  min_ms: number | null;
  avg_ms: number | null;
  max_ms: number | null;
  jitter_ms: number | null;
}

export interface NetworkDiagnosticsSummary {
  overall_status: NetworkHealthStatus;
  healthy_count: number;
  degraded_count: number;
  offline_count: number;
  issue_codes: string[];
}

export interface NetworkDiagnosticsReport {
  summary: NetworkDiagnosticsSummary;
  ping: NetworkPingStats | null;
  probes: NetworkProbeResult[];
}

export interface ToolInfo {
  name: string;
  version: string;
  path?: string;
  description?: string;
}

export interface EnvReport {
  system: Record<string, string> | null;
  binaries: ToolInfo[];
  browsers: ToolInfo[];
  ides: ToolInfo[];
  languages: ToolInfo[];
  virtualization: ToolInfo[];
  utilities: ToolInfo[];
  managers: ToolInfo[];
  databases: ToolInfo[];
  npm_packages: ToolInfo[];
  sdks: Record<string, string[]>;
}

export type ProjectType = 'Tauri' | 'NodeFrontend' | 'NodeBackend' | 'Rust' | 'Python' | 'Mixed';

export interface AiContextReport {
    project_type: ProjectType;
    summary: string;
    system_info: string;
    toolchain: ToolInfo[];
    dependencies: Record<string, string>;
    markdown: string;
}

export interface LockedFileProcess {
  pid: number;
  name: string;
  icon?: string;
  user: string;
  is_system: boolean;
}
