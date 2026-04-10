use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

use crate::error::{OcrServiceError, Result};

pub const OCR_PROFILE: &str = "ppocrv5_mobile";
pub const OCR_DIR_NAME: &str = "ocr";
pub const MODELS_DIR_NAME: &str = "models";
pub const PACKAGES_DIR_NAME: &str = "packages";
pub const ACTIVE_PACKAGE_FILE: &str = "active.json";
pub const MANIFEST_FILE: &str = "ocr.json";
pub const DET_MODEL_FILE: &str = "PP-OCRv5_mobile_det.mnn";
pub const REC_MODEL_FILE: &str = "PP-OCRv5_mobile_rec.mnn";
pub const CHARSET_FILE: &str = "ppocr_keys_v5.txt";
pub const ORI_MODEL_FILE: &str = "PP-LCNet_x1_0_doc_ori.mnn";
pub const MANIFEST_URLS: &[&str] = &[
    "https://gitee.com/winriseF/models/raw/master/models/ocr/ocr.json",
    "https://gcore.jsdelivr.net/gh/WinriseF/CtxRun@main/models/ocr/ocr.json",
    "https://raw.githubusercontent.com/WinriseF/CtxRun/main/models/ocr/ocr.json",
    "https://cdn.jsdelivr.net/gh/WinriseF/CtxRun@main/models/ocr/ocr.json",
];

#[derive(Debug, Clone)]
pub struct OcrStoragePaths {
    pub app_dir: PathBuf,
    pub models_root: PathBuf,
    pub packages_dir: PathBuf,
    pub active_package_file: PathBuf,
}

#[derive(Debug, Clone)]
pub struct OcrPackagePaths {
    pub release_tag: String,
    pub package_dir: PathBuf,
    pub det_model: PathBuf,
    pub rec_model: PathBuf,
    pub charset: PathBuf,
    pub ori_model: PathBuf,
    pub manifest_file: PathBuf,
}

impl OcrStoragePaths {
    pub fn from_app_dir(app_dir: impl AsRef<Path>) -> Self {
        let app_dir = app_dir.as_ref().to_path_buf();
        let models_root = app_dir.join(MODELS_DIR_NAME).join(OCR_DIR_NAME);
        Self {
            app_dir,
            packages_dir: models_root.join(PACKAGES_DIR_NAME),
            active_package_file: models_root.join(ACTIVE_PACKAGE_FILE),
            models_root,
        }
    }

    pub fn from_app<R: Runtime>(app: &AppHandle<R>) -> Result<Self> {
        let app_dir = app
            .path()
            .app_local_data_dir()
            .map_err(|err| OcrServiceError::ModelDirectoryUnavailable(err.to_string()))?;
        Ok(Self::from_app_dir(app_dir))
    }

    pub fn ensure_root_dirs(&self) -> Result<()> {
        std::fs::create_dir_all(&self.packages_dir)?;
        Ok(())
    }

    pub fn package(&self, release_tag: impl Into<String>) -> OcrPackagePaths {
        let release_tag = release_tag.into();
        let package_dir = self.packages_dir.join(&release_tag);
        OcrPackagePaths {
            release_tag,
            det_model: package_dir.join(DET_MODEL_FILE),
            rec_model: package_dir.join(REC_MODEL_FILE),
            charset: package_dir.join(CHARSET_FILE),
            ori_model: package_dir.join(ORI_MODEL_FILE),
            manifest_file: package_dir.join(MANIFEST_FILE),
            package_dir,
        }
    }
}

impl OcrPackagePaths {
    pub fn missing_files(&self) -> Vec<String> {
        let mut missing = Vec::new();

        if !self.det_model.is_file() {
            missing.push(DET_MODEL_FILE.to_string());
        }
        if !self.rec_model.is_file() {
            missing.push(REC_MODEL_FILE.to_string());
        }
        if !self.charset.is_file() {
            missing.push(CHARSET_FILE.to_string());
        }
        if !self.ori_model.is_file() {
            missing.push(ORI_MODEL_FILE.to_string());
        }
        if !self.manifest_file.is_file() {
            missing.push(MANIFEST_FILE.to_string());
        }

        missing
    }

    pub fn is_complete(&self) -> bool {
        self.missing_files().is_empty()
    }
}

pub fn required_model_files() -> &'static [&'static str] {
    &[DET_MODEL_FILE, REC_MODEL_FILE, CHARSET_FILE, ORI_MODEL_FILE]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_storage_paths_under_app_data_models_dir() {
        let paths = OcrStoragePaths::from_app_dir(PathBuf::from("C:/data/com.ctxrun"));

        assert_eq!(
            paths.models_root,
            PathBuf::from("C:/data/com.ctxrun/models/ocr")
        );
        assert_eq!(
            paths.packages_dir,
            PathBuf::from("C:/data/com.ctxrun/models/ocr/packages")
        );
        assert_eq!(
            paths.active_package_file,
            PathBuf::from("C:/data/com.ctxrun/models/ocr/active.json")
        );
    }

    #[test]
    fn reports_missing_files_for_incomplete_package() {
        let mut root = std::env::temp_dir();
        root.push(format!("ctxrun-ocr-paths-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);

        let storage = OcrStoragePaths::from_app_dir(&root);
        let paths = storage.package("ocr-models-20260409-abcdef0");
        std::fs::create_dir_all(&paths.package_dir).expect("create package dir");
        std::fs::write(&paths.det_model, b"det").expect("write det model");
        std::fs::write(&paths.rec_model, b"rec").expect("write rec model");

        let missing = paths.missing_files();
        assert_eq!(missing.len(), 3);
        assert!(missing.contains(&CHARSET_FILE.to_string()));
        assert!(missing.contains(&ORI_MODEL_FILE.to_string()));
        assert!(missing.contains(&MANIFEST_FILE.to_string()));

        let _ = std::fs::remove_dir_all(root);
    }
}
