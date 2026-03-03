fn main() {
    tauri_plugin::Builder::new(&[
        "get_refinery_history",
        "get_refinery_item_detail",
        "get_refinery_statistics",
        "toggle_refinery_pin",
        "delete_refinery_items",
        "clear_refinery_history",
        "copy_refinery_text",
        "copy_refinery_image",
        "create_note",
        "update_note",
        "spotlight_paste",
        "update_cleanup_config",
        "manual_cleanup",
    ])
    .build();
}
