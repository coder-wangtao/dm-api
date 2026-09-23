use async_trait::async_trait;
use bytes::Bytes;
use serde_json::{json, Value};
use std::time::Duration;

use super::{clip_error, join_url, Adaptor, Forwarded};
use crate::core::dispatcher;
use crate::db::models::Channel;

pub struct GeminiAdaptor;

#[async_trait]
impl Adaptor for GeminiAdaptor {
    async fn test(&self, client: &reqwest::Client, channel: &Channel) -> Result<String, String> {
        if channel.api_key.trim().is_empty() {
            return Err("缺少 API Key".into());
        }
        let url = format!(
            "{}?key={}",
            join_url(&channel.base_url, "models"),
            encode(channel.api_key.trim())
        );
        let response = client
            .get(url)
            .timeout(Duration::from_secs(20))
            .send()
            .await
            .map_err(|err| format!("连接失败：{err}"))?;
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(clip_error(&format!("上游返回 {}：{text}", status.as_u16())));
        }
        let value: Value = serde_json::from_str(&text).unwrap_or_else(|_| json!({}));
        let count = value["models"].as_array().map(|items| items.len()).unwrap_or(0);
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
        let url = format!(
            "{}?key={}",
            join_url(
                &channel.base_url,
                &format!("models/{}:generateContent", encode(&upstream))
            ),
            encode(channel.api_key.trim())
        );
        let response = client
            .post(url)
            .json(&to_gemini(body))
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
                Ok(value) => Bytes::from(from_gemini(&value, &upstream).to_string()),
                Err(_) => bytes,
            }
        } else {
            bytes
        };
        super::openai::buffered(status, "application/json".into(), converted)
    }
}

fn to_gemini(body: &Value) -> Value {
    let mut system = Vec::new();
    let mut contents = Vec::new();
    if let Some(items) = body.get("messages").and_then(|value| value.as_array()) {
        for item in items {
            let role = item.get("role").and_then(|value| value.as_str()).unwrap_or("user");
            let text = item
                .get("content")
                .map(content_text)
                .unwrap_or_default();
            if role == "system" {
                if !text.is_empty() {
                    system.push(text);
                }
                continue;
            }
            contents.push(json!({
                "role": if role == "assistant" { "model" } else { "user" },
                "parts": [{ "text": text }]
            }));
        }
    }
    let mut payload = json!({ "contents": contents });
    if !system.is_empty() {
        payload["systemInstruction"] = json!({ "parts": [{ "text": system.join("\n") }] });
    }
    if let Some(max_tokens) = body.get("max_tokens").and_then(|value| value.as_i64()) {
        payload["generationConfig"] = json!({ "maxOutputTokens": max_tokens });
    }
    payload
}

fn from_gemini(value: &Value, model: &str) -> Value {
    let text = value["candidates"]
        .as_array()
        .and_then(|items| items.first())
        .and_then(|item| item["content"]["parts"].as_array())
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part["text"].as_str())
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();
    let prompt = value["usageMetadata"]["promptTokenCount"].as_i64().unwrap_or(0);
    let completion = value["usageMetadata"]["candidatesTokenCount"].as_i64().unwrap_or(0);
    let total = value["usageMetadata"]["totalTokenCount"]
        .as_i64()
        .unwrap_or(prompt + completion);
    json!({
        "id": "chatcmpl-gemini",
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
            "total_tokens": total
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

fn encode(value: &str) -> String {
    let mut output = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                output.push(byte as char);
            }
            _ => output.push_str(&format!("%{byte:02X}")),
        }
    }
    output
}
