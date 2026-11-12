pub mod channel_test;
pub mod knowledge;
pub mod mcp;
pub mod software;
pub mod upstream_models;
pub mod wiki;

use crate::server::router::SharedState;
use crate::AppState;
use async_trait::async_trait;
use axum::Router;
use serde::Serialize;
use std::sync::Arc;

/// Service trait — all services implement this interface
/// 统一管理项目中的不同业务服务，为每个服务提供统一接口，并将各个服务的 HTTP 路由整合到 Axum Router 中。
/// 异步 Trait 方法涉及异步状态机，而传统 Rust Trait 对异步方法的支持有一定限制。
//  async_trait 可以通过宏转换，帮助实现这种异步 Trait 接口。
#[async_trait]
pub trait Service: Send + Sync {
    /// Service unique id (e.g. "knowledge", "mcp")
    fn id(&self) -> &'static str;
    /// Display name (e.g. "知识库", "MCP Server")
    fn name(&self) -> &'static str;
    /// Description for UI display
    fn description(&self) -> &'static str;
    /// Whether enabled (default: true)
    fn enabled(&self) -> bool {
        true
    }
    /// Service status
    ///获取服务状态
    async fn status(&self, state: &Arc<AppState>) -> ServiceStatus;
    /// Register routes into a Router
    /// 它负责返回当前服务所拥有的 Axum 路由。
    fn routes(&self, state: Arc<AppState>) -> Router<SharedState>;
}

#[derive(Debug, Serialize)]
pub struct ServiceStatus {
    pub id: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub running: bool,
    pub stats: serde_json::Value,
}

/// Service manager
pub struct ServiceRegistry {
    services: Vec<Box<dyn Service>>,
}

impl ServiceRegistry {
    pub fn new() -> Self {
        let mut registry = Self { services: vec![] };
        registry.register(Box::new(knowledge::KnowledgeService));
        registry.register(Box::new(mcp::McpService));
        registry.register(Box::new(software::SoftwareService));
        registry.register(Box::new(wiki::WikiService));
        registry
    }

    pub fn register(&mut self, service: Box<dyn Service>) {
        self.services.push(service);
    }

    /// Merge all service routes into one Router
    /// 合并所有服务路由
    pub fn merge_routes(&self, state: Arc<AppState>) -> Router<SharedState> {
        //
        let mut router = Router::new();
        for service in &self.services {
            if service.enabled() {
                router = router.merge(service.routes(state.clone()));
            }
        }
        router
    }

    /// 合并指定服务（按 id）的路由。服务端点按鉴权域分组装配：
    /// 按服务 ID 合并路由
    /// knowledge/wiki 挂管理员 token、mcp 挂独立 MCP token，见 router::build_router。
    /// merge_routes() 合并所有启用服务，而 merge_routes_for() 只合并指定 ID 的服务。
    pub fn merge_routes_for(&self, ids: &[&str], state: Arc<AppState>) -> Router<SharedState> {
        let mut router = Router::new();
        for service in &self.services {
            if service.enabled() && ids.contains(&service.id()) {
                router = router.merge(service.routes(state.clone()));
            }
        }
        router
    }

    /// Get all service statuses
    /// //获取所有服务状态
    pub async fn list_status(&self, state: &Arc<AppState>) -> Vec<ServiceStatus> {
        let mut result = vec![];
        for service in &self.services {
            result.push(service.status(state).await);
        }
        result
    }
}
