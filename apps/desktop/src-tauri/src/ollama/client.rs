//! Ollama HTTP client wrapper. Talks to localhost:11434 only, see the
//! desktop network policy in apps/desktop/CLAUDE.md.

use anyhow::Result;
use serde::{Deserialize, Serialize};

const DEFAULT_BASE: &str = "http://localhost:11434";

/// Status as observed by a single probe.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaStatus {
    pub running: bool,
    pub base_url: String,
    pub model_count: u32,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModel {
    pub name: String,
    pub size_bytes: u64,
    pub modified_at: Option<String>,
}

#[derive(Deserialize)]
struct TagsResponse {
    models: Vec<TagModel>,
}

#[derive(Deserialize)]
struct TagModel {
    name: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    modified_at: Option<String>,
}

pub struct OllamaClient {
    base_url: String,
    http: reqwest::Client,
}

impl Default for OllamaClient {
    fn default() -> Self {
        Self::new(DEFAULT_BASE)
    }
}

impl OllamaClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            base_url: base_url.to_string(),
            // Short timeout, these are localhost calls; longer waits
            // mean Ollama is hung and we should surface that fast.
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(3))
                .build()
                .expect("reqwest client"),
        }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Probe `/api/tags`. Returns running=false on any connection error
    ///, the user's typical state ("Ollama is not yet running") is
    /// represented by a clean status, not an Err.
    pub async fn status(&self) -> OllamaStatus {
        match self.list_models().await {
            Ok(models) => OllamaStatus {
                running: true,
                base_url: self.base_url.clone(),
                model_count: models.len() as u32,
                error: None,
            },
            Err(e) => OllamaStatus {
                running: false,
                base_url: self.base_url.clone(),
                model_count: 0,
                error: Some(e.to_string()),
            },
        }
    }

    pub async fn list_models(&self) -> Result<Vec<OllamaModel>> {
        let url = format!("{}/api/tags", self.base_url);
        let resp = self.http.get(&url).send().await?.error_for_status()?;
        let parsed: TagsResponse = resp.json().await?;
        Ok(parsed
            .models
            .into_iter()
            .map(|m| OllamaModel {
                name: m.name,
                size_bytes: m.size,
                modified_at: m.modified_at,
            })
            .collect())
    }
}
