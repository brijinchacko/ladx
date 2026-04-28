//! In-process validator. Cheaper than spawning the `ladx-validate` CLI
//! since the desktop binary already links the `ladx-validator` crate.
//! Falls back to the Light backend when matiec isn't on PATH; same
//! semantics as the cloud-side endpoint.

use ladx_types::ValidatorReport;
use ladx_validator::{
    light::LightValidator, matiec::MatiecValidator, validate_with_fallback,
};

#[tauri::command]
pub async fn validate_st(source: String) -> Result<ValidatorReport, String> {
    // Run on a blocking pool because Light + matiec can do CPU work +
    // subprocess spawning. Tokio's spawn_blocking is correct here.
    tokio::task::spawn_blocking(move || {
        let primary = MatiecValidator::from_env();
        let fallback = LightValidator;
        validate_with_fallback(&primary, &fallback, &source).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
