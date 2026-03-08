use std::{fs, path::PathBuf};

fn read_crate_file(relative_to_crates_dir: &str) -> String {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let crates_dir = manifest_dir
        .parent()
        .expect("workspace-tests should be inside crates/")
        .to_path_buf();

    let target = crates_dir.join(relative_to_crates_dir);
    fs::read_to_string(&target).unwrap_or_else(|e| {
        panic!(
            "failed to read source file {}: {}",
            target.display(),
            e
        )
    })
}

#[test]
fn centralized_automator_browser_connection_no_longer_uses_expect_panics() {
    let src = read_crate_file("automator/src/browser.rs");

    assert!(
        src.contains("fn browser_ref(&self, context: &str) -> Result<&Browser>"),
        "browser.rs should expose browser_ref helper returning Result"
    );
    assert!(
        src.contains("fn browser_mut(&mut self, context: &str) -> Result<&mut Browser>"),
        "browser.rs should expose browser_mut helper returning Result"
    );
    assert!(
        src.contains("fn into_tab_session(mut self, page: Page) -> Result<TabSession>"),
        "into_tab_session should return Result<TabSession>"
    );
    assert!(
        !src.contains(".expect(\"BrowserConnection missing browser"),
        "browser connection path must avoid expect panic points"
    );
}
