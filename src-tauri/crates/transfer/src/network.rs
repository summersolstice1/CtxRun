use std::net::{IpAddr, Ipv4Addr, SocketAddrV4};

use sysinfo::Networks;
use tokio::net::TcpListener;

use crate::error::{Result, TransferError};
use crate::models::TransferNetworkInterface;

const PORT_START: u16 = 18900;
const PORT_ATTEMPTS: u16 = 10;

/// Known prefixes of virtual / tunnel network adapters that should be deprioritized.
const VIRTUAL_ADAPTER_PREFIXES: &[&str] = &[
    "VMware",    // VMware virtual adapters
    "vmnet",     // VMware VMnet adapters
    "VBox",      // VirtualBox host-only adapters
    "vEthernet", // Hyper-V virtual switches
    "WSL",       // Windows Subsystem for Linux
    "Hyper-V",   // Hyper-V default switch
    "Docker",    // Docker Desktop virtual NIC
    "Loopback",  // Loopback pseudo-adapter
    "Tailscale", // Tailscale VPN
    "WireGuard", // WireGuard VPN
    "tun",       // Tunnel interfaces
    "utun",      // macOS tunnel
    "vnic",      // Virtual NIC
    "virbr",     // libvirt bridge
    "veth",      // Virtual ethernet
    "br-",       // Docker bridge
];

/// Known virtual/tunnel IP ranges that should be deprioritized.
const VIRTUAL_SUBNETS: &[(&str, &str)] = &[
    // 192.168.244.x — commonly used by VMware
    ("192.168.244", "VMware default"),
    // 172.16.x.x / 172.17.x.x — Docker / WSL
    ("172.16", "Docker/WSL"),
    ("172.17", "Docker default"),
    // 192.168.56.x — VirtualBox host-only
    ("192.168.56", "VirtualBox host-only"),
    // 192.168.99.x — Docker Machine / VirtualBox
    ("192.168.99", "Docker Machine"),
    // 100.64-127.x.x — CGNAT / Tailscale
    // We check these programmatically below
];

pub fn list_network_interfaces() -> Vec<TransferNetworkInterface> {
    let networks = Networks::new_with_refreshed_list();
    let mut interfaces: Vec<_> = networks
        .list()
        .iter()
        .filter_map(|(name, network)| {
            let addresses = network
                .ip_networks()
                .iter()
                .map(ToString::to_string)
                .filter_map(|entry| extract_ipv4_address(&entry))
                .collect::<Vec<_>>();

            if addresses.is_empty() {
                return None;
            }

            Some(TransferNetworkInterface {
                id: format!("{name}-{}", addresses[0]),
                name: name.clone(),
                addresses,
            })
        })
        .collect();

    // Sort: physical adapters first, virtual adapters last
    interfaces.sort_by(|left, right| {
        let left_virtual = is_virtual_interface(&left.name, &left.addresses);
        let right_virtual = is_virtual_interface(&right.name, &right.addresses);
        left_virtual.cmp(&right_virtual).then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    interfaces
}

/// Resolve the LAN-facing IPv4 address used for generating the QR code URL.
/// This is NOT the bind address — the server always binds to 0.0.0.0.
pub fn resolve_lan_address(preferred: Option<&str>) -> Result<String> {
    let interfaces = list_network_interfaces();

    // Log all detected interfaces for debugging
    eprintln!("[transfer] Detected {} network interface(s):", interfaces.len());
    for iface in &interfaces {
        let virtual_flag = if is_virtual_interface(&iface.name, &iface.addresses) { " [VIRTUAL]" } else { "" };
        eprintln!("[transfer]   {} ({}){virtual_flag}", iface.name, iface.addresses.join(", "));
    }

    // If user specified a preferred address, use it
    if let Some(address) = preferred.map(str::trim).filter(|value| !value.is_empty()) {
        let found = interfaces
            .iter()
            .flat_map(|interface| interface.addresses.iter())
            .any(|candidate| candidate == address);
        if found {
            eprintln!("[transfer] Using preferred LAN address: {address}");
            return Ok(address.to_string());
        }
        return Err(TransferError::InvalidBindAddress(address.to_string()));
    }

    // Auto-detect: prefer physical adapters over virtual ones
    // The list is already sorted with physical first
    let result = interfaces
        .iter()
        .flat_map(|interface| {
            let is_virtual = is_virtual_interface(&interface.name, &interface.addresses);
            interface.addresses.iter().map(move |addr| (addr.clone(), is_virtual))
        })
        .find(|(candidate, _is_virtual)| {
            let addr = candidate.parse::<IpAddr>().ok();
            match addr {
                Some(addr) => {
                    addr.is_ipv4()
                        && !addr.is_loopback()
                        && !addr.is_unspecified()
                        && !is_cgnat_address(&candidate)
                }
                None => false,
            }
        })
        .map(|(addr, is_virtual)| {
            if is_virtual {
                eprintln!("[transfer] ⚠ Only virtual adapter addresses found, using {addr} (may not work for LAN transfer)");
            }
            addr
        })
        .ok_or(TransferError::NoNetworkInterface);

    if let Ok(addr) = &result {
        eprintln!("[transfer] Auto-detected LAN address: {addr}");
    } else {
        eprintln!("[transfer] ✗ No suitable LAN address found!");
    }
    result
}

/// Bind a TCP listener on 0.0.0.0 (all interfaces) so LAN devices can connect.
/// Returns the listener and the actual port bound.
pub async fn bind_listener(requested_port: Option<u16>) -> Result<(TcpListener, u16)> {
    if let Some(port) = requested_port {
        let addr = SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, port);
        eprintln!("[transfer] Attempting to bind 0.0.0.0:{port}");
        let listener = TcpListener::bind(addr)
            .await
            .map_err(|_| TransferError::PortUnavailable(port))?;
        eprintln!("[transfer] ✓ Bound successfully on 0.0.0.0:{port}");
        return Ok((listener, port));
    }

    for offset in 0..PORT_ATTEMPTS {
        let port = PORT_START + offset;
        let addr = SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, port);
        eprintln!("[transfer] Attempting to bind 0.0.0.0:{port}");
        if let Ok(listener) = TcpListener::bind(addr).await {
            eprintln!("[transfer] ✓ Bound successfully on 0.0.0.0:{port}");
            return Ok((listener, port));
        }
    }

    eprintln!("[transfer] ✗ All ports {PORT_START}-{} are unavailable", PORT_START + PORT_ATTEMPTS - 1);
    Err(TransferError::PortUnavailable(PORT_START))
}

/// Check if a network interface is likely virtual / VPN / tunnel.
fn is_virtual_interface(name: &str, addresses: &[String]) -> bool {
    let lower_name = name.to_lowercase();

    // Check by name prefix
    for prefix in VIRTUAL_ADAPTER_PREFIXES {
        if lower_name.starts_with(&prefix.to_lowercase()) {
            return true;
        }
    }

    // Check by IP subnet
    for addr in addresses {
        for (subnet, _label) in VIRTUAL_SUBNETS {
            if addr.starts_with(subnet) {
                return true;
            }
        }
    }

    false
}

/// Check if an IP is in the CGNAT range (100.64.0.0/10) used by Tailscale/etc.
fn is_cgnat_address(addr: &str) -> bool {
    let octets: Vec<u8> = addr
        .split('.')
        .filter_map(|o| o.parse::<u8>().ok())
        .collect();
    if octets.len() != 4 {
        return false;
    }
    // 100.64.0.0 – 100.127.255.255
    octets[0] == 100 && (64..=127).contains(&octets[1])
}

fn extract_ipv4_address(entry: &str) -> Option<String> {
    let candidate = entry.split('/').next()?.trim();
    let addr = candidate.parse::<IpAddr>().ok()?;
    match addr {
        IpAddr::V4(ipv4) if !ipv4.is_loopback() && !ipv4.is_unspecified() => Some(ipv4.to_string()),
        _ => None,
    }
}
