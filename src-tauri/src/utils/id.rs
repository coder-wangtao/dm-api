pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn new_api_key() -> String {
    let left = uuid::Uuid::new_v4().simple().to_string();
    let right = uuid::Uuid::new_v4().simple().to_string();
    format!("sk-waliapi-{left}{right}")
}
