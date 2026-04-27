//! Tauri commands for Ollama. Returns plain serde-friendly DTOs so the
//! frontend gets simple JSON.

use crate::ollama::client::{OllamaModel, OllamaStatus};
use crate::ollama::models::pick_default;
use crate::state::AppState;

#[tauri::command]
pub async fn ollama_status(state: tauri::State<'_, AppState>) -> Result<OllamaStatus, String> {
    Ok(state.ollama.status().await)
}

#[tauri::command]
pub async fn ollama_models(
    state: tauri::State<'_, AppState>,
) -> Result<OllamaModelsResponse, String> {
    let models = state.ollama.list_models().await.map_err(|e| e.to_string())?;
    let suggested = pick_default(&models).map(str::to_string);
    Ok(OllamaModelsResponse { models, suggested })
}

#[derive(serde::Serialize)]
pub struct OllamaModelsResponse {
    pub models: Vec<OllamaModel>,
    pub suggested: Option<String>,
}
