use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

use crate::error::{OcrServiceError, Result};

pub const OCR_PROFILE: &str = "ppocrv5_mobile";
pub const OCR_DIR_NAME: &str = "ocr";
pub const MODELS_DIR_NAME: &str = "models";
pub const DET_MODEL_FILE: &str = "PP-OCRv5_mobile_det.mnn";
pub const REC_MODEL_FILE: &str = "PP-OCRv5_mobile_rec.mnn";
pub const CHARSET_FILE: &str = "ppocr_keys_v5.txt";
pub const ORI_MODEL_FILE: &str = "PP-LCNet_x1_0_doc_ori.mnn";

#[derive(Debug, Clone)]
pub struct OcrModelPaths {
    pub app_dir: PathBuf,
    pub models_root: PathBuf,
    pub profile_dir: PathBuf,
    pub det_model: PathBuf,
    pub rec_model: PathBuf,
    pub charset: PathBuf,
    pub ori_model: PathBuf,
}

impl OcrModelPaths {
    pub fn from_app_dir(app_dir: impl AsRef<Path>) -> Self {
        let app_dir = app_dir.as_ref().to_path_buf();
        let models_root = app_dir.join(MODELS_DIR_NAME).join(OCR_DIR_NAME);
        let profile_dir = models_root.join(OCR_PROFILE);

        Self {
            app_dir,
            models_root,
            det_model: profile_dir.join(DET_MODEL_FILE),
            rec_model: profile_dir.join(REC_MODEL_FILE),
            charset: profile_dir.join(CHARSET_FILE),
            ori_model: profile_dir.join(ORI_MODEL_FILE),
            profile_dir,
        }
    }

    pub fn from_app<R: Runtime>(app: &AppHandle<R>) -> Result<Self> {
        let app_dir = app
            .path()
            .app_local_data_dir()
            .map_err(|err| OcrServiceError::ModelDirectoryUnavailable(err.to_string()))?;
        Ok(Self::from_app_dir(app_dir))
    }

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

        missing
    }

    pub fn is_complete(&self) -> bool {
        self.missing_files().is_empty()
    }

    pub fn ensure_profile_dir(&self) -> Result<()> {
        std::fs::create_dir_all(&self.profile_dir)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_profile_paths_under_app_data_models_dir() {
        let paths = OcrModelPaths::from_app_dir(PathBuf::from("C:/data/com.ctxrun"));

        assert_eq!(
            paths.models_root,
            PathBuf::from("C:/data/com.ctxrun/models/ocr")
        );
        assert_eq!(
            paths.profile_dir,
            PathBuf::from("C:/data/com.ctxrun/models/ocr/ppocrv5_mobile")
        );
        assert_eq!(
            paths.det_model,
            PathBuf::from("C:/data/com.ctxrun/models/ocr/ppocrv5_mobile/PP-OCRv5_mobile_det.mnn")
        );
        assert_eq!(
            paths.ori_model,
            PathBuf::from("C:/data/com.ctxrun/models/ocr/ppocrv5_mobile/PP-LCNet_x1_0_doc_ori.mnn")
        );
    }

    #[test]
    fn reports_missing_files_for_incomplete_profile() {
        let mut root = std::env::temp_dir();
        root.push(format!("ctxrun-ocr-paths-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);

        let paths = OcrModelPaths::from_app_dir(&root);
        std::fs::create_dir_all(&paths.profile_dir).expect("create profile dir");
        std::fs::write(&paths.det_model, b"det").expect("write det model");
        std::fs::write(&paths.rec_model, b"rec").expect("write rec model");

        let missing = paths.missing_files();
        assert_eq!(missing.len(), 2);
        assert!(missing.contains(&CHARSET_FILE.to_string()));
        assert!(missing.contains(&ORI_MODEL_FILE.to_string()));

        let _ = std::fs::remove_dir_all(root);
    }
}
