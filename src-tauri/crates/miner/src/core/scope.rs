// src-tauri/crates/miner/src/core/scope.rs
use url::Url;

/// 判断发现的链接是否在允许的抓取范围内
pub fn is_url_allowed(target_url: &str, allowed_prefix: &str) -> bool {
    // 1. 严格的前缀匹配
    if !target_url.starts_with(allowed_prefix) {
        return false;
    }

    // 2. 排除非 HTML 资源
    let lower = target_url.to_lowercase();
    let blacklist = [
        ".png", ".jpg", ".jpeg", ".gif", ".svg",
        ".pdf", ".zip", ".tar", ".gz", ".exe", ".dmg", ".iso",
        ".css", ".js", ".json", ".xml", ".ico",
        "/source/", // docs.rs 特有：如果不想要源代码页面，可以过滤这个
        "src/"      // 同上
    ];

    for ext in blacklist.iter() {
        if lower.contains(ext) {
            return false;
        }
    }

    true
}

/// 规范化 URL（彻底去重）
pub fn normalize_url(raw_url: &str) -> String {
    match Url::parse(raw_url) {
        Ok(mut parsed) => {
            // 1. 强制移除所有锚点 (Fragment) -> 解决 docs.rs 链接爆炸的核心
            parsed.set_fragment(None);

            // 2. 清理查询参数 (对于静态文档站，通常查询参数也是多余的)
            // 如果你需要支持某些带参数的文档（如 php?id=1），请注释掉下面这行
            parsed.set_query(None);

            // 3. 移除末尾的斜杠，统一标准 (docs/ 和 docs 视为同一个)
            let mut path = parsed.path().to_string();
            if path.len() > 1 && path.ends_with('/') {
                path.pop();
                parsed.set_path(&path);
            }

            parsed.to_string()
        },
        Err(_) => raw_url.to_string()
    }
}
