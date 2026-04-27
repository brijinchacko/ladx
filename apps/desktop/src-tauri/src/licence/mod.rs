//! Licence activation. ONE outbound HTTP call, ever. After we get a
//! signed activation back, we cache it on disk and run offline forever.
//!
//! The activation endpoint defaults to https://auth.ladx.ai/activate
//! (configurable via LADX_ACTIVATION_URL for staging/dev).

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const DEFAULT_ENDPOINT: &str = "https://auth.ladx.ai/activate";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationRecord {
    pub licence_key_last4: String,
    pub machine_id: String,
    pub product_tier: String,
    pub expires_at: String,
    pub activated_at: String,
}

#[derive(Serialize)]
struct ActivateRequest<'a> {
    licence_key: &'a str,
    machine_id: &'a str,
    product_version: &'a str,
}

#[derive(Deserialize)]
struct ActivateResponse {
    ok: bool,
    #[serde(default)]
    expires_at: Option<String>,
    #[serde(default)]
    product_tier: Option<String>,
    #[serde(default)]
    error: Option<String>,
}

/// Send the licence key + machine fingerprint to auth.ladx.ai/activate.
/// On success, persist the activation record to disk and return it. On
/// failure, return an error and leave any prior activation untouched.
pub async fn activate(
    licence_key: &str,
    machine_id: &str,
    product_version: &str,
    storage_path: &PathBuf,
) -> Result<ActivationRecord> {
    let endpoint =
        std::env::var("LADX_ACTIVATION_URL").unwrap_or_else(|_| DEFAULT_ENDPOINT.to_string());

    let body = ActivateRequest {
        licence_key,
        machine_id,
        product_version,
    };

    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()?;
    let resp: ActivateResponse = http
        .post(&endpoint)
        .json(&body)
        .send()
        .await
        .with_context(|| format!("contacting activation endpoint: {endpoint}"))?
        .error_for_status()?
        .json()
        .await?;

    if !resp.ok {
        return Err(anyhow!(resp.error.unwrap_or_else(|| "activation refused".into())));
    }

    let record = ActivationRecord {
        licence_key_last4: licence_key
            .chars()
            .rev()
            .take(4)
            .collect::<String>()
            .chars()
            .rev()
            .collect(),
        machine_id: machine_id.to_string(),
        product_tier: resp.product_tier.unwrap_or_else(|| "studio".into()),
        expires_at: resp.expires_at.unwrap_or_default(),
        activated_at: chrono::Utc::now().to_rfc3339(),
    };

    if let Some(parent) = storage_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(&record)?;
    std::fs::write(storage_path, json)?;

    Ok(record)
}

pub fn read_cached(storage_path: &PathBuf) -> Result<Option<ActivationRecord>> {
    if !storage_path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(storage_path)?;
    let record = serde_json::from_slice(&bytes)?;
    Ok(Some(record))
}

/// Stable per-install machine id. Generated once and persisted alongside
/// the activation cache so subsequent calls reuse it.
pub fn machine_id(storage_path: &PathBuf) -> Result<String> {
    if storage_path.exists() {
        return Ok(std::fs::read_to_string(storage_path)?.trim().to_string());
    }
    let id = uuid::Uuid::new_v4().to_string();
    if let Some(parent) = storage_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(storage_path, &id)?;
    Ok(id)
}
