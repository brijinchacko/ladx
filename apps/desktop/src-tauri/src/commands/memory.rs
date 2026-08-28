//! What the assistant remembers, kept where the rest of the work is.
//!
//! The frontend chooses the keys, so this is deliberately a plain key/value
//! surface: `ladx.ai.thread.ladder:<project>` is the frontend's shape and this
//! side should not have to know it.

use crate::state::AppState;

#[tauri::command]
pub fn memory_get(state: tauri::State<'_, AppState>, key: String) -> Result<Option<String>, String> {
    state
        .projects
        .with_conn(|conn| crate::db::kv::get(conn, &key))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_set(
    state: tauri::State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    state
        .projects
        .with_conn(|conn| crate::db::kv::set(conn, &key, &value))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_remove(state: tauri::State<'_, AppState>, key: String) -> Result<(), String> {
    state
        .projects
        .with_conn(|conn| crate::db::kv::remove(conn, &key))
        .map_err(|e| e.to_string())
}
