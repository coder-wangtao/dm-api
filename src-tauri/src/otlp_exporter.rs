//! OTLP/HTTP JSON 导出器：把 request_log 增量导出为 OTLP span。
//!
//! 设计取舍（对应 issue 叙事）：
//! - **不引 opentelemetry SDK**——OTLP/HTTP JSON 是稳定的 protobuf-JSON 映射，
//!   用既有 HTTP 客户端直发即可，避免为旁路功能引入全家桶依赖。
//! - **seq 游标增量 + 断点续传**——游标持久化在设置存储，重启后从上次位置继续；
//!   导出失败游标不推进（at-least-once 语义，接收端按 spanId 幂等去重，
//!   spanId 由日志行 id 确定性派生）。
//! - **纯旁路**——任何失败只记 tracing 并退避，绝不影响请求主链路。
//! - 时间戳用 v0.3.0 的 `started_at`（无则回退 `created_at`）。

use crate::settings_store::SettingsStore;
use sqlx::{Row, SqlitePool};
use std::time::Duration;

const DEFAULT_INTERVAL_SECS: u64 = 30;
const MAX_INTERVAL_SECS: u64 = 600;
const DEFAULT_BATCH_SIZE: i64 = 50;
const CURSOR_KEY: &str = "otlp.export_cursor";

/// 导出循环读取的日志行（只取 span 映射需要的列，避免整行反序列化）。
struct ExportLogRow {
    seq: i64,
    id: String,
    trace_id: Option<String>,
    started_at: Option<String>,
    created_at: String,
    model: String,
    upstream_model: Option<String>,
    prompt_tokens: i64,
    completion_tokens: i64,
    total_tokens: i64,
    cached_tokens: i64,
    duration_ms: i64,
    status_code: i64,
    is_stream: i64,
    is_retry: i64,
    channel_name: Option<String>,
    api_key_name: Option<String>,
}

async fn fetch_rows_after(
    pool: &SqlitePool,
    after_seq: i64,
    limit: i64,
) -> sqlx::Result<Vec<ExportLogRow>> {
    let rows = sqlx::query(
        "SELECT seq, id, trace_id, started_at, created_at, model, upstream_model, \
         prompt_tokens, completion_tokens, total_tokens, cached_tokens, duration_ms, \
         status_code, is_stream, is_retry, channel_name, api_key_name \
         FROM request_logs WHERE seq > ? ORDER BY seq ASC LIMIT ?",
    )
    .bind(after_seq)
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| ExportLogRow {
            seq: r.get("seq"),
            id: r.get("id"),
            trace_id: r.get("trace_id"),
            started_at: r.get("started_at"),
            created_at: r.get("created_at"),
            model: r.get("model"),
            upstream_model: r.get("upstream_model"),
            prompt_tokens: r.get("prompt_tokens"),
            completion_tokens: r.get("completion_tokens"),
            total_tokens: r.get("total_tokens"),
            cached_tokens: r.get("cached_tokens"),
            duration_ms: r.get("duration_ms"),
            status_code: r.get("status_code"),
            is_stream: r.get("is_stream"),
            is_retry: r.get("is_retry"),
            channel_name: r.get("channel_name"),
            api_key_name: r.get("api_key_name"),
        })
        .collect())
}

fn attribute(key: &str, string_value: &str) -> serde_json::Value {
    serde_json::json!({"key": key, "value": {"stringValue": string_value}})
}

fn attribute_int(key: &str, value: i64) -> serde_json::Value {
    attribute(key, &value.to_string())
}

/// traceId 派生：trace_id 是 UUID 则去连字符取 32 hex；
/// 否则（遗留空值）用日志行 id 同法派生——两条路径都是确定性的，
/// 重试重发时 traceId/spanId 稳定，接收端可幂等去重。
fn trace_id_hex(row: &ExportLogRow) -> String {
    let source = row.trace_id.as_deref().unwrap_or(&row.id);
    let hex: String = source.chars().filter(|c| *c != '-').collect();
    if hex.len() == 32 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        hex.to_lowercase()
    } else {
        // 非 UUID 形态：按字符折叠为 32 位 hex（确定性兜底，不追求密码学性质）
        let mut out = String::with_capacity(32);
        for (i, b) in source.bytes().enumerate() {
            if out.len() >= 32 {
                break;
            }
            out.push_str(&format!("{:02x}", b.wrapping_add(i as u8)));
        }
        while out.len() < 32 {
            out.push('0');
        }
        out
    }
}

fn span_id_hex(row: &ExportLogRow) -> String {
    trace_id_hex(row).split_at(16).0.to_string()
}

fn unix_nanos(timestamp: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(timestamp)
        .ok()?
        .timestamp_nanos_opt()
}

/// 单行日志 → OTLP span JSON（纯函数，单测覆盖）。
fn span_from_row(row: &ExportLogRow) -> serde_json::Value {
    let start_ts = row
        .started_at
        .as_deref()
        .and_then(unix_nanos)
        .or_else(|| unix_nanos(&row.created_at));
    let (start, end) = match start_ts {
        Some(s) => (s, s + row.duration_ms * 1_000_000),
        // 落库时间不可解析时仍要导出（时间戳缺省 0，属性里有原始字段兜底）
        None => (0, row.duration_ms * 1_000_000),
    };
    let mut attributes = vec![
        attribute("model", &row.model),
        attribute(
            "upstream_model",
            row.upstream_model.as_deref().unwrap_or(""),
        ),
        attribute_int("prompt_tokens", row.prompt_tokens),
        attribute_int("completion_tokens", row.completion_tokens),
        attribute_int("total_tokens", row.total_tokens),
        attribute_int("cached_tokens", row.cached_tokens),
        attribute_int("duration_ms", row.duration_ms),
        attribute_int("status_code", row.status_code),
        attribute_int("is_stream", row.is_stream),
        attribute_int("is_retry", row.is_retry),
        attribute("channel", row.channel_name.as_deref().unwrap_or("")),
        attribute("api_key", row.api_key_name.as_deref().unwrap_or("")),
    ];
    if let Some(started) = row.started_at.as_deref() {
        attributes.push(attribute("started_at", started));
    }
    serde_json::json!({
        "traceId": trace_id_hex(row),
        "spanId": span_id_hex(row),
        "name": format!("waliapi {}", row.model),
        "kind": 2, // SERVER
        "startTimeUnixNano": start.to_string(),
        "endTimeUnixNano": end.to_string(),
        "attributes": attributes,
        "status": {"code": if row.status_code >= 400 { 2 } else { 1 }},
    })
}

fn export_payload(rows: &[ExportLogRow]) -> serde_json::Value {
    serde_json::json!({
        "resourceSpans": [{
            "resource": {
                "attributes": [attribute("service.name", "waliapi")]
            },
            "scopeSpans": [{
                "scope": {"name": "waliapi.otlp-exporter", "version": "1"},
                "spans": rows.iter().map(span_from_row).collect::<Vec<_>>(),
            }]
        }]
    })
}

fn parse_headers(raw: &str) -> Vec<(String, String)> {
    serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(raw)
        .map(|map| {
            map.into_iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        })
        .unwrap_or_default()
}

/// 单步导出：读游标 → 拉一批 → POST → 成功才推进游标。
/// 测试与循环共用；失败返回 Err 且游标不动。
pub async fn export_once(
    pool: &SqlitePool,
    settings: &SettingsStore,
    client: &reqwest::Client,
) -> Result<u64, String> {
    let endpoint = settings.get_str("otlp.endpoint", "");
    if endpoint.trim().is_empty() {
        return Err("otlp.endpoint 未配置".to_string());
    }
    let batch_size = settings.get_u64("otlp.batch_size", DEFAULT_BATCH_SIZE as u64) as i64;
    let cursor = settings.get_u64(CURSOR_KEY, 0) as i64;
    let rows = fetch_rows_after(pool, cursor, batch_size.max(1))
        .await
        .map_err(|e| format!("读取待导出行失败: {e}"))?;
    if rows.is_empty() {
        return Ok(0);
    }
    let payload = export_payload(&rows);
    let mut request = client
        .post(&endpoint)
        .header("content-type", "application/json")
        .json(&payload);
    for (name, value) in parse_headers(&settings.get_str("otlp.headers", "")) {
        request = request.header(&name, &value);
    }
    let response = request
        .send()
        .await
        .map_err(|e| format!("OTLP 导出请求失败: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("OTLP 端点返回 {}", response.status()));
    }
    let max_seq = rows.last().map(|r| r.seq).unwrap_or(cursor);
    settings
        .set_many(&[(CURSOR_KEY.to_string(), serde_json::json!(max_seq))])
        .map_err(|e| format!("游标持久化失败: {e}"))?;
    Ok(rows.len() as u64)
}

/// 后台导出循环：关闭时零流量；失败按连续失败次数指数退避（封顶 10 分钟）。
pub async fn run_export_loop(pool: SqlitePool, settings: SettingsStore) {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .unwrap_or_default();
    let base_interval = Duration::from_secs(
        settings
            .get_u64("otlp.export_interval_secs", DEFAULT_INTERVAL_SECS)
            .max(5),
    );
    let mut consecutive_failures: u32 = 0;
    loop {
        let enabled = settings.get_bool("otlp.enabled", false);
        if enabled {
            match export_once(&pool, &settings, &client).await {
                Ok(n) => {
                    if n > 0 {
                        tracing::info!("[OTLP] 导出 {n} 条 request_log span");
                    }
                    consecutive_failures = 0;
                }
                Err(e) => {
                    // 纯旁路：只记日志并退避，绝不影响请求主链路
                    consecutive_failures = consecutive_failures.saturating_add(1);
                    tracing::warn!(
                        "[OTLP] 导出失败（第 {consecutive_failures} 次，退避重试）: {e}"
                    );
                }
            }
        }
        let backoff_secs = if consecutive_failures == 0 {
            base_interval.as_secs()
        } else {
            (base_interval
                .as_secs()
                .saturating_mul(1u64 << consecutive_failures.min(6)))
            .min(MAX_INTERVAL_SECS)
        };
        tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::routing::post;
    use axum::Router;
    use sqlx::Row;
    use std::sync::{Arc, Mutex};
    use tower::ServiceExt;

    async fn memory_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    fn test_row(seq_offset: i64) -> (i64, serde_json::Value) {
        // 返回 (期望 seq, 插入用的 JSON 全字段)
        let id = uuid::Uuid::new_v4().to_string();
        let trace = uuid::Uuid::new_v4().to_string();
        (
            seq_offset,
            serde_json::json!({
                "id": id, "seq": seq_offset, "trace_id": trace,
                "started_at": "2026-09-09T08:00:00+00:00",
                "created_at": "2026-09-09T08:00:01+00:00",
                "model": "gpt-test", "upstream_model": "gpt-up",
                "prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15,
                "cached_tokens": 2, "duration_ms": 1200, "status_code": 200,
                "is_stream": 1, "is_retry": 0,
                "channel_name": "ch-a", "api_key_name": "key-b",
            }),
        )
    }

    async fn insert_row(pool: &SqlitePool, seq: i64, fields: &serde_json::Value) {
        sqlx::query(
            "INSERT INTO request_logs (id, seq, model, mode, status_code, prompt_tokens, \
             completion_tokens, total_tokens, cached_tokens, duration_ms, is_stream, is_retry, \
             created_at, risk_level, security_action, upstream_type, trace_id, started_at, \
             upstream_model, channel_name, api_key_name) \
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(fields["id"].as_str().unwrap())
        .bind(seq)
        .bind(fields["model"].as_str().unwrap())
        .bind("chat")
        .bind(fields["status_code"].as_i64().unwrap())
        .bind(fields["prompt_tokens"].as_i64().unwrap())
        .bind(fields["completion_tokens"].as_i64().unwrap())
        .bind(fields["total_tokens"].as_i64().unwrap())
        .bind(fields["cached_tokens"].as_i64().unwrap())
        .bind(fields["duration_ms"].as_i64().unwrap())
        .bind(fields["is_stream"].as_i64().unwrap())
        .bind(fields["is_retry"].as_i64().unwrap())
        .bind(fields["created_at"].as_str().unwrap())
        .bind("low")
        .bind("audit")
        .bind("channel")
        .bind(fields["trace_id"].as_str())
        .bind(fields["started_at"].as_str())
        .bind(fields["upstream_model"].as_str())
        .bind(fields["channel_name"].as_str())
        .bind(fields["api_key_name"].as_str())
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn span_mapping_carries_all_attributes_and_deterministic_ids() {
        let pool = memory_pool().await;
        let (_, fields) = test_row(1);
        insert_row(&pool, 1, &fields).await;
        let rows = fetch_rows_after(&pool, 0, 10).await.unwrap();
        assert_eq!(rows.len(), 1);
        let span = span_from_row(&rows[0]);

        // traceId/spanId 确定性派生自 UUID（去连字符）
        let expected_trace = fields["trace_id"].as_str().unwrap().replace('-', "");
        assert_eq!(span["traceId"], serde_json::json!(expected_trace));
        assert_eq!(span["spanId"], serde_json::json!(expected_trace[..16]));

        assert_eq!(span["kind"], serde_json::json!(2));
        // started_at(08:00:00) + 1200ms
        let start: i64 = span["startTimeUnixNano"].as_str().unwrap().parse().unwrap();
        let end: i64 = span["endTimeUnixNano"].as_str().unwrap().parse().unwrap();
        assert_eq!(end - start, 1_200_000_000);
        assert_eq!(span["status"]["code"], serde_json::json!(1));

        let attrs = span["attributes"].as_array().unwrap();
        let get = |k: &str| {
            attrs
                .iter()
                .find(|a| a["key"] == k)
                .map(|a| a["value"]["stringValue"].as_str().unwrap().to_string())
                .unwrap()
        };
        assert_eq!(get("model"), "gpt-test");
        assert_eq!(get("upstream_model"), "gpt-up");
        assert_eq!(get("total_tokens"), "15");
        assert_eq!(get("cached_tokens"), "2");
        assert_eq!(get("channel"), "ch-a");
        assert_eq!(get("api_key"), "key-b");
        assert_eq!(get("status_code"), "200");
    }

    #[tokio::test]
    async fn error_status_maps_to_error_code() {
        let pool = memory_pool().await;
        let (seq, mut fields) = test_row(1);
        fields["status_code"] = serde_json::json!(502);
        insert_row(&pool, seq, &fields).await;
        let rows = fetch_rows_after(&pool, 0, 10).await.unwrap();
        assert_eq!(
            span_from_row(&rows[0])["status"]["code"],
            serde_json::json!(2)
        );
    }

    /// 极简 mock OTLP 接收端：捕获请求体。
    async fn mock_otlp_endpoint() -> (String, Arc<Mutex<Vec<serde_json::Value>>>) {
        let captured: Arc<Mutex<Vec<serde_json::Value>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = captured.clone();
        let app = Router::new().route(
            "/v1/traces",
            post(move |body: String| {
                let sink = sink.clone();
                async move {
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&body) {
                        sink.lock().unwrap().push(value);
                    }
                    axum::http::StatusCode::OK
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        (format!("http://{addr}/v1/traces"), captured)
    }

    fn test_settings(dir: &std::path::Path, endpoint: &str) -> SettingsStore {
        let store = SettingsStore::file(dir.join("settings.json"));
        store
            .set_many(&[
                ("otlp.endpoint".to_string(), serde_json::json!(endpoint)),
                (
                    "otlp.headers".to_string(),
                    serde_json::json!({"Authorization": "test-only-token"}),
                ),
            ])
            .unwrap();
        store
    }

    #[tokio::test]
    async fn export_once_sends_spans_and_advances_cursor() {
        let pool = memory_pool().await;
        let (endpoint, captured) = mock_otlp_endpoint().await;
        let dir = std::env::temp_dir().join(format!("waliapi-otlp-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let settings = test_settings(&dir, &endpoint);

        let (seq, fields) = test_row(1);
        insert_row(&pool, seq, &fields).await;

        let client = reqwest::Client::new();
        let exported = export_once(&pool, &settings, &client).await.unwrap();
        assert_eq!(exported, 1);
        assert_eq!(settings.get_u64(CURSOR_KEY, 0), 1, "游标应推进到已导出 seq");

        let bodies = captured.lock().unwrap();
        assert_eq!(bodies.len(), 1, "应恰好 POST 一次");
        let spans = bodies[0]["resourceSpans"][0]["scopeSpans"][0]["spans"]
            .as_array()
            .unwrap();
        assert_eq!(spans.len(), 1);
        assert_eq!(
            spans[0]["traceId"],
            serde_json::json!(fields["trace_id"].as_str().unwrap().replace('-', ""))
        );

        // 无新行：零发送、零错误
        drop(bodies);
        assert_eq!(export_once(&pool, &settings, &client).await.unwrap(), 0);
        assert_eq!(captured.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn export_failure_keeps_cursor_for_retry() {
        let pool = memory_pool().await;
        // 端口占一个不存在的地址模拟不可达
        let dir = std::env::temp_dir().join(format!("waliapi-otlp-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let settings = test_settings(&dir, "http://127.0.0.1:9/v1/traces");

        let (seq, fields) = test_row(1);
        insert_row(&pool, seq, &fields).await;

        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(500))
            .build()
            .unwrap();
        let result = export_once(&pool, &settings, &client).await;
        assert!(result.is_err(), "端点不可达应报错");
        assert_eq!(settings.get_u64(CURSOR_KEY, 0), 0, "失败时游标不得推进");
    }

    #[tokio::test]
    async fn legacy_row_without_trace_derives_stable_ids() {
        let pool = memory_pool().await;
        let (_, mut fields) = test_row(1);
        fields["trace_id"] = serde_json::Value::Null;
        insert_row(&pool, 1, &fields).await;
        let rows = fetch_rows_after(&pool, 0, 10).await.unwrap();
        let span = span_from_row(&rows[0]);
        let derived = span["traceId"].as_str().unwrap().to_string();
        assert_eq!(derived.len(), 32);
        // 确定性：同一行再派生一次结果一致
        assert_eq!(
            span_from_row(&rows[0])["traceId"].as_str().unwrap(),
            derived
        );
    }

    #[test]
    fn parse_headers_ignores_invalid_json() {
        assert!(parse_headers("not json").is_empty());
        let headers = parse_headers(r#"{"A": "b", "N": 1}"#);
        assert_eq!(headers, vec![("A".to_string(), "b".to_string())]);
    }
}
