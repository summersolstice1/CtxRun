const COMMANDS: &[&str] = &[
    "ocr_get_status",
    "ocr_prepare",
    "ocr_recognize_file",
    "ocr_recognize_bytes",
    "ocr_release",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
