use tauri::State;

use super::fail;
use crate::db::models::{ApiKey, CreateApiKeyInput, UpdateApiKeyInput};
use crate::AppState;

#[tauri::command]
pub async fn get_api_keys(state: State<'_, AppState>) -> Result<Vec<ApiKey>, String> {
    state.db.list_api_keys().await.map_err(fail)
}

#[tauri::command]
pub async fn create_api_key(
    state: State<'_, AppState>,
    input: CreateApiKeyInput,
) -> Result<ApiKey, String> {
    state.db.create_api_key(input).await.map_err(fail)
}

#[tauri::command]
pub async fn update_api_key(
    state: State<'_, AppState>,
    input: UpdateApiKeyInput,
) -> Result<(), String> {
    state.db.update_api_key(input).await.map_err(fail)
}

#[tauri::command]
pub async fn delete_api_key(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_api_key(&id).await.map_err(fail)
}
