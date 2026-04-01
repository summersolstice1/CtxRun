pub struct TrayMenuTexts {
    pub quit: &'static str,
}

pub fn normalize_tray_language(language: &str) -> &'static str {
    let normalized = language.trim().to_ascii_lowercase();
    if normalized == "en" || normalized.starts_with("en-") || normalized.starts_with("en_") {
        "en"
    } else {
        "zh"
    }
}

pub fn tray_menu_texts(language: &str) -> TrayMenuTexts {
    match normalize_tray_language(language) {
        "en" => TrayMenuTexts { quit: "Quit" },
        _ => TrayMenuTexts { quit: "退出" },
    }
}
