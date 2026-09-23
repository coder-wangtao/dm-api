use crate::db::models::SecurityRule;
use crate::utils::time::now_rfc3339;

#[derive(Debug, Clone)]
pub struct SecurityRuleRef {
    pub name: String,
    pub pattern: String,
    pub category: String,
    pub severity: i64,
    pub enabled: bool,
}

impl From<&SecurityRule> for SecurityRuleRef {
    fn from(rule: &SecurityRule) -> Self {
        Self {
            name: rule.name.clone(),
            pattern: rule.pattern.clone(),
            category: rule.category.clone(),
            severity: rule.severity,
            enabled: rule.enabled,
        }
    }
}

pub fn builtin() -> Vec<SecurityRule> {
    let now = now_rfc3339();
    vec![
        rule(
            "builtin-secret",
            "密钥与令牌",
            r"(?i)\b(sk-[a-z0-9]{16,}|sk-ant-[a-z0-9_\-]{10,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b",
            "secret",
            60,
            &now,
        ),
        rule(
            "builtin-unicode",
            "零宽与不可见字符",
            r"[\u{200B}\u{200C}\u{200D}\u{2060}\u{FEFF}]",
            "unicode",
            30,
            &now,
        ),
        rule(
            "builtin-tool",
            "提示词注入",
            r"(?i)(ignore (all |any |previous |prior )?instructions|disregard (the |all )?previous|system prompt)",
            "tool",
            45,
            &now,
        ),
        rule(
            "builtin-metadata",
            "云元数据地址",
            r"(?i)(169\.254\.169\.254|metadata\.google\.internal)",
            "network",
            95,
            &now,
        ),
        rule(
            "builtin-private-net",
            "内网地址",
            r"(?i)\b(127\.0\.0\.1|localhost|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})\b",
            "network",
            40,
            &now,
        ),
    ]
}

fn rule(
    id: &str,
    name: &str,
    pattern: &str,
    category: &str,
    severity: i64,
    now: &str,
) -> SecurityRule {
    SecurityRule {
        id: id.to_string(),
        name: name.to_string(),
        pattern: pattern.to_string(),
        category: category.to_string(),
        severity,
        enabled: true,
        created_at: now.to_string(),
    }
}
