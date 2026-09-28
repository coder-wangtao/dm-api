//! 数据面请求关联键：X-Request-Id 标准化。
//!
//! 上游此前仅有自定义 `Wali-Trace-Id` 头（仅部分端点读取、缺省不生成、不回显）。
//! 本模块统一为：标准 `X-Request-Id` 优先（`Wali-Trace-Id` 继续兼容），缺省生成
//! UUIDv4，响应头回显，值随既有 `request_logs.trace_id` 列落库。
//!
//! 中间件 resolve 后把结果**回写请求头**，handler 侧调用同一 `resolve` 读到的
//! 即同一值——两级解析天然一致，不依赖请求扩展传递。

use axum::extract::Request;
use axum::http::{HeaderMap, HeaderValue};
use axum::middleware::Next;
use axum::response::Response;

/// 关联键长度上限（对齐 nginx `X-Request-Id` 的 128 惯例）。
const MAX_REQUEST_ID_LEN: usize = 128;

/// 校验候选值：非空、长度受限、全部为 ASCII 可见字符（0x21..=0x7E）。
/// 拒绝空格与控制字符可防止头注入/折行注入；拒绝非 ASCII 避免编码歧义。
/// 非法值视为「未携带」，由上层生成新 UUID。
pub fn sanitize(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_REQUEST_ID_LEN {
        return None;
    }
    if !trimmed.bytes().all(|b| (0x21..=0x7E).contains(&b)) {
        return None;
    }
    Some(trimmed.to_string())
}

/// 解析请求关联键：`X-Request-Id` 优先 → `Wali-Trace-Id` 兼容回退 → 生成 UUIDv4。
pub fn resolve(headers: &HeaderMap) -> String {
    for name in ["x-request-id", "wali-trace-id"] {
        if let Some(value) = headers.get(name).and_then(|h| h.to_str().ok()) {
            if let Some(valid) = sanitize(value) {
                return valid;
            }
        }
    }
    uuid::Uuid::new_v4().to_string()
}

/// 数据面中间件：统一解析关联键 → 回写请求头（供 handler 与日志读取）→ 响应头回显。
pub async fn middleware(mut req: Request, next: Next) -> Response {
    let id = resolve(req.headers());
    if let Ok(value) = HeaderValue::from_str(&id) {
        req.headers_mut().insert("x-request-id", value.clone());
        let mut response = next.run(req).await;
        response.headers_mut().insert("x-request-id", value);
        return response;
    }
    // sanitize 产出的值必为合法 HeaderValue，此分支仅为防御性兜底。
    next.run(req).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderName;

    fn headers(pairs: &[(&str, &str)]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for (name, value) in pairs {
            map.insert(
                HeaderName::from_bytes(name.as_bytes()).unwrap(),
                HeaderValue::from_str(value).unwrap(),
            );
        }
        map
    }

    #[test]
    fn sanitize_accepts_plain_ascii() {
        assert_eq!(sanitize("abc-123_XYZ.09"), Some("abc-123_XYZ.09".into()));
    }

    #[test]
    fn sanitize_rejects_empty_and_oversize() {
        assert_eq!(sanitize(""), None);
        assert_eq!(sanitize("   "), None);
        assert_eq!(sanitize(&"a".repeat(129)), None);
        assert_eq!(
            sanitize(&"a".repeat(128)).as_deref(),
            Some("a".repeat(128).as_str())
        );
    }

    #[test]
    fn sanitize_rejects_space_control_and_non_ascii() {
        assert_eq!(sanitize("abc def"), None);
        assert_eq!(sanitize("abc\tdef"), None);
        assert_eq!(sanitize("请求id"), None);
    }

    #[test]
    fn resolve_prefers_x_request_id_over_wali_trace_id() {
        let map = headers(&[("x-request-id", "std-1"), ("wali-trace-id", "legacy-1")]);
        assert_eq!(resolve(&map), "std-1");
    }

    #[test]
    fn resolve_falls_back_to_wali_trace_id() {
        let map = headers(&[("wali-trace-id", "legacy-2")]);
        assert_eq!(resolve(&map), "legacy-2");
    }

    #[test]
    fn resolve_generates_uuid_when_absent() {
        let id = resolve(&headers(&[]));
        assert!(
            uuid::Uuid::parse_str(&id).is_ok(),
            "应生成合法 UUIDv4：{id}"
        );
    }

    #[test]
    fn resolve_treats_invalid_value_as_absent() {
        // 非法 X-Request-Id 不透传，回退兼容头；都非法则生成新值
        let map = headers(&[("x-request-id", "bad value"), ("wali-trace-id", "ok-1")]);
        assert_eq!(resolve(&map), "ok-1");
        let map = headers(&[("x-request-id", &"x".repeat(200))]);
        assert!(uuid::Uuid::parse_str(&resolve(&map)).is_ok());
    }
}
