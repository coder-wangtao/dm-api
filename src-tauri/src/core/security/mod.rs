use crate::db::Database;
use crate::db::models::Settings;
use crate::security::rules::SecurityRuleRef;
use crate::security::scanner::{self, ScanOutcome};

pub async fn inspect(db: &Database, settings: &Settings, body: &str, is_response: bool) -> ScanOutcome {
    if !settings.security_enabled || (is_response && !settings.security_scan_response) {
        return ScanOutcome::clean(body);
    }
    let rules = match db.list_security_rules().await {
        Ok(rules) => rules.iter().map(SecurityRuleRef::from).collect::<Vec<_>>(),
        Err(err) => {
            tracing::warn!("读取安全规则失败：{err:#}");
            Vec::new()
        }
    };
    scanner::scan(settings, &rules, body)
}
