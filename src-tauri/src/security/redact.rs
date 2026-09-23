use super::rules::SecurityRuleRef;
use regex::Regex;

pub fn redact(text: &str, rules: &[SecurityRuleRef]) -> (String, bool) {
    let mut output = text.to_string();
    let mut changed = false;
    for rule in rules {
        if !rule.enabled || rule.category != "secret" {
            continue;
        }
        let Ok(pattern) = Regex::new(&rule.pattern) else {
            continue;
        };
        let next = pattern.replace_all(&output, "[REDACTED]");
        if next != output {
            changed = true;
            output = next.into_owned();
        }
    }
    (output, changed)
}
