//! Inference abstraction. The `LlmClient` trait hides whether we're talking
//! to OpenRouter (cloud) or Ollama (local desktop). ADR-005 forbids any
//! desktop fallback to cloud — it is the caller's responsibility to pick
//! the right backend per surface.

pub mod ollama;
pub mod openrouter;
pub mod stream;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    System,
    User,
    Assistant,
}

#[derive(Debug, Clone)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatChunk {
    pub delta: String,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Error)]
pub enum InferenceError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Configuration error: {0}")]
    Config(String),
    #[error("Provider error: {0}")]
    Provider(String),
    #[error("Stream parsing error: {0}")]
    Stream(String),
}

pub type Result<T> = std::result::Result<T, InferenceError>;

#[async_trait]
pub trait LlmClient: Send + Sync {
    /// Stream a chat completion. Returns a boxed stream of token-level deltas.
    async fn chat_stream(
        &self,
        request: ChatRequest,
    ) -> Result<Box<dyn futures_util::Stream<Item = Result<ChatChunk>> + Send + Unpin>>;

    fn provider_name(&self) -> &'static str;
}
