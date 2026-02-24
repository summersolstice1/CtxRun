const COMMANDS: &[&str] = &[
    "start_mining",
    "stop_mining",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
