use crate::db::models::Settings;

use super::redact;
use super::rules::SecurityRuleRef;
use regex::Regex;

#[derive(Debug, Clone)]
pub struct ScanOutcome {
    pub risk_level: String,
    pub risk_score: i64,
    pub risk_summary: Option<String>,
    pub security_action: String,
    pub sanitized: bool,
    pub blocked_reason: Option<String>,
    pub body: String,
}

impl ScanOutcome {
    pub fn clean(body: impl Into<String>) -> Self {
        Self {
            risk_level: "none".into(),
            risk_score: 0,
            risk_summary: None,
            security_action: "allow".into(),
            sanitized: false,
            blocked_reason: None,
            body: body.into(),
        }
    }
}

pub fn scan(settings: &Settings, rules: &[SecurityRuleRef], text: &str) -> ScanOutcome {
    if !settings.security_enabled {
        return ScanOutcome::clean(text);
    }

    let mut score = 0_i64;
    let mut names = Vec::new();
    for rule in rules {
        if !rule.enabled || !category_enabled(settings, &rule.category) {
            continue;
        }
        let Ok(pattern) = Regex::new(&rule.pattern) else {
            continue;
        };
        if pattern.is_match(text) {
            score += rule.severity.max(1);
            if names.len() < 3 {
                names.push(rule.name.clone());
            }
        }
    }

    let (body, redacted) = if settings.security_redact_secrets {
        redact::redact(text, rules)
    } else {
        (text.to_string(), false)
    };

    let risk_level = level_for(score);
    let blocked = settings.security_mode == "enforce"
        && settings.security_block_on_critical
        && risk_level == "critical";
    let security_action = if blocked {
        "block"
    } else if redacted {
        "redact"
    } else {
        "allow"
    };

    ScanOutcome {
        risk_level: risk_level.into(),
        risk_score: score,
        risk_summary: if names.is_empty() {
            None
        } else {
            Some(names.join("、"))
        },
        security_action: security_action.into(),
        sanitized: redacted,
        blocked_reason: if blocked {
            Some("请求命中严重安全规则，已被拦截".into())
        } else {
            None
        },
        body,
    }
}

fn category_enabled(settings: &Settings, category: &str) -> bool {
    match category {
        "unicode" => settings.security_scan_unicode,
        "tool" => settings.security_scan_tools,
        "network" => settings.security_scan_network,
        _ => true,
    }
}

fn level_for(score: i64) -> &'static str {
    if score <= 0 {
        "none"
    } else if score <= 20 {
        "low"
    } else if score <= 50 {
        "medium"
    } else if score <= 80 {
        "high"
    } else {
        "critical"
    }
}
