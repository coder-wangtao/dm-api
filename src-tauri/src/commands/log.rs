use tauri::State;

use super::fail;
use crate::db::models::{GetLogsInput, LogStats, RequestLog};
use crate::AppState;

#[tauri::command]
pub async fn get_logs(
    state: State<'_, AppState>,
    input: Option<GetLogsInput>,
) -> Result<Vec<RequestLog>, String> {
    state
        .db
        .list_logs(input.unwrap_or_default())
        .await
        .map_err(fail)
}

#[tauri::command]
pub async fn get_log(state: State<'_, AppState>, id: String) -> Result<RequestLog, String> {
    state.db.get_log(&id).await.map_err(fail)
}

#[tauri::command]
pub async fn delete_log(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_log(&id).await.map_err(fail)
}

#[tauri::command]
pub async fn get_log_stats(
    state: State<'_, AppState>,
    days: Option<i64>,
) -> Result<Vec<LogStats>, String> {
    state.db.log_stats(days.unwrap_or(14)).await.map_err(fail)
}
