//! Ollama client, used by `apps/desktop` only. Hits localhost:11434.
//! Air-gap policy: no fallback, no remote URL, caller owns the host.

use async_trait::async_trait;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};

use crate::{ChatChunk, ChatMessage, ChatRequest, LlmClient, Result, stream::ndjson_lines};

pub struct OllamaClient {
    base_url: String,
    http: reqwest::Client,
}

impl Default for OllamaClient {
    fn default() -> Self {
        Self {
            base_url: "http://localhost:11434".into(),
            http: reqwest::Client::new(),
        }
    }
}

impl OllamaClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            http: reqwest::Client::new(),
        }
    }
}

#[derive(Serialize)]
struct OllamaRequest<'a> {
    model: &'a str,
    messages: &'a [ChatMessage],
    stream: bool,
    options: OllamaOptions,
}

#[derive(Serialize, Default)]
struct OllamaOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    num_predict: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Deserialize)]
struct OllamaStreamChunk {
    #[serde(default)]
    message: Option<OllamaMessage>,
    done: bool,
}

#[derive(Deserialize)]
struct OllamaMessage {
    content: String,
}

#[async_trait]
impl LlmClient for OllamaClient {
    async fn chat_stream(
        &self,
        request: ChatRequest,
    ) -> Result<Box<dyn futures_util::Stream<Item = Result<ChatChunk>> + Send + Unpin>> {
        let body = OllamaRequest {
            model: &request.model,
            messages: &request.messages,
            stream: true,
            options: OllamaOptions {
                num_predict: request.max_tokens,
                temperature: request.temperature,
            },
        };

        let url = format!("{}/api/chat", self.base_url);
        let resp = self.http.post(&url).json(&body).send().await?.error_for_status()?;

        let chunks = ndjson_lines(resp).map(|line| {
            let line = line?;
            let parsed: OllamaStreamChunk = serde_json::from_str(&line)?;
            Ok(ChatChunk {
                delta: parsed.message.map(|m| m.content).unwrap_or_default(),
                finish_reason: if parsed.done { Some("stop".into()) } else { None },
            })
        });

        Ok(Box::new(Box::pin(chunks)))
    }

    fn provider_name(&self) -> &'static str {
        "ollama"
    }
}
