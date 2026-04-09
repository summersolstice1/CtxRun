use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::Utc;
use reqwest::blocking::Client;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, Runtime};

use crate::error::{OcrServiceError, Result};
use crate::models::{OcrActivePackage, OcrManifest, OcrManifestFile, OcrPrepareProgress};
use crate::paths::{
    MANIFEST_FILE, MANIFEST_URLS, OCR_PROFILE, OcrPackagePaths, OcrStoragePaths,
    required_model_files,
};

const OCR_PREPARE_EVENT: &str = "ocr:prepare-progress";
const HTTP_TIMEOUT: Duration = Duration::from_secs(180);
const BUFFER_SIZE: usize = 64 * 1024;

pub fn ensure_models_downloaded<R: Runtime>(
    app: &AppHandle<R>,
    storage: &OcrStoragePaths,
) -> Result<OcrPackagePaths> {
    storage.ensure_root_dirs()?;

    let (manifest_url, manifest_raw, manifest) = fetch_manifest()?;
    let release_tag = manifest.release_tag().to_string();
    let package = storage.package(release_tag.clone());

    if package.is_complete() {
        write_active_package(
            storage,
            &OcrActivePackage {
                profile_id: OCR_PROFILE.to_string(),
                release_tag,
                prepared_at: Utc::now().to_rfc3339(),
            },
        )?;
        return Ok(package);
    }

    let required_files = required_manifest_files(&manifest)?;
    let total_bytes = required_files.iter().map(|file| file.size).sum();

    emit_progress(
        app,
        OcrPrepareProgress {
            stage: "started".to_string(),
            release_tag: Some(package.release_tag.clone()),
            current_file: None,
            completed_files: 0,
            total_files: required_files.len(),
            downloaded_bytes: 0,
            total_bytes,
            message: Some(format!("Preparing OCR models from {manifest_url}")),
        },
    );

    let temp_dir = temp_package_dir(storage, &package.release_tag);
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir)?;
    }
    fs::create_dir_all(&temp_dir)?;

    let download_result = (|| -> Result<()> {
        let client = build_http_client()?;
        let mut downloaded_bytes = 0u64;

        for (index, file) in required_files.iter().enumerate() {
            download_file(
                &client,
                file,
                &temp_dir.join(&file.name),
                index,
                required_files.len(),
                &package.release_tag,
                &mut downloaded_bytes,
                total_bytes,
                app,
            )?;
        }

        fs::write(temp_dir.join(MANIFEST_FILE), manifest_raw.as_bytes())?;
        Ok(())
    })();

    if let Err(err) = download_result {
        let _ = fs::remove_dir_all(&temp_dir);
        emit_progress(
            app,
            OcrPrepareProgress {
                stage: "failed".to_string(),
                release_tag: Some(package.release_tag.clone()),
                current_file: None,
                completed_files: 0,
                total_files: required_files.len(),
                downloaded_bytes: 0,
                total_bytes,
                message: Some(err.to_string()),
            },
        );
        return Err(err);
    }

    if package.package_dir.exists() {
        ensure_package_path(storage, &package.package_dir)?;
        fs::remove_dir_all(&package.package_dir)?;
    }
    fs::rename(&temp_dir, &package.package_dir)?;

    write_active_package(
        storage,
        &OcrActivePackage {
            profile_id: OCR_PROFILE.to_string(),
            release_tag: package.release_tag.clone(),
            prepared_at: Utc::now().to_rfc3339(),
        },
    )?;

    emit_progress(
        app,
        OcrPrepareProgress {
            stage: "completed".to_string(),
            release_tag: Some(package.release_tag.clone()),
            current_file: None,
            completed_files: required_files.len(),
            total_files: required_files.len(),
            downloaded_bytes: total_bytes,
            total_bytes,
            message: Some("OCR models are ready".to_string()),
        },
    );

    Ok(package)
}

pub fn read_active_package(storage: &OcrStoragePaths) -> Result<Option<OcrActivePackage>> {
    if !storage.active_package_file.is_file() {
        return Ok(None);
    }

    let contents = fs::read_to_string(&storage.active_package_file)?;
    let active = serde_json::from_str::<OcrActivePackage>(&contents)
        .map_err(|err| OcrServiceError::ActivePackageInvalid(err.to_string()))?;

    if active.profile_id != OCR_PROFILE {
        return Err(OcrServiceError::ActivePackageInvalid(format!(
            "expected profile {OCR_PROFILE}, got {}",
            active.profile_id
        )));
    }

    Ok(Some(active))
}

fn write_active_package(storage: &OcrStoragePaths, active: &OcrActivePackage) -> Result<()> {
    storage.ensure_root_dirs()?;
    let temp_path = storage.active_package_file.with_extension("json.tmp");
    let payload = serde_json::to_vec_pretty(active)?;
    fs::write(&temp_path, payload)?;
    if storage.active_package_file.exists() {
        fs::remove_file(&storage.active_package_file)?;
    }
    fs::rename(temp_path, &storage.active_package_file)?;
    Ok(())
}

fn build_http_client() -> Result<Client> {
    Client::builder()
        .timeout(HTTP_TIMEOUT)
        .user_agent("CtxRun OCR Downloader/1.0")
        .build()
        .map_err(|err| OcrServiceError::ManifestFetchFailed(err.to_string()))
}

fn fetch_manifest() -> Result<(String, String, OcrManifest)> {
    let client = build_http_client()?;
    let mut errors = Vec::new();

    for url in MANIFEST_URLS {
        match client.get(*url).send() {
            Ok(response) => match response.error_for_status() {
                Ok(success) => match success.text() {
                    Ok(body) => match serde_json::from_str::<OcrManifest>(&body) {
                        Ok(manifest) => {
                            if manifest.release_tag().trim().is_empty() {
                                errors.push(format!("{url}: release tag is empty"));
                                continue;
                            }
                            return Ok(((*url).to_string(), body, manifest));
                        }
                        Err(err) => errors.push(format!("{url}: invalid JSON: {err}")),
                    },
                    Err(err) => errors.push(format!("{url}: failed to read body: {err}")),
                },
                Err(err) => errors.push(format!("{url}: {err}")),
            },
            Err(err) => errors.push(format!("{url}: {err}")),
        }
    }

    Err(OcrServiceError::ManifestFetchFailed(errors.join(" | ")))
}

fn required_manifest_files(manifest: &OcrManifest) -> Result<Vec<OcrManifestFile>> {
    let mut selected = Vec::new();
    let mut missing = Vec::new();

    for required in required_model_files() {
        match manifest.files.iter().find(|file| file.name == *required) {
            Some(file) => selected.push(file.clone()),
            None => missing.push((*required).to_string()),
        }
    }

    if missing.is_empty() {
        Ok(selected)
    } else {
        Err(OcrServiceError::ManifestInvalid(format!(
            "release {} is missing required files: {missing:?}",
            manifest.release_tag()
        )))
    }
}

#[allow(clippy::too_many_arguments)]
fn download_file<R: Runtime>(
    client: &Client,
    file: &OcrManifestFile,
    destination: &Path,
    index: usize,
    total_files: usize,
    release_tag: &str,
    downloaded_bytes: &mut u64,
    total_bytes: u64,
    app: &AppHandle<R>,
) -> Result<()> {
    let mut response = client
        .get(&file.url)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|err| OcrServiceError::DownloadFailed {
            file: file.name.clone(),
            reason: err.to_string(),
        })?;

    let temp_path = destination.with_extension("part");
    let mut output = fs::File::create(&temp_path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; BUFFER_SIZE];
    let mut file_bytes = 0u64;

    loop {
        let read = response
            .read(&mut buffer)
            .map_err(|err| OcrServiceError::DownloadFailed {
                file: file.name.clone(),
                reason: err.to_string(),
            })?;
        if read == 0 {
            break;
        }

        output.write_all(&buffer[..read])?;
        hasher.update(&buffer[..read]);
        file_bytes += read as u64;
        *downloaded_bytes += read as u64;

        emit_progress(
            app,
            OcrPrepareProgress {
                stage: "downloading".to_string(),
                release_tag: Some(release_tag.to_string()),
                current_file: Some(file.name.clone()),
                completed_files: index,
                total_files,
                downloaded_bytes: *downloaded_bytes,
                total_bytes,
                message: Some(format!("Downloading {}", file.name)),
            },
        );
    }

    output.flush()?;

    if file_bytes != file.size {
        let _ = fs::remove_file(&temp_path);
        return Err(OcrServiceError::DownloadFailed {
            file: file.name.clone(),
            reason: format!("expected {} bytes, got {}", file.size, file_bytes),
        });
    }

    let actual_sha256 = sha256_hex(&hasher.finalize());
    if actual_sha256 != file.sha256.to_ascii_lowercase() {
        let _ = fs::remove_file(&temp_path);
        return Err(OcrServiceError::ChecksumMismatch {
            file: file.name.clone(),
            expected: file.sha256.clone(),
            actual: actual_sha256,
        });
    }

    fs::rename(temp_path, destination)?;
    emit_progress(
        app,
        OcrPrepareProgress {
            stage: "downloaded".to_string(),
            release_tag: Some(release_tag.to_string()),
            current_file: Some(file.name.clone()),
            completed_files: index + 1,
            total_files,
            downloaded_bytes: *downloaded_bytes,
            total_bytes,
            message: Some(format!("Downloaded {}", file.name)),
        },
    );
    Ok(())
}

fn temp_package_dir(storage: &OcrStoragePaths, release_tag: &str) -> PathBuf {
    storage.packages_dir.join(format!(
        ".tmp-{release_tag}-{}-{}",
        std::process::id(),
        Utc::now().timestamp_millis()
    ))
}

fn ensure_package_path(storage: &OcrStoragePaths, package_dir: &Path) -> Result<()> {
    if package_dir.starts_with(&storage.packages_dir) {
        Ok(())
    } else {
        Err(OcrServiceError::Message(format!(
            "refusing to modify path outside OCR packages root: {}",
            package_dir.to_string_lossy()
        )))
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write as _;
        let _ = write!(&mut output, "{byte:02x}");
    }
    output
}

fn emit_progress<R: Runtime>(app: &AppHandle<R>, payload: OcrPrepareProgress) {
    let _ = app.emit(OCR_PREPARE_EVENT, payload);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_manifest() -> OcrManifest {
        serde_json::from_str(
            r#"{
              "schema_version": 1,
              "profile_id": "ocr-all-models",
              "title": "OCR model bundle",
              "version": "ocr-models-20260409-abcd123",
              "generated_at": "2026-04-09T00:00:00Z",
              "source": {
                "repository": "zibo-chen/rust-paddle-ocr",
                "branch": "next",
                "path": "models",
                "commit": "abcd1234",
                "committed_at": "2026-04-09T00:00:00Z"
              },
              "release": {
                "repository": "WinriseF/CtxRun",
                "tag": "ocr-models-20260409-abcd123",
                "url": "https://github.com/WinriseF/CtxRun/releases/tag/ocr-models-20260409-abcd123"
              },
              "files": [
                {"name":"PP-OCRv5_mobile_det.mnn","size":1,"sha256":"00","url":"https://example.com/det"},
                {"name":"PP-OCRv5_mobile_rec.mnn","size":1,"sha256":"00","url":"https://example.com/rec"},
                {"name":"ppocr_keys_v5.txt","size":1,"sha256":"00","url":"https://example.com/keys"},
                {"name":"PP-LCNet_x1_0_doc_ori.mnn","size":1,"sha256":"00","url":"https://example.com/ori"}
              ]
            }"#,
        )
        .expect("parse manifest")
    }

    #[test]
    fn selects_required_fixed_profile_files() {
        let manifest = sample_manifest();
        let files = required_manifest_files(&manifest).expect("select files");
        assert_eq!(files.len(), 4);
        assert_eq!(files[0].name, "PP-OCRv5_mobile_det.mnn");
        assert_eq!(files[3].name, "PP-LCNet_x1_0_doc_ori.mnn");
    }

    #[test]
    fn fails_when_manifest_missing_required_file() {
        let mut manifest = sample_manifest();
        manifest.files.pop();
        let err = required_manifest_files(&manifest).expect_err("missing file should fail");
        assert!(err.to_string().contains("missing required files"));
    }
}
