use tauri::{AppHandle, State};

use super::fail;
use super::settings::apply_autostart;
use crate::db::models::BackupBundle;
use crate::AppState;

#[tauri::command]
pub async fn export_data(state: State<'_, AppState>) -> Result<String, String> {
    let bundle = state.db.export_bundle().await.map_err(fail)?;
    serde_json::to_string_pretty(&bundle).map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn import_data(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: String,
) -> Result<(), String> {
    let bundle: BackupBundle = serde_json::from_str(&payload).map_err(|err| format!("备份无法解析：{err}"))?;
    if bundle.version > 1 {
        return Err("不支持的备份版本".into());
    }
    let was_running = state.http.status().await.running;
    let settings = state.db.import_bundle(bundle).await.map_err(fail)?;
    if let Ok(mut guard) = state.settings.write() {
        *guard = settings.clone();
    }
    apply_autostart(&app, settings.auto_start);
    if was_running {
        state.http.start().await?;
    }
    Ok(())
}
