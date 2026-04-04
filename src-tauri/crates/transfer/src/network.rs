use std::cmp::Ordering;
use std::net::{IpAddr, Ipv4Addr};

use ctxrun_env_probe::commands::{NetworkInterfaceSummary, list_network_interface_summaries};
use tokio::net::TcpListener;

use crate::error::{Result, TransferError};
use crate::models::TransferNetworkInterface;

const PORT_START: u16 = 18900;
const PORT_ATTEMPTS: u16 = 10;

const VIRTUAL_ADAPTER_KEYWORDS: &[&str] = &[
    "loopback",
    "vethernet",
    "hyper-v",
    "vmware",
    "virtualbox",
    "vbox",
    "wsl",
    "docker",
    "bluetooth",
    "npcap",
    "tap-",
    "tap ",
    "tun-",
    "tun ",
    "bridge",
    "tailscale",
    "wireguard",
    "utun",
    "vnic",
    "virbr",
    "veth",
    "br-",
];

#[derive(Clone, Debug)]
struct InterfaceCandidate {
    name: String,
    addresses: Vec<String>,
    connection_status: String,
    interface_type: String,
    default_gateway: Option<String>,
    is_virtual: bool,
}

pub fn list_network_interfaces() -> Vec<TransferNetworkInterface> {
    let mut interfaces = list_interface_candidates();
    interfaces.sort_by(compare_candidates);
    interfaces
        .into_iter()
        .map(|candidate| TransferNetworkInterface {
            id: format!("{}-{}", candidate.name, candidate.addresses[0]),
            name: candidate.name,
            addresses: candidate.addresses,
        })
        .collect()
}

pub fn resolve_lan_address(preferred: Option<&str>) -> Result<String> {
    let mut interfaces = list_interface_candidates();
    interfaces.sort_by(compare_candidates);

    eprintln!(
        "[transfer] Detected {} network interface(s):",
        interfaces.len()
    );
    for iface in &interfaces {
        let virtual_flag = if iface.is_virtual { " [VIRTUAL]" } else { "" };
        let gateway = iface.default_gateway.as_deref().unwrap_or("-");
        eprintln!(
            "[transfer]   {} ({}) type={} status={} gateway={gateway}{virtual_flag}",
            iface.name,
            iface.addresses.join(", "),
            iface.interface_type,
            iface.connection_status,
        );
    }

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

    let result = select_auto_address(&interfaces)
        .map(|(addr, is_virtual)| {
            if is_virtual {
                eprintln!(
                    "[transfer] ⚠ Falling back to a virtual adapter address: {addr} (LAN transfer may fail)"
                );
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

pub async fn bind_listener(
    bind_address: &str,
    requested_port: Option<u16>,
) -> Result<(TcpListener, u16)> {
    let address: IpAddr = bind_address
        .parse()
        .map_err(|_| TransferError::InvalidBindAddress(bind_address.to_string()))?;

    if let Some(port) = requested_port {
        eprintln!("[transfer] Attempting to bind {bind_address}:{port}");
        let listener = TcpListener::bind((address, port))
            .await
            .map_err(|_| TransferError::PortUnavailable(port))?;
        eprintln!("[transfer] ✓ Bound successfully on {bind_address}:{port}");
        return Ok((listener, port));
    }

    for offset in 0..PORT_ATTEMPTS {
        let port = PORT_START + offset;
        eprintln!("[transfer] Attempting to bind {bind_address}:{port}");
        if let Ok(listener) = TcpListener::bind((address, port)).await {
            eprintln!("[transfer] ✓ Bound successfully on {bind_address}:{port}");
            return Ok((listener, port));
        }
    }

    eprintln!(
        "[transfer] ✗ All ports {PORT_START}-{} are unavailable on {bind_address}",
        PORT_START + PORT_ATTEMPTS - 1
    );
    Err(TransferError::PortUnavailable(PORT_START))
}

fn list_interface_candidates() -> Vec<InterfaceCandidate> {
    list_network_interface_summaries()
        .into_iter()
        .filter_map(candidate_from_summary)
        .collect()
}

fn candidate_from_summary(summary: NetworkInterfaceSummary) -> Option<InterfaceCandidate> {
    let mut addresses = summary
        .ip_networks
        .iter()
        .filter_map(|entry| extract_ipv4_address(entry))
        .collect::<Vec<_>>();

    addresses.sort();
    addresses.dedup();
    if addresses.is_empty() {
        return None;
    }

    let is_virtual =
        summary.is_virtual || guess_virtual_interface(&summary.name, &summary.interface_type);

    Some(InterfaceCandidate {
        name: summary.name,
        addresses,
        connection_status: summary.connection_status,
        interface_type: summary.interface_type,
        default_gateway: normalize_gateway(summary.default_gateway),
        is_virtual,
    })
}

fn compare_candidates(left: &InterfaceCandidate, right: &InterfaceCandidate) -> Ordering {
    interface_rank(left)
        .cmp(&interface_rank(right))
        .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
}

fn interface_rank(candidate: &InterfaceCandidate) -> (u8, u8, u8, u8, u8) {
    let connected = candidate.connection_status == "connected";
    let physical = !candidate.is_virtual
        && !matches!(candidate.interface_type.as_str(), "loopback" | "tunnel");
    let has_gateway = candidate.default_gateway.is_some();
    let has_private_lan = candidate
        .addresses
        .iter()
        .any(|address| parse_ipv4(address).is_some_and(|ip| is_private_lan_ipv4(&ip)));
    let has_usable_ipv4 = candidate
        .addresses
        .iter()
        .any(|address| parse_ipv4(address).is_some_and(|ip| is_usable_ipv4(&ip)));
    let interface_type_rank = match candidate.interface_type.as_str() {
        "ethernet" => 0,
        "wifi" => 1,
        "other" => 2,
        "loopback" => 3,
        "tunnel" => 4,
        _ => 5,
    };

    let class = if connected && physical && has_gateway && has_private_lan {
        0
    } else if connected && physical && has_private_lan {
        1
    } else if connected && physical && has_usable_ipv4 {
        2
    } else if connected && has_private_lan {
        3
    } else if has_private_lan {
        4
    } else if connected && has_usable_ipv4 {
        5
    } else if has_usable_ipv4 {
        6
    } else {
        7
    };

    (
        class,
        u8::from(!connected),
        u8::from(candidate.is_virtual),
        u8::from(!has_gateway),
        interface_type_rank,
    )
}

fn select_auto_address(candidates: &[InterfaceCandidate]) -> Option<(String, bool)> {
    candidates
        .iter()
        .filter_map(|candidate| select_best_address(candidate).map(|address| (candidate, address)))
        .min_by(|(left, _), (right, _)| compare_candidates(left, right))
        .map(|(candidate, address)| (address, candidate.is_virtual))
}

fn select_best_address(candidate: &InterfaceCandidate) -> Option<String> {
    let mut addresses = candidate
        .addresses
        .iter()
        .filter_map(|address| {
            let ipv4 = parse_ipv4(address)?;
            Some((address_rank(&ipv4), address))
        })
        .collect::<Vec<_>>();

    addresses.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(right.1)));
    addresses
        .into_iter()
        .find(|(rank, _)| *rank < 2)
        .map(|(_, address)| address.to_string())
}

fn address_rank(address: &Ipv4Addr) -> u8 {
    if is_private_lan_ipv4(address) {
        0
    } else if is_usable_ipv4(address) {
        1
    } else {
        2
    }
}

fn guess_virtual_interface(name: &str, interface_type: &str) -> bool {
    if matches!(interface_type, "loopback" | "tunnel") {
        return true;
    }

    let lower_name = name.to_lowercase();
    VIRTUAL_ADAPTER_KEYWORDS
        .iter()
        .any(|keyword| lower_name.contains(keyword))
}

fn normalize_gateway(gateway: Option<String>) -> Option<String> {
    let gateway = gateway?;
    let ipv4 = parse_ipv4(gateway.trim())?;
    is_usable_ipv4(&ipv4).then(|| ipv4.to_string())
}

fn parse_ipv4(value: &str) -> Option<Ipv4Addr> {
    value.parse::<Ipv4Addr>().ok()
}

fn is_private_lan_ipv4(address: &Ipv4Addr) -> bool {
    address.is_private() && !is_cgnat_ipv4(address)
}

fn is_usable_ipv4(address: &Ipv4Addr) -> bool {
    !address.is_loopback()
        && !address.is_unspecified()
        && !address.is_link_local()
        && !is_cgnat_ipv4(address)
}

fn is_cgnat_ipv4(address: &Ipv4Addr) -> bool {
    let octets = address.octets();
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

#[cfg(test)]
mod tests {
    use super::{InterfaceCandidate, select_auto_address};

    fn candidate(
        name: &str,
        addresses: &[&str],
        connection_status: &str,
        interface_type: &str,
        default_gateway: Option<&str>,
        is_virtual: bool,
    ) -> InterfaceCandidate {
        InterfaceCandidate {
            name: name.to_string(),
            addresses: addresses.iter().map(|entry| entry.to_string()).collect(),
            connection_status: connection_status.to_string(),
            interface_type: interface_type.to_string(),
            default_gateway: default_gateway.map(str::to_string),
            is_virtual,
        }
    }

    #[test]
    fn prefers_connected_physical_interface_with_gateway() {
        let candidates = vec![
            candidate(
                "vEthernet (Docker)",
                &["172.17.96.1"],
                "connected",
                "other",
                Some("172.17.96.1"),
                true,
            ),
            candidate(
                "Wi-Fi",
                &["192.168.1.24"],
                "connected",
                "wifi",
                Some("192.168.1.1"),
                false,
            ),
        ];

        let (address, is_virtual) =
            select_auto_address(&candidates).expect("should pick a LAN address");
        assert_eq!(address, "192.168.1.24");
        assert!(!is_virtual);
    }

    #[test]
    fn falls_back_to_connected_physical_without_gateway() {
        let candidates = vec![
            candidate(
                "Ethernet",
                &["192.168.50.10"],
                "connected",
                "ethernet",
                None,
                false,
            ),
            candidate(
                "Tailscale",
                &["100.101.102.103"],
                "connected",
                "tunnel",
                Some("100.100.100.100"),
                true,
            ),
        ];

        let (address, is_virtual) =
            select_auto_address(&candidates).expect("should pick the physical LAN address");
        assert_eq!(address, "192.168.50.10");
        assert!(!is_virtual);
    }

    #[test]
    fn rejects_cgnat_only_candidates() {
        let candidates = vec![candidate(
            "Tailscale",
            &["100.101.102.103"],
            "connected",
            "tunnel",
            Some("100.100.100.100"),
            true,
        )];

        assert!(select_auto_address(&candidates).is_none());
    }
}
