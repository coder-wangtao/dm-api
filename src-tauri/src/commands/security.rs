use tauri::State;

use super::fail;
use crate::db::models::{SaveSecurityRuleInput, SecurityRule};
use crate::AppState;

#[tauri::command]
pub async fn get_security_rules(state: State<'_, AppState>) -> Result<Vec<SecurityRule>, String> {
    state.db.list_security_rules().await.map_err(fail)
}

#[tauri::command]
pub async fn save_security_rule(
    state: State<'_, AppState>,
    input: SaveSecurityRuleInput,
) -> Result<SecurityRule, String> {
    state.db.save_security_rule(input).await.map_err(fail)
}

#[tauri::command]
pub async fn delete_security_rule(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_security_rule(&id).await.map_err(fail)
}
