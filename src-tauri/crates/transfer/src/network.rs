use std::net::IpAddr;

use sysinfo::Networks;
use tokio::net::TcpListener;

use crate::error::{Result, TransferError};
use crate::models::TransferNetworkInterface;

const PORT_START: u16 = 18900;
const PORT_ATTEMPTS: u16 = 10;

pub fn list_network_interfaces() -> Vec<TransferNetworkInterface> {
    let networks = Networks::new_with_refreshed_list();
    let mut interfaces = networks
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
        .collect::<Vec<_>>();

    interfaces.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    interfaces
}

pub fn resolve_bind_address(preferred: Option<&str>) -> Result<String> {
    let interfaces = list_network_interfaces();
    if let Some(address) = preferred.map(str::trim).filter(|value| !value.is_empty()) {
        let found = interfaces
            .iter()
            .flat_map(|interface| interface.addresses.iter())
            .any(|candidate| candidate == address);
        if found {
            return Ok(address.to_string());
        }
        return Err(TransferError::InvalidBindAddress(address.to_string()));
    }

    interfaces
        .iter()
        .flat_map(|interface| interface.addresses.iter())
        .find(|candidate| {
            candidate
                .parse::<IpAddr>()
                .ok()
                .is_some_and(|addr| addr.is_ipv4() && !addr.is_loopback() && !addr.is_unspecified())
        })
        .cloned()
        .ok_or(TransferError::NoNetworkInterface)
}

pub async fn bind_listener(bind_address: &str, requested_port: Option<u16>) -> Result<(TcpListener, u16)> {
    let address: IpAddr = bind_address
        .parse()
        .map_err(|_| TransferError::InvalidBindAddress(bind_address.to_string()))?;

    if let Some(port) = requested_port {
        let listener = TcpListener::bind((address, port))
            .await
            .map_err(|_| TransferError::PortUnavailable(port))?;
        return Ok((listener, port));
    }

    for offset in 0..PORT_ATTEMPTS {
        let port = PORT_START + offset;
        if let Ok(listener) = TcpListener::bind((address, port)).await {
            return Ok((listener, port));
        }
    }

    Err(TransferError::PortUnavailable(PORT_START))
}

fn extract_ipv4_address(entry: &str) -> Option<String> {
    let candidate = entry.split('/').next()?.trim();
    let addr = candidate.parse::<IpAddr>().ok()?;
    match addr {
        IpAddr::V4(ipv4) if !ipv4.is_loopback() && !ipv4.is_unspecified() => Some(ipv4.to_string()),
        _ => None,
    }
}
