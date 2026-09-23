pub mod id;
pub mod time;

pub fn clip_text(input: &str, max: usize) -> String {
    if input.len() <= max {
        return input.to_string();
    }
    let mut end = max;
    while end > 0 && !input.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &input[..end])
}

pub fn flag(value: bool) -> i64 {
    if value { 1 } else { 0 }
}
