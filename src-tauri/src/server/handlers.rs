use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use axum::Json;
use bytes::Bytes;
use serde_json::{json, Value};

use super::json_error;
use crate::core::proxy::{self, GatewayState};

pub async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

pub async fn chat_completions(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    proxy::chat_completions(state, headers, body).await
}

pub async fn list_models(State(state): State<GatewayState>, headers: HeaderMap) -> Response {
    proxy::list_models(state, headers).await
}

pub async fn not_found() -> Response {
    json_error(StatusCode::NOT_FOUND, "路径不存在")
}
