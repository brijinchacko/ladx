//! Tauri commands for the licence flow.

use crate::licence;
use crate::state::AppState;

#[tauri::command]
pub fn licence_status(
    state: tauri::State<'_, AppState>,
) -> Result<Option<licence::ActivationRecord>, String> {
    licence::read_cached(&state.paths.activation_json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn licence_activate(
    state: tauri::State<'_, AppState>,
    licence_key: String,
) -> Result<licence::ActivationRecord, String> {
    let machine_id =
        licence::machine_id(&state.paths.machine_id_txt).map_err(|e| e.to_string())?;
    let record = licence::activate(
        &licence_key,
        &machine_id,
        env!("CARGO_PKG_VERSION"),
        &state.paths.activation_json,
    )
    .await
    .map_err(|e| e.to_string())?;

    state
        .audit
        .log("user", "licence_activated", Some(&record.licence_key_last4))
        .ok();

    Ok(record)
}
