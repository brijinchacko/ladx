//! Per-install settings (currently just the chosen Ollama model). We
//! write to %APPDATA%\ladX\settings.json on Windows, the equivalent on
//! macOS / Linux. Frontend never touches the disk directly, it always
//! goes through these commands.

use serde::{Deserialize, Serialize};

use crate::state::AppState;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioSettings {
    /// Last user-selected Ollama model name. None = use the auto-suggested.
    #[serde(default)]
    pub default_model: Option<String>,
}

#[tauri::command]
pub fn settings_load(state: tauri::State<'_, AppState>) -> Result<StudioSettings, String> {
    let path = &state.paths.settings_json;
    if !path.exists() {
        return Ok(StudioSettings::default());
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn settings_save(
    state: tauri::State<'_, AppState>,
    settings: StudioSettings,
) -> Result<(), String> {
    let path = &state.paths.settings_json;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())?;
    state
        .audit
        .log("user", "settings_saved", settings.default_model.as_deref())
        .ok();
    Ok(())
}
