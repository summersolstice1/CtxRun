use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use image::DynamicImage;
use ocr_rs::{OcrEngine, OcrEngineBuilder, OcrEngineConfig};
use tauri::{AppHandle, Runtime};

use crate::download;
use crate::error::{OcrServiceError, Result};
use crate::models::{OcrBoundingBox, OcrLine, OcrPoint, OcrRecognitionResponse, OcrStatus};
use crate::paths::{OCR_PROFILE, OcrPackagePaths, OcrStoragePaths, required_model_files};
use ctxrun_runtime_utils::IdleTracker;

const OCR_IDLE_TTL: Duration = Duration::from_secs(120);
const OCR_IDLE_REAPER_INTERVAL: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdleReaperAction {
    Continue,
    Stop,
}

struct OcrServiceInner {
    engine: Mutex<Option<Arc<OcrEngine>>>,
    prepare_lock: Mutex<()>,
    init_lock: Mutex<()>,
    preparing: AtomicBool,
    idle: IdleTracker,
}

#[derive(Clone)]
pub struct OcrService {
    inner: Arc<OcrServiceInner>,
}

impl OcrService {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(OcrServiceInner {
                engine: Mutex::new(None),
                prepare_lock: Mutex::new(()),
                init_lock: Mutex::new(()),
                preparing: AtomicBool::new(false),
                idle: IdleTracker::new(OCR_IDLE_TTL),
            }),
        }
    }

    pub fn idle_reaper_interval(&self) -> Duration {
        OCR_IDLE_REAPER_INTERVAL
    }

    pub fn status<R: Runtime>(&self, app: &AppHandle<R>) -> Result<OcrStatus> {
        let storage = OcrStoragePaths::from_app(app)?;
        storage.ensure_root_dirs()?;
        let idle_snapshot = self.inner.idle.snapshot();
        let active_package = download::read_active_package(&storage)?;
        let (active_release, model_dir, installed, missing_files) = match active_package {
            Some(active) => {
                let package = storage.package(active.release_tag.clone());
                (
                    Some(active.release_tag),
                    package.package_dir.to_string_lossy().to_string(),
                    package.is_complete(),
                    package.missing_files(),
                )
            }
            None => (
                None,
                storage.packages_dir.to_string_lossy().to_string(),
                false,
                required_model_files()
                    .iter()
                    .map(|file| (*file).to_string())
                    .collect(),
            ),
        };

        Ok(OcrStatus {
            active_model: OCR_PROFILE.to_string(),
            active_release,
            model_dir,
            installed,
            loaded: self.is_loaded(),
            preparing: self.inner.preparing.load(Ordering::Relaxed),
            missing_files,
            idle_ttl_secs: idle_snapshot.ttl.as_secs(),
            idle_expires_in_ms: idle_snapshot
                .expires_in
                .map(|duration| duration.as_millis().min(u64::MAX as u128) as u64),
        })
    }

    pub fn prepare<R: Runtime>(&self, app: &AppHandle<R>) -> Result<OcrStatus> {
        let _ = self.ensure_models_prepared(app)?;
        self.status(app)
    }

    pub fn recognize_file<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        path: impl AsRef<Path>,
    ) -> Result<OcrRecognitionResponse> {
        let image = image::open(path).map_err(OcrServiceError::from)?;
        self.recognize_image(app, image)
    }

    pub fn recognize_bytes<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        bytes: &[u8],
    ) -> Result<OcrRecognitionResponse> {
        let image = image::load_from_memory(bytes).map_err(OcrServiceError::from)?;
        self.recognize_image(app, image)
    }

    pub fn release(&self) -> bool {
        let mut engine = lock_recover(&self.inner.engine);
        engine.take().is_some()
    }

    pub fn release_if_idle(&self) -> bool {
        if !self.inner.idle.is_idle_expired() {
            return false;
        }

        self.release()
    }

    pub fn idle_reaper_tick(&self) -> IdleReaperAction {
        if !self.is_loaded() {
            return IdleReaperAction::Stop;
        }

        if self.release_if_idle() {
            return IdleReaperAction::Stop;
        }

        IdleReaperAction::Continue
    }

    fn recognize_image<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        image: DynamicImage,
    ) -> Result<OcrRecognitionResponse> {
        let _lease = self.inner.idle.begin_use();
        let engine = self.ensure_engine_ready(app)?;
        let image_width = image.width();
        let image_height = image.height();
        let started_at = Instant::now();
        let results = engine
            .recognize(&image)
            .map_err(|err| OcrServiceError::RecognitionFailed(err.to_string()))?;

        Ok(build_response(
            results,
            image_width,
            image_height,
            started_at.elapsed(),
        ))
    }

    fn ensure_engine_ready<R: Runtime>(&self, app: &AppHandle<R>) -> Result<Arc<OcrEngine>> {
        if let Some(engine) = self.cached_engine() {
            self.inner.idle.touch();
            return Ok(engine);
        }

        let _guard = lock_recover(&self.inner.init_lock);
        if let Some(engine) = self.cached_engine() {
            self.inner.idle.touch();
            return Ok(engine);
        }

        let model_paths = self.require_prepared_models(app)?;
        let config = build_engine_config();
        let engine = OcrEngineBuilder::new()
            .with_det_model_path(&model_paths.det_model)
            .with_rec_model_path(&model_paths.rec_model)
            .with_charset_path(&model_paths.charset)
            .with_ori_model_path(&model_paths.ori_model)
            .with_config(config)
            .build()
            .map_err(|err| OcrServiceError::EngineInitFailed(err.to_string()))?;

        let engine = Arc::new(engine);
        *lock_recover(&self.inner.engine) = Some(engine.clone());
        self.inner.idle.touch();
        Ok(engine)
    }

    fn ensure_models_prepared<R: Runtime>(&self, app: &AppHandle<R>) -> Result<OcrPackagePaths> {
        if let Some(package) = self.resolve_active_package(app)? {
            return Ok(package);
        }

        let _guard = lock_recover(&self.inner.prepare_lock);
        if let Some(package) = self.resolve_active_package(app)? {
            return Ok(package);
        }

        self.inner.preparing.store(true, Ordering::SeqCst);
        let result = match OcrStoragePaths::from_app(app) {
            Ok(storage) => download::ensure_models_downloaded(app, &storage),
            Err(err) => Err(err),
        };
        self.inner.preparing.store(false, Ordering::SeqCst);

        let package = result?;
        if !package.is_complete() {
            return Err(OcrServiceError::missing_models(
                package.package_dir.to_string_lossy().to_string(),
                package.missing_files(),
            ));
        }

        Ok(package)
    }

    fn require_prepared_models<R: Runtime>(&self, app: &AppHandle<R>) -> Result<OcrPackagePaths> {
        let storage = OcrStoragePaths::from_app(app)?;
        storage.ensure_root_dirs()?;

        let Some(active) = download::read_active_package(&storage)? else {
            return Err(OcrServiceError::ModelsNotPrepared);
        };

        let package = storage.package(active.release_tag);
        if package.is_complete() {
            Ok(package)
        } else {
            Err(OcrServiceError::missing_models(
                package.package_dir.to_string_lossy().to_string(),
                package.missing_files(),
            ))
        }
    }

    fn resolve_active_package<R: Runtime>(
        &self,
        app: &AppHandle<R>,
    ) -> Result<Option<OcrPackagePaths>> {
        let storage = OcrStoragePaths::from_app(app)?;
        storage.ensure_root_dirs()?;

        let Some(active) = download::read_active_package(&storage)? else {
            return Ok(None);
        };

        let package = storage.package(active.release_tag);
        if package.is_complete() {
            Ok(Some(package))
        } else {
            Ok(None)
        }
    }

    fn cached_engine(&self) -> Option<Arc<OcrEngine>> {
        lock_recover(&self.inner.engine).clone()
    }

    pub fn is_loaded(&self) -> bool {
        lock_recover(&self.inner.engine).is_some()
    }
}

fn build_engine_config() -> OcrEngineConfig {
    let thread_count = std::thread::available_parallelism()
        .map(|count| count.get().clamp(2, 8) as i32)
        .unwrap_or(4);

    OcrEngineConfig::new().with_threads(thread_count)
}

fn build_response(
    results: Vec<ocr_rs::OcrResult_>,
    image_width: u32,
    image_height: u32,
    elapsed: Duration,
) -> OcrRecognitionResponse {
    let lines: Vec<OcrLine> = results
        .into_iter()
        .map(|result| OcrLine {
            text: result.text,
            confidence: result.confidence,
            bbox: OcrBoundingBox {
                left: result.bbox.rect.left(),
                top: result.bbox.rect.top(),
                width: result.bbox.rect.width(),
                height: result.bbox.rect.height(),
                score: result.bbox.score,
                points: result.bbox.points.map(|points| {
                    points
                        .into_iter()
                        .map(|point| OcrPoint {
                            x: point.x,
                            y: point.y,
                        })
                        .collect()
                }),
            },
        })
        .collect();

    let full_text = lines
        .iter()
        .map(|line| line.text.as_str())
        .collect::<Vec<_>>()
        .join("\n");

    OcrRecognitionResponse {
        model_profile: OCR_PROFILE.to_string(),
        line_count: lines.len(),
        full_text,
        lines,
        elapsed_ms: elapsed.as_millis().min(u64::MAX as u128) as u64,
        image_width,
        image_height,
    }
}

fn lock_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
