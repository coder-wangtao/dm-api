use async_trait::async_trait;
use serde_json::Value;

use super::openai::{forward_chat, test_models};
use super::{Adaptor, Forwarded};
use crate::db::models::Channel;

pub struct CustomAdaptor;

#[async_trait]
impl Adaptor for CustomAdaptor {
    async fn test(&self, client: &reqwest::Client, channel: &Channel) -> Result<String, String> {
        let path = text_config(channel, "models_path", "models");
        test_models(client, channel, &path).await
    }

    async fn forward(
        &self,
        client: &reqwest::Client,
        channel: &Channel,
        body: &Value,
    ) -> Result<Forwarded, String> {
        let path = text_config(channel, "chat_path", "chat/completions");
        forward_chat(client, channel, body, &path).await
    }
}

fn text_config(channel: &Channel, key: &str, default_path: &str) -> String {
    channel
        .config
        .get(key)
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| default_path.to_string())
}
