use crate::db::models::Channel;
use rand::Rng;

pub fn select<'a>(
    channels: &'a [Channel],
    model: &str,
    allowed: &[String],
    exclude: &[String],
) -> Result<&'a Channel, String> {
    let mut matched: Vec<&Channel> = channels
        .iter()
        .filter(|channel| {
            channel.status == 1
                && !exclude.iter().any(|id| id == &channel.id)
                && (allowed.is_empty() || allowed.iter().any(|id| id == &channel.id))
                && supports(channel, model)
        })
        .collect();

    if matched.is_empty() {
        if channels.iter().any(|channel| channel.status == 1) {
            return Err(format!("没有可用渠道支持模型 {model}"));
        }
        return Err("没有启用的渠道".into());
    }

    let max_priority = matched.iter().map(|channel| channel.priority).max().unwrap_or(0);
    matched.retain(|channel| channel.priority == max_priority);
    Ok(pick_weighted(&matched))
}

pub fn supports(channel: &Channel, model: &str) -> bool {
    channel.models.is_empty()
        || channel.models.iter().any(|item| item == model)
        || channel.model_mapping.contains_key(model)
}

pub fn upstream_model(channel: &Channel, model: &str) -> String {
    channel
        .model_mapping
        .get(model)
        .cloned()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| model.to_string())
}

fn pick_weighted<'a>(channels: &[&'a Channel]) -> &'a Channel {
    let total: i64 = channels.iter().map(|channel| channel.weight.max(1)).sum();
    let mut cursor = rand::rng().random_range(0..total.max(1));
    for channel in channels {
        let weight = channel.weight.max(1);
        if cursor < weight {
            return channel;
        }
        cursor -= weight;
    }
    channels[0]
}
