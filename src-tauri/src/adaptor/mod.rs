use async_trait::async_trait;
use bytes::Bytes;
use serde_json::Value;

use crate::db::models::Channel;

pub mod claude;
pub mod custom;
pub mod deepseek;
pub mod gemini;
pub mod openai;

pub struct Forwarded {
    pub status: u16,
    pub content_type: String,
    pub body: ForwardBody,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
    pub error_message: Option<String>,
}

pub enum ForwardBody {
    Bytes(Bytes),
    Stream(reqwest::Response),
}

#[async_trait]
pub trait Adaptor: Send + Sync {
    async fn test(&self, client: &reqwest::Client, channel: &Channel) -> Result<String, String>;
    async fn forward(
        &self,
        client: &reqwest::Client,
        channel: &Channel,
        body: &Value,
    ) -> Result<Forwarded, String>;
}

pub fn for_channel(channel: &Channel) -> Box<dyn Adaptor> {
    match channel.channel_type.as_str() {
        "claude" => Box::new(claude::ClaudeAdaptor),
        "gemini" => Box::new(gemini::GeminiAdaptor),
        "deepseek" => Box::new(deepseek::DeepSeekAdaptor),
        "custom" => Box::new(custom::CustomAdaptor),
        _ => Box::new(openai::OpenAiAdaptor),
    }
}

pub fn supports_stream(channel_type: &str) -> bool {
    matches!(channel_type, "openai" | "deepseek" | "custom")
}

pub fn join_url(base: &str, path: &str) -> String {
    format!(
        "{}/{}",
        base.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

pub fn clip_error(text: &str) -> String {
    crate::utils::clip_text(text, 240)
}

pub fn usage_of(value: &Value) -> (i64, i64, i64) {
    let usage = &value["usage"];
    let prompt = usage["prompt_tokens"].as_i64().unwrap_or(0);
    let completion = usage["completion_tokens"].as_i64().unwrap_or(0);
    let total = usage["total_tokens"].as_i64().unwrap_or(prompt + completion);
    (prompt, completion, total)
}

pub fn error_message(status: u16, value: Option<&Value>, raw: &str) -> Option<String> {
    if status < 400 {
        return None;
    }
    if let Some(value) = value {
        if let Some(message) = value["error"]["message"].as_str() {
            return Some(clip_error(message));
        }
    }
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        Some(format!("上游返回 {status}"))
    } else {
        Some(clip_error(trimmed))
    }
}
