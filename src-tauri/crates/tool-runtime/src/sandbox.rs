use std::path::{Component, Path, PathBuf};

use crate::runtime::ToolRuntimeError;

pub(crate) fn canonicalize_root(root_dir: &str) -> Result<PathBuf, ToolRuntimeError> {
    let trimmed = root_dir.trim();
    if trimmed.is_empty() {
        return Err(ToolRuntimeError::SandboxDenied(
            "rootDir cannot be empty.".to_string(),
        ));
    }

    let canonical = std::fs::canonicalize(trimmed).map_err(|err| {
        ToolRuntimeError::SandboxDenied(format!("Failed to resolve rootDir: {err}"))
    })?;
    if !canonical.is_dir() {
        return Err(ToolRuntimeError::SandboxDenied(
            "rootDir must be a directory.".to_string(),
        ));
    }
    Ok(canonical)
}

pub(crate) fn normalize_relative_path(input: &str) -> Result<PathBuf, ToolRuntimeError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(ToolRuntimeError::SandboxDenied(
            "filePath cannot be empty.".to_string(),
        ));
    }

    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err(ToolRuntimeError::SandboxDenied(
            "Absolute filePath is not allowed.".to_string(),
        ));
    }

    for component in path.components() {
        match component {
            Component::ParentDir => {
                return Err(ToolRuntimeError::SandboxDenied(
                    "filePath cannot contain '..'.".to_string(),
                ));
            }
            Component::Prefix(_) | Component::RootDir => {
                return Err(ToolRuntimeError::SandboxDenied(
                    "Invalid filePath root.".to_string(),
                ));
            }
            _ => {}
        }
    }

    Ok(path.to_path_buf())
}

pub(crate) fn resolve_existing_file(
    root_dir: &Path,
    relative_path: &Path,
) -> Result<PathBuf, ToolRuntimeError> {
    let joined = root_dir.join(relative_path);
    let canonical = std::fs::canonicalize(&joined).map_err(|err| {
        ToolRuntimeError::SandboxDenied(format!(
            "Failed to resolve target file '{}': {err}",
            joined.display()
        ))
    })?;

    if !canonical.starts_with(root_dir) {
        return Err(ToolRuntimeError::SandboxDenied(
            "Target path escapes rootDir.".to_string(),
        ));
    }
    if !canonical.is_file() {
        return Err(ToolRuntimeError::SandboxDenied(
            "Target path is not a regular file.".to_string(),
        ));
    }

    Ok(canonical)
}

pub(crate) fn resolve_existing_dir(
    root_dir: &Path,
    relative_path: &Path,
) -> Result<PathBuf, ToolRuntimeError> {
    let joined = root_dir.join(relative_path);
    let canonical = std::fs::canonicalize(&joined).map_err(|err| {
        ToolRuntimeError::SandboxDenied(format!(
            "Failed to resolve target directory '{}': {err}",
            joined.display()
        ))
    })?;

    if !canonical.starts_with(root_dir) {
        return Err(ToolRuntimeError::SandboxDenied(
            "Target path escapes rootDir.".to_string(),
        ));
    }
    if !canonical.is_dir() {
        return Err(ToolRuntimeError::SandboxDenied(
            "Target path is not a directory.".to_string(),
        ));
    }

    Ok(canonical)
}

pub(crate) fn resolve_existing_path(
    root_dir: &Path,
    relative_path: &Path,
) -> Result<PathBuf, ToolRuntimeError> {
    let joined = root_dir.join(relative_path);
    let canonical = std::fs::canonicalize(&joined).map_err(|err| {
        ToolRuntimeError::SandboxDenied(format!(
            "Failed to resolve target path '{}': {err}",
            joined.display()
        ))
    })?;

    if !canonical.starts_with(root_dir) {
        return Err(ToolRuntimeError::SandboxDenied(
            "Target path escapes rootDir.".to_string(),
        ));
    }
    if !canonical.exists() {
        return Err(ToolRuntimeError::SandboxDenied(
            "Target path does not exist.".to_string(),
        ));
    }

    Ok(canonical)
}
