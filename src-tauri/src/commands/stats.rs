use tauri::State;

use super::fail;
use crate::db::models::DashboardStats;
use crate::AppState;

#[tauri::command]
pub async fn get_dashboard_stats(state: State<'_, AppState>) -> Result<DashboardStats, String> {
    state.db.dashboard_stats().await.map_err(fail)
}
