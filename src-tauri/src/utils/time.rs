pub fn now_rfc3339() -> String {
    chrono::Local::now().to_rfc3339()
}

pub fn today_prefix() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

pub fn since_prefix(days: i64) -> String {
    let days = days.clamp(1, 365);
    let date = chrono::Local::now().date_naive() - chrono::Duration::days(days - 1);
    date.format("%Y-%m-%d").to_string()
}
