fn main() {
    let frontend_dist = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../dist");
    if let Err(err) = std::fs::create_dir_all(&frontend_dist) {
        panic!(
            "failed to create frontendDist placeholder at {}: {err}",
            frontend_dist.display()
        );
    }

    tauri_build::build()
}
