use async_trait::async_trait;
use bytes::Bytes;
use serde_json::{json, Value};
use std::time::Duration;

use super::{clip_error, join_url, Adaptor, Forwarded};
use crate::core::dispatcher;
use crate::db::models::Channel;

const ANTHROPIC_VERSION: &str = "2023-06-01";

pub struct ClaudeAdaptor;

#[async_trait]
impl Adaptor for ClaudeAdaptor {
    async fn test(&self, client: &reqwest::Client, channel: &Channel) -> Result<String, String> {
        if channel.api_key.trim().is_empty() {
            return Err("缺少 API Key".into());
        }
        let response = client
            .get(versioned(&channel.base_url, "models"))
            .timeout(Duration::from_secs(20))
            .header("x-api-key", channel.api_key.trim())
            .header("anthropic-version", ANTHROPIC_VERSION)
            .send()
            .await
            .map_err(|err| format!("连接失败：{err}"))?;
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(clip_error(&format!("上游返回 {}：{text}", status.as_u16())));
        }
        let value: Value = serde_json::from_str(&text).unwrap_or_else(|_| json!({}));
        let count = value["data"].as_array().map(|items| items.len()).unwrap_or(0);
        Ok(format!("连接成功，上游返回 {count} 个模型"))
    }

    async fn forward(
        &self,
        client: &reqwest::Client,
        channel: &Channel,
        body: &Value,
    ) -> Result<Forwarded, String> {
        let model = body.get("model").and_then(|value| value.as_str()).unwrap_or("");
        let upstream = dispatcher::upstream_model(channel, model);
        let payload = to_claude(body, &upstream);
        let response = client
            .post(versioned(&channel.base_url, "messages"))
            .header("x-api-key", channel.api_key.trim())
            .header("anthropic-version", ANTHROPIC_VERSION)
            .json(&payload)
            .send()
            .await
            .map_err(|err| format!("上游请求失败：{err}"))?;
        let status = response.status().as_u16();
        let bytes = response
            .bytes()
            .await
            .map_err(|err| format!("读取上游响应失败：{err}"))?;
        let converted = if status < 400 {
            match serde_json::from_slice::<Value>(&bytes) {
                Ok(value) => Bytes::from(from_claude(&value, &upstream).to_string()),
                Err(_) => bytes,
            }
        } else {
            bytes
        };
        super::openai::buffered(status, "application/json".into(), converted)
    }
}

fn versioned(base: &str, path: &str) -> String {
    let base = base.trim().trim_end_matches('/');
    if base.ends_with("/v1") {
        join_url(base, path)
    } else {
        join_url(base, &format!("v1/{path}"))
    }
}

fn to_claude(body: &Value, model: &str) -> Value {
    let mut system = Vec::new();
    let mut messages = Vec::new();
    if let Some(items) = body.get("messages").and_then(|value| value.as_array()) {
        for item in items {
            let role = item.get("role").and_then(|value| value.as_str()).unwrap_or("user");
            let text = content_text(item.get("content").unwrap_or(&Value::Null));
            if role == "system" {
                if !text.is_empty() {
                    system.push(text);
                }
                continue;
            }
            let role = if role == "assistant" { "assistant" } else { "user" };
            messages.push(json!({ "role": role, "content": text }));
        }
    }
    if messages.is_empty() {
        messages.push(json!({ "role": "user", "content": "ping" }));
    }
    let max_tokens = body
        .get("max_tokens")
        .and_then(|value| value.as_i64())
        .or_else(|| body.get("max_completion_tokens").and_then(|value| value.as_i64()))
        .unwrap_or(1024)
        .clamp(1, 8192);
    let mut payload = json!({
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
    });
    if !system.is_empty() {
        payload["system"] = json!(system.join("\n"));
    }
    payload
}

fn from_claude(value: &Value, model: &str) -> Value {
    let text = value["content"]
        .as_array()
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part["text"].as_str())
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();
    let prompt = value["usage"]["input_tokens"].as_i64().unwrap_or(0);
    let completion = value["usage"]["output_tokens"].as_i64().unwrap_or(0);
    json!({
        "id": value["id"].as_str().unwrap_or("chatcmpl-claude"),
        "object": "chat.completion",
        "model": model,
        "choices": [{
            "index": 0,
            "message": { "role": "assistant", "content": text },
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "total_tokens": prompt + completion
        }
    })
}

fn content_text(content: &Value) -> String {
    if let Some(text) = content.as_str() {
        return text.to_string();
    }
    content
        .as_array()
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part.get("text").and_then(|value| value.as_str()))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default()
}
