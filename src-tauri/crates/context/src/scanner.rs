use crate::error::{ContextError, Result};
use ignore::gitignore::{Gitignore, GitignoreBuilder};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

const DEFAULT_MAX_DEPTH: usize = 24;
const DEFAULT_MAX_ENTRIES: usize = 100_000;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanIgnoreConfig {
    pub dirs: Vec<String>,
    pub files: Vec<String>,
    pub extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanNode {
    pub id: String,
    pub name: String,
    pub path: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    pub is_selected: bool,
    pub is_expanded: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_locked: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ignore_source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<ScanNode>>,
}

#[derive(Debug)]
struct ScanConfig {
    ignore_dir_names: HashSet<String>,
    ignore_dir_paths: Vec<String>,
    ignore_file_names: HashSet<String>,
    ignore_file_paths: Vec<String>,
    ignore_exts: HashSet<String>,
    protocol_ignore: Option<Gitignore>,
    max_depth: usize,
    max_entries: usize,
}

#[derive(Debug, Default)]
struct ScanState {
    entries: usize,
    capped: bool,
}

impl ScanConfig {
    fn from_input(
        root: &Path,
        ignore: ScanIgnoreConfig,
        sync_ignore_files: bool,
        max_depth: Option<usize>,
        max_entries: Option<usize>,
    ) -> Self {
        let mut ignore_dir_names = HashSet::new();
        let mut ignore_dir_paths = Vec::new();
        for raw in ignore.dirs {
            let rule = normalize_rule(&raw);
            if rule.is_empty() {
                continue;
            }
            if rule.contains('/') {
                ignore_dir_paths.push(rule);
            } else {
                ignore_dir_names.insert(rule);
            }
        }

        let mut ignore_file_names = HashSet::new();
        let mut ignore_file_paths = Vec::new();
        for raw in ignore.files {
            let rule = normalize_rule(&raw);
            if rule.is_empty() {
                continue;
            }
            if rule.contains('/') {
                ignore_file_paths.push(rule);
            } else {
                ignore_file_names.insert(rule);
            }
        }

        let ignore_exts = ignore
            .extensions
            .into_iter()
            .map(|s| s.trim_start_matches('.').to_ascii_lowercase())
            .collect::<HashSet<_>>();

        let protocol_ignore = if sync_ignore_files {
            Some(build_protocol_ignore(root))
        } else {
            None
        };

        Self {
            ignore_dir_names,
            ignore_dir_paths,
            ignore_file_names,
            ignore_file_paths,
            ignore_exts,
            protocol_ignore,
            max_depth: max_depth.unwrap_or(DEFAULT_MAX_DEPTH),
            max_entries: max_entries.unwrap_or(DEFAULT_MAX_ENTRIES),
        }
    }

    fn is_config_ignored(&self, name_lower: &str, rel_path_lower: &str, is_dir: bool) -> bool {
        if is_dir {
            if self.ignore_dir_names.contains(name_lower) {
                return true;
            }
            return self
                .ignore_dir_paths
                .iter()
                .any(|rule| rel_path_lower == rule || rel_path_lower.starts_with(&(rule.clone() + "/")));
        }

        if self.ignore_file_names.contains(name_lower) {
            return true;
        }

        if self.ignore_file_paths.iter().any(|rule| rel_path_lower == rule) {
            return true;
        }

        let ext = name_lower
            .rsplit_once('.')
            .map(|(_, ext)| ext)
            .unwrap_or_default()
            .to_string();
        if ext.is_empty() {
            return false;
        }
        self.ignore_exts.contains(&ext)
    }

    fn is_protocol_ignored(&self, path: &Path, is_dir: bool) -> bool {
        self.protocol_ignore
            .as_ref()
            .map(|matcher| matcher.matched(path, is_dir).is_ignore())
            .unwrap_or(false)
    }
}

fn normalize_rule(raw: &str) -> String {
    raw.trim()
        .replace('\\', "/")
        .trim_matches('/')
        .to_ascii_lowercase()
}

fn build_protocol_ignore(root: &Path) -> Gitignore {
    let mut builder = GitignoreBuilder::new(root);
    for file in [".gitignore", ".ctxrunignore", ".npmignore", ".dockerignore"] {
        let p = root.join(file);
        if p.exists() {
            builder.add(p);
        }
    }
    builder.build().unwrap_or_else(|_| Gitignore::empty())
}

pub fn scan_project_tree(
    project_root: String,
    ignore: ScanIgnoreConfig,
    sync_ignore_files: bool,
    max_depth: Option<usize>,
    max_entries: Option<usize>,
) -> Result<Vec<ScanNode>> {
    let root = PathBuf::from(&project_root);
    if !root.exists() {
        return Err(ContextError::IoError(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Project path not found",
        )));
    }
    if !root.is_dir() {
        return Err(ContextError::IoError(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Project path is not a directory",
        )));
    }

    let cfg = ScanConfig::from_input(&root, ignore, sync_ignore_files, max_depth, max_entries);
    let mut state = ScanState::default();
    Ok(scan_dir(&root, "", 0, &cfg, &mut state, false))
}

fn scan_dir(
    dir: &Path,
    rel_dir_lower: &str,
    depth: usize,
    cfg: &ScanConfig,
    state: &mut ScanState,
    parent_git_ignored: bool,
) -> Vec<ScanNode> {
    if state.capped || depth > cfg.max_depth {
        return Vec::new();
    }

    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };

    let mut nodes = Vec::new();

    for entry_res in entries {
        if state.capped {
            break;
        }

        let Ok(entry) = entry_res else {
            continue;
        };

        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if file_type.is_symlink() {
            continue;
        }

        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.is_empty() {
            continue;
        }
        let name_lower = name.to_ascii_lowercase();
        let rel_path_lower = if rel_dir_lower.is_empty() {
            name_lower.clone()
        } else {
            format!("{}/{}", rel_dir_lower, name_lower)
        };

        let is_dir = file_type.is_dir();

        if cfg.is_config_ignored(&name_lower, &rel_path_lower, is_dir) {
            continue;
        }

        if state.entries >= cfg.max_entries {
            state.capped = true;
            break;
        }
        state.entries += 1;

        let git_ignored = parent_git_ignored || cfg.is_protocol_ignored(&path, is_dir);
        let ignore_source = if git_ignored {
            Some("git".to_string())
        } else {
            None
        };
        let is_locked = if git_ignored { Some(true) } else { None };
        let path_str = path.to_string_lossy().to_string();

        if is_dir {
            // For git-ignored directories we keep a locked placeholder node but skip deep recursion.
            let children = if git_ignored || depth >= cfg.max_depth {
                Vec::new()
            } else {
                scan_dir(&path, &rel_path_lower, depth + 1, cfg, state, git_ignored)
            };

            nodes.push(ScanNode {
                id: path_str.clone(),
                name,
                path: path_str,
                kind: "dir".to_string(),
                size: None,
                is_selected: !git_ignored,
                is_expanded: false,
                is_locked,
                ignore_source,
                children: Some(children),
            });
        } else {
            let size = entry.metadata().map(|m| m.len()).ok();
            nodes.push(ScanNode {
                id: path_str.clone(),
                name,
                path: path_str,
                kind: "file".to_string(),
                size,
                is_selected: !git_ignored,
                is_expanded: false,
                is_locked,
                ignore_source,
                children: None,
            });
        }
    }

    nodes.sort_by(|a, b| match (a.kind.as_str(), b.kind.as_str()) {
        ("dir", "file") => Ordering::Less,
        ("file", "dir") => Ordering::Greater,
        _ => a
            .name
            .to_ascii_lowercase()
            .cmp(&b.name.to_ascii_lowercase()),
    });

    nodes
}
