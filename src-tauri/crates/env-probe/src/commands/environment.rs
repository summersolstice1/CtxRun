use std::sync::{Arc, Mutex};

use rayon::join;
use sysinfo::System;
use tauri::State;

use crate::env_probe::{self, AiContextReport, EnvReport};

#[tauri::command]
pub async fn get_env_info(
    system: State<'_, Arc<Mutex<System>>>,
    project_path: Option<String>,
) -> crate::error::Result<EnvReport> {
    let (
        system_info,
        (
            binaries,
            (
                browsers,
                (
                    ides,
                    (
                        languages,
                        (
                            virtualization,
                            (utilities, (managers, (npm_packages, (databases, sdks)))),
                        ),
                    ),
                ),
            ),
        ),
    ) = join(
        || env_probe::system::probe_system(system.clone()),
        || {
            join(
                || env_probe::binaries::probe_by_category("Binaries"),
                || {
                    join(env_probe::browsers::probe_browsers, || {
                        join(env_probe::ides::probe_ides, || {
                            join(
                                || env_probe::binaries::probe_by_category("Languages"),
                                || {
                                    join(
                                        || env_probe::binaries::probe_by_category("Virtualization"),
                                        || {
                                            join(
                                                || {
                                                    env_probe::binaries::probe_by_category(
                                                        "Utilities",
                                                    )
                                                },
                                                || {
                                                    join(
                                                        || {
                                                            env_probe::binaries::probe_by_category(
                                                                "Managers",
                                                            )
                                                        },
                                                        || {
                                                            join(
                                                                || {
                                                                    env_probe::npm::probe_npm_packages(
                                                                        project_path.clone(),
                                                                    )
                                                                },
                                                                || {
                                                                    join(
                                                                        || {
                                                                            env_probe::binaries::probe_by_category("Databases")
                                                                        },
                                                                        env_probe::sdks::probe_sdks,
                                                                    )
                                                                },
                                                            )
                                                        },
                                                    )
                                                },
                                            )
                                        },
                                    )
                                },
                            )
                        })
                    })
                },
            )
        },
    );

    Ok(EnvReport {
        system: Some(system_info),
        binaries,
        browsers,
        ides,
        languages,
        virtualization,
        utilities,
        managers,
        npm_packages,
        sdks,
        databases,
    })
}

#[tauri::command]
pub async fn get_ai_context(project_path: String) -> crate::error::Result<AiContextReport> {
    tauri::async_runtime::spawn_blocking(move || {
        env_probe::scan_logic::scan_ai_context(&project_path)
    })
    .await
    .map_err(|e| e.to_string())
}
