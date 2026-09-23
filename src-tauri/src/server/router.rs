use std::time::Duration;

use axum::routing::{get, post};
use axum::Router;
use tower_http::cors::CorsLayer;

use super::handlers;
use crate::core::proxy::GatewayState;
use crate::db::Database;

pub fn build(db: Database) -> Router {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(180))
        .user_agent("damao-api/0.1.0")
        .build()
        .expect("创建 HTTP 客户端失败");
    let state = GatewayState { db, client };
    Router::new()
        .route("/health", get(handlers::health))
        .route("/v1/chat/completions", post(handlers::chat_completions))
        .route("/chat/completions", post(handlers::chat_completions))
        .route("/v1/models", get(handlers::list_models))
        .route("/models", get(handlers::list_models))
        .fallback(handlers::not_found)
        .layer(CorsLayer::permissive())
        .with_state(state)
}
