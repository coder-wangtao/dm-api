use async_trait::async_trait;
use serde_json::Value;

use super::openai::{forward_chat, test_models};
use super::{Adaptor, Forwarded};
use crate::db::models::Channel;

pub struct DeepSeekAdaptor;

#[async_trait]
impl Adaptor for DeepSeekAdaptor {
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
