use std::time::Instant;

use axum::body::Body;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::Response;
use bytes::Bytes;
use serde_json::{json, Value};

use crate::adaptor::{self, ForwardBody};
use crate::core::{dispatcher, security};
use crate::db::models::{ApiKey, NewRequestLog, Settings};
use crate::db::Database;
use crate::server::json_error;
use crate::utils::clip_text;
use crate::utils::time::now_rfc3339;

#[derive(Clone)]
pub struct GatewayState {
    pub db: Database,
    pub client: reqwest::Client,
}

pub async fn chat_completions(state: GatewayState, headers: HeaderMap, body: Bytes) -> Response {
    let started = Instant::now();
    let raw = String::from_utf8_lossy(&body).to_string();
    let settings = match state.db.get_settings().await {
        Ok(settings) => settings,
        Err(err) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
    };
    let Some(token) = bearer(&headers) else {
        return json_error(StatusCode::UNAUTHORIZED, "缺少 API 密钥");
    };
    let key = match state.db.find_api_key(&token).await {
        Ok(Some(key)) => key,
        Ok(None) => return json_error(StatusCode::UNAUTHORIZED, "API 密钥无效"),
        Err(err) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
    };
    if key.status != 1 {
        return json_error(StatusCode::UNAUTHORIZED, "API 密钥已停用");
    }
    if let Some(expires_at) = &key.expires_at {
        if !expires_at.is_empty() && expires_at.as_str() < now_rfc3339().as_str() {
            return json_error(StatusCode::UNAUTHORIZED, "API 密钥已过期");
        }
    }
    if key.quota_limit > 0 && key.quota_used >= key.quota_limit {
        return json_error(StatusCode::TOO_MANY_REQUESTS, "Token 配额已用尽");
    }

    let mut payload: Value = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(_) => return json_error(StatusCode::BAD_REQUEST, "请求体不是合法 JSON"),
    };
    let model = payload
        .get("model")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    if model.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "缺少 model");
    }
    if !key.allowed_models.is_empty() && !key.allowed_models.iter().any(|item| item == &model) {
        return json_error(StatusCode::FORBIDDEN, "密钥不允许使用该模型");
    }

    let scan = security::inspect(&state.db, &settings, &raw, false).await;
    if scan.security_action == "block" {
        let message = scan
            .blocked_reason
            .clone()
            .unwrap_or_else(|| "请求已被安全策略拦截".into());
        record(
            &state,
            &key,
            &model,
            None,
            403,
            0,
            0,
            0,
            started,
            Some(message.clone()),
            false,
            false,
            &scan,
        )
        .await;
        return json_error(StatusCode::FORBIDDEN, message);
    }
    if scan.sanitized {
        if let Ok(value) = serde_json::from_str(&scan.body) {
            payload = value;
        }
    }

    let channels = match state.db.list_channels().await {
        Ok(channels) => channels,
        Err(err) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
    };
    let stream = payload.get("stream").and_then(|value| value.as_bool()).unwrap_or(false);
    let attempts = if settings.retry_enabled && !stream {
        settings.retry_times.max(0) + 1
    } else {
        1
    };

    let mut exclude = Vec::new();
    let mut last_error = String::from("没有可用渠道");
    for attempt in 0..attempts {
        let chosen = {
            let picked = dispatcher::select(&channels, &model, &key.allowed_channels, &exclude);
            match picked {
                Ok(channel) => channel.clone(),
                Err(err) => {
                    last_error = err;
                    break;
                }
            }
        };
        if stream && !adaptor::supports_stream(&chosen.channel_type) {
            exclude.push(chosen.id);
            last_error = "没有支持流式输出的渠道".into();
            continue;
        }
        let upstream = dispatcher::upstream_model(&chosen, &model);
        let adaptor = adaptor::for_channel(&chosen);
        match adaptor.forward(&state.client, &chosen, &payload).await {
            Ok(forwarded) => {
                let retryable = should_retry(forwarded.status) && attempt + 1 < attempts;
                if retryable {
                    exclude.push(chosen.id.clone());
                    last_error = forwarded
                        .error_message
                        .clone()
                        .unwrap_or_else(|| format!("上游返回 {}", forwarded.status));
                    continue;
                }
                return finish_forward(
                    &state,
                    &settings,
                    &key,
                    &model,
                    &chosen.name,
                    Some(upstream),
                    forwarded,
                    started,
                    attempt > 0,
                    &scan,
                )
                .await;
            }
            Err(err) => {
                last_error = err;
                exclude.push(chosen.id);
            }
        }
    }

    record(
        &state,
        &key,
        &model,
        None,
        502,
        0,
        0,
        0,
        started,
        Some(last_error.clone()),
        stream,
        attempts > 1,
        &scan,
    )
    .await;
    json_error(StatusCode::BAD_GATEWAY, last_error)
}

pub async fn list_models(state: GatewayState, headers: HeaderMap) -> Response {
    let Some(token) = bearer(&headers) else {
        return json_error(StatusCode::UNAUTHORIZED, "缺少 API 密钥");
    };
    let key = match state.db.find_api_key(&token).await {
        Ok(Some(key)) if key.status == 1 => key,
        Ok(_) => return json_error(StatusCode::UNAUTHORIZED, "API 密钥无效"),
        Err(err) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
    };
    let channels = match state.db.list_channels().await {
        Ok(channels) => channels,
        Err(err) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
    };
    let mut data = Vec::new();
    let mut seen = Vec::new();
    for channel in channels.iter().filter(|channel| channel.status == 1) {
        if !key.allowed_channels.is_empty()
            && !key.allowed_channels.iter().any(|id| id == &channel.id)
        {
            continue;
        }
        for model in &channel.models {
            if seen.iter().any(|item: &String| item == model) {
                continue;
            }
            if !key.allowed_models.is_empty() && !key.allowed_models.iter().any(|item| item == model)
            {
                continue;
            }
            seen.push(model.clone());
            data.push(json!({
                "id": model,
                "object": "model",
                "owned_by": channel.channel_type
            }));
        }
    }
    json_body(StatusCode::OK, json!({ "object": "list", "data": data }))
}

async fn finish_forward(
    state: &GatewayState,
    settings: &Settings,
    key: &ApiKey,
    model: &str,
    channel_name: &str,
    upstream_model: Option<String>,
    forwarded: adaptor::Forwarded,
    started: Instant,
    is_retry: bool,
    request_scan: &crate::security::ScanOutcome,
) -> Response {
    match forwarded.body {
        ForwardBody::Stream(response) => {
            record_named(
                state,
                Some(key.name.clone()),
                Some(channel_name.to_string()),
                model,
                upstream_model,
                forwarded.status as i64,
                0,
                0,
                0,
                started,
                forwarded.error_message,
                true,
                is_retry,
                request_scan,
            )
            .await;
            stream_response(forwarded.status, &forwarded.content_type, response)
        }
        ForwardBody::Bytes(bytes) => {
            let raw = String::from_utf8_lossy(&bytes).to_string();
            let response_scan = security::inspect(&state.db, settings, &raw, true).await;
            let mut logged = if response_scan.risk_score > request_scan.risk_score {
                response_scan.clone()
            } else {
                request_scan.clone()
            };
            logged.body = request_scan.body.clone();
            logged.sanitized = request_scan.sanitized || response_scan.sanitized;
            if response_scan.security_action == "block" {
                let message = response_scan
                    .blocked_reason
                    .clone()
                    .unwrap_or_else(|| "响应已被安全策略拦截".into());
                record_named(
                    state,
                    Some(key.name.clone()),
                    Some(channel_name.to_string()),
                    model,
                    upstream_model,
                    502,
                    forwarded.prompt_tokens,
                    forwarded.completion_tokens,
                    forwarded.total_tokens,
                    started,
                    Some(message.clone()),
                    false,
                    is_retry,
                    &logged,
                )
                .await;
                return json_error(StatusCode::BAD_GATEWAY, message);
            }
            let body = if response_scan.sanitized {
                Bytes::from(response_scan.body.clone())
            } else {
                bytes
            };
            if forwarded.status < 400 {
                let _ = state.db.add_quota_used(&key.id, forwarded.total_tokens).await;
            }
            record_named(
                state,
                Some(key.name.clone()),
                Some(channel_name.to_string()),
                model,
                upstream_model,
                forwarded.status as i64,
                forwarded.prompt_tokens,
                forwarded.completion_tokens,
                forwarded.total_tokens,
                started,
                forwarded.error_message,
                false,
                is_retry,
                &logged,
            )
            .await;
            bytes_response(forwarded.status, &forwarded.content_type, body)
        }
    }
}

async fn record(
    state: &GatewayState,
    key: &ApiKey,
    model: &str,
    channel_name: Option<String>,
    status: i64,
    prompt_tokens: i64,
    completion_tokens: i64,
    total_tokens: i64,
    started: Instant,
    error_message: Option<String>,
    is_stream: bool,
    is_retry: bool,
    scan: &crate::security::ScanOutcome,
) {
    record_named(
        state,
        Some(key.name.clone()),
        channel_name,
        model,
        None,
        status,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        started,
        error_message,
        is_stream,
        is_retry,
        scan,
    )
    .await;
}

async fn record_named(
    state: &GatewayState,
    api_key_name: Option<String>,
    channel_name: Option<String>,
    model: &str,
    upstream_model: Option<String>,
    status: i64,
    prompt_tokens: i64,
    completion_tokens: i64,
    total_tokens: i64,
    started: Instant,
    error_message: Option<String>,
    is_stream: bool,
    is_retry: bool,
    scan: &crate::security::ScanOutcome,
) {
    let log = NewRequestLog {
        api_key_name,
        channel_name,
        model: model.to_string(),
        upstream_model,
        mode: "chat".into(),
        status_code: status,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        duration_ms: started.elapsed().as_millis() as i64,
        error_message,
        is_stream,
        is_retry,
        request_body: Some(clip_text(&scan.body, 64 * 1024)),
        risk_level: scan.risk_level.clone(),
        risk_score: scan.risk_score,
        risk_summary: scan.risk_summary.clone(),
        security_action: scan.security_action.clone(),
        sanitized: scan.sanitized,
        blocked_reason: scan.blocked_reason.clone(),
    };
    if let Err(err) = state.db.insert_log(log).await {
        tracing::warn!("写入请求日志失败：{err:#}");
    }
}

fn should_retry(status: u16) -> bool {
    status == 408 || status == 409 || status == 429 || status >= 500
}

fn bearer(headers: &HeaderMap) -> Option<String> {
    if let Some(value) = headers.get(header::AUTHORIZATION).and_then(|value| value.to_str().ok()) {
        let value = value.trim();
        if let Some(token) = value
            .strip_prefix("Bearer ")
            .or_else(|| value.strip_prefix("bearer "))
        {
            let token = token.trim();
            if !token.is_empty() {
                return Some(token.to_string());
            }
        }
    }
    headers
        .get("x-api-key")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn stream_response(status: u16, content_type: &str, response: reqwest::Response) -> Response {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from_stream(response.bytes_stream()))
        .unwrap_or_else(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "构造响应失败"))
}

fn bytes_response(status: u16, content_type: &str, body: Bytes) -> Response {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .body(Body::from(body))
        .unwrap_or_else(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "构造响应失败"))
}

fn json_body(status: StatusCode, value: Value) -> Response {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(value.to_string()))
        .unwrap_or_else(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "构造响应失败"))
}
