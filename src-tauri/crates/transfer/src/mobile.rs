const MOBILE_TEMPLATE: &str = include_str!("mobile_template.html");

pub fn render_mobile_page(ws_path: &str, pin_required: bool) -> String {
    MOBILE_TEMPLATE
        .replace("__WS_PATH__", ws_path)
        .replace("__PIN_REQUIRED__", if pin_required { "true" } else { "false" })
        .replace("__COOKIE_NAME__", crate::server::SESSION_COOKIE_NAME)
}
