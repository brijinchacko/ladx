//! Tauri-side application state. Holds long-lived handles (audit DB,
//! Ollama client) and the storage paths derived from the OS app-data
//! dir.

use anyhow::Result;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::audit::AuditDb;
use crate::ollama::client::OllamaClient;

pub struct AppState {
    pub audit: AuditDb,
    pub ollama: OllamaClient,
    pub paths: AppPaths,
}

pub struct AppPaths {
    pub data_dir: PathBuf,
    pub audit_db: PathBuf,
    pub activation_json: PathBuf,
    pub machine_id_txt: PathBuf,
    pub settings_json: PathBuf,
}

impl AppPaths {
    pub fn from_handle(app: &AppHandle) -> Result<Self> {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| anyhow::anyhow!("app_data_dir: {e}"))?;
        Ok(Self {
            audit_db: data_dir.join("audit.db"),
            activation_json: data_dir.join("activation.json"),
            machine_id_txt: data_dir.join("machine-id.txt"),
            settings_json: data_dir.join("settings.json"),
            data_dir,
        })
    }
}

impl AppState {
    pub fn build(app: &AppHandle) -> Result<Self> {
        let paths = AppPaths::from_handle(app)?;
        std::fs::create_dir_all(&paths.data_dir).ok();
        let audit = AuditDb::open(&paths.audit_db)?;
        Ok(Self {
            audit,
            ollama: OllamaClient::default(),
            paths,
        })
    }
}
