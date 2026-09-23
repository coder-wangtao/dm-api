use async_trait::async_trait;
use bytes::Bytes;
use serde_json::{json, Value};
use std::time::Duration;

use super::{error_message, join_url, usage_of, Adaptor, ForwardBody, Forwarded};
use crate::core::dispatcher;
use crate::db::models::Channel;

pub struct OpenAiAdaptor;

#[async_trait]
impl Adaptor for OpenAiAdaptor {
    async fn test(&self, client: &reqwest::Client, channel: &Channel) -> Result<String, String> {
        test_models(client, channel, "models").await
    }

    async fn forward(
        &self,
        client: &reqwest::Client,
        channel: &Channel,
        body: &Value,
    ) -> Result<Forwarded, String> {
        forward_chat(client, channel, body, "chat/completions").await
    }
}

pub async fn test_models(
    client: &reqwest::Client,
    channel: &Channel,
    path: &str,
) -> Result<String, String> {
    if channel.base_url.trim().is_empty() {
        return Err("缺少 Base URL".into());
    }
    if channel.api_key.trim().is_empty() {
        return Err("缺少 API Key".into());
    }
    let response = client
        .get(join_url(&channel.base_url, path))
        .timeout(Duration::from_secs(20))
        .bearer_auth(channel.api_key.trim())
        .send()
        .await
        .map_err(|err| format!("连接失败：{err}"))?;
    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|err| format!("读取响应失败：{err}"))?;
    if !status.is_success() {
        let raw = String::from_utf8_lossy(&bytes);
        return Err(error_message(status.as_u16(), None, &raw).unwrap_or_else(|| "测试失败".into()));
    }
    let value: Value = serde_json::from_slice(&bytes).unwrap_or_else(|_| json!({}));
    let count = value["data"].as_array().map(|items| items.len()).unwrap_or(0);
    Ok(format!("连接成功，上游返回 {count} 个模型"))
}

pub async fn forward_chat(
    client: &reqwest::Client,
    channel: &Channel,
    body: &Value,
    path: &str,
) -> Result<Forwarded, String> {
    let model = body
        .get("model")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let mut payload = body.clone();
    payload["model"] = json!(dispatcher::upstream_model(channel, model));
    let stream = payload.get("stream").and_then(|value| value.as_bool()).unwrap_or(false);

    let response = client
        .post(join_url(&channel.base_url, path))
        .bearer_auth(channel.api_key.trim())
        .json(&payload)
        .send()
        .await
        .map_err(|err| format!("上游请求失败：{err}"))?;
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or(if stream {
            "text/event-stream"
        } else {
            "application/json"
        })
        .to_string();

    if stream && status < 400 {
        return Ok(Forwarded {
            status,
            content_type,
            body: ForwardBody::Stream(response),
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
            error_message: None,
        });
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|err| format!("读取上游响应失败：{err}"))?;
    buffered(status, content_type, bytes)
}

pub fn buffered(status: u16, content_type: String, bytes: Bytes) -> Result<Forwarded, String> {
    let raw = String::from_utf8_lossy(&bytes).to_string();
    let value = serde_json::from_slice::<Value>(&bytes).ok();
    let (prompt_tokens, completion_tokens, total_tokens) = value
        .as_ref()
        .map(usage_of)
        .unwrap_or((0, 0, 0));
    Ok(Forwarded {
        status,
        content_type,
        error_message: error_message(status, value.as_ref(), &raw),
        body: ForwardBody::Bytes(bytes),
        prompt_tokens,
        completion_tokens,
        total_tokens,
    })
}
