use tauri::{AppHandle, State};
use tauri_plugin_autostart::ManagerExt;

use super::fail;
use crate::db::models::Settings;
use crate::AppState;

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    state
        .settings
        .read()
        .map(|settings| settings.clone())
        .map_err(|_| "读取设置失败".to_string())
}

#[tauri::command]
pub async fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), String> {
    let settings = settings.normalize()?;
    let was_running = state.http.status().await.running;
    state.db.save_settings(&settings).await.map_err(fail)?;
    if let Ok(mut guard) = state.settings.write() {
        *guard = settings.clone();
    }
    apply_autostart(&app, settings.auto_start);
    if was_running {
        state.http.start().await.map_err(|err| {
            format!("设置已保存，但网关重启失败：{err}")
        })?;
    }
    Ok(())
}

pub fn apply_autostart(app: &AppHandle, enabled: bool) {
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    if let Err(err) = result {
        tracing::warn!("开机自启设置失败：{err}");
    }
}
