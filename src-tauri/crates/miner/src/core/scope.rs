use url::Url;

/// 判断发现的链接是否在允许的抓取范围内
pub fn is_url_allowed(target_url: &str, allowed_prefix: &str) -> bool {
    // 1. 必须以指定的 URL 前缀开头（完美解决你提的需求）
    if !target_url.starts_with(allowed_prefix) {
        return false;
    }

    // 2. 过滤掉无用的资源或锚点链接
    if target_url.contains('#') {
        // 如果只是当前页面的锚点跳转，不作为新页面抓取
        let base_target = target_url.split('#').next().unwrap_or(target_url);
        let base_prefix = allowed_prefix.split('#').next().unwrap_or(allowed_prefix);
        if base_target == base_prefix {
            return false;
        }
    }

    // 3. 排除多媒体或文件下载链接
    let lower_url = target_url.to_lowercase();
    let ext_blacklist = [".png", ".jpg", ".pdf", ".zip", ".tar.gz", ".exe", ".mp4"];
    for ext in ext_blacklist.iter() {
        if lower_url.ends_with(ext) {
            return false;
        }
    }

    true
}

/// 规范化 URL（去除 UTM 参数等噪音，防止同一页面被抓多次）
pub fn normalize_url(raw_url: &str) -> String {
    if let Ok(mut parsed) = Url::parse(raw_url) {
        // 移除诸如 ?utm_source=xxx 这样的追踪参数
        let mut query_pairs: Vec<(String, String)> = parsed.query_pairs().into_owned().collect();
        query_pairs.retain(|(k, _)| !k.starts_with("utm_"));

        parsed.query_pairs_mut().clear();
        for (k, v) in query_pairs {
            parsed.query_pairs_mut().append_pair(&k, &v);
        }

        // 移除 fragment 锚点 (#)
        parsed.set_fragment(None);

        parsed.into()
    } else {
        raw_url.to_string()
    }
}
