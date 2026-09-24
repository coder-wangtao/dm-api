use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri_plugin_store::StoreExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct ServerStatus {
    pub running: bool,
    pub host: String,
    pub port: u16,
    pub address: String,
    pub url: String,
}

#[tauri::command]
pub async fn get_server_status(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<ServerStatus, String> {
    let running = state.server_running.load(std::sync::atomic::Ordering::SeqCst);
    let port = *state.server_port.read().await;
    let host = app
        .store("settings.json")
        .ok()
        .and_then(|store| store.get("server.host"))
        .and_then(|value| value.as_str().map(|s| s.trim().to_string()))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "127.0.0.1".to_string());
    let address = if running {
        format!("{host}:{port}")
    } else {
        String::new()
    };
    Ok(ServerStatus {
        running,
        url: format!("http://{host}:{port}"),
        host,
        port,
        address,
    })
}

#[tauri::command]
pub async fn restart_server(app: tauri::AppHandle, state: tauri::State<'_, Arc<AppState>>) -> Result<(), String> {
    // Stop existing server
    let mut handle_guard = state.server_handle.write().await;
    if let Some(handle) = handle_guard.take() {
        handle.abort();
    }
    state.server_running.store(false, std::sync::atomic::Ordering::SeqCst);

    // Start new server
    let app_clone = app.clone();
    let state_clone = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        let _ = crate::server::start_server(app_clone, state_clone).await;
    });

    Ok(())
}
