//! OpenRouter client. OpenAI-compatible REST API; we use the streaming
//! chat-completions endpoint and parse SSE.

use async_trait::async_trait;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};

use crate::{
    ChatChunk, ChatRequest, InferenceError, LlmClient, Result, stream::sse_chunks,
};

const ENDPOINT: &str = "https://openrouter.ai/api/v1/chat/completions";

pub struct OpenRouterClient {
    api_key: String,
    http: reqwest::Client,
    referer: Option<String>,
    title: Option<String>,
}

impl OpenRouterClient {
    pub fn from_env() -> Result<Self> {
        let api_key = std::env::var("OPENROUTER_API_KEY")
            .map_err(|_| InferenceError::Config("OPENROUTER_API_KEY not set".into()))?;
        Ok(Self::new(api_key))
    }

    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            http: reqwest::Client::new(),
            referer: Some("https://ladx.ai".into()),
            title: Some("ladX.ai".into()),
        }
    }
}

#[derive(Serialize)]
struct CompletionRequest<'a> {
    model: &'a str,
    messages: &'a [crate::ChatMessage],
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Deserialize)]
struct StreamResponse {
    choices: Vec<StreamChoice>,
}

#[derive(Deserialize)]
struct StreamChoice {
    delta: StreamDelta,
    finish_reason: Option<String>,
}

#[derive(Deserialize)]
struct StreamDelta {
    #[serde(default)]
    content: Option<String>,
}

#[async_trait]
impl LlmClient for OpenRouterClient {
    async fn chat_stream(
        &self,
        request: ChatRequest,
    ) -> Result<Box<dyn futures_util::Stream<Item = Result<ChatChunk>> + Send + Unpin>> {
        let body = CompletionRequest {
            model: &request.model,
            messages: &request.messages,
            stream: true,
            max_tokens: request.max_tokens,
            temperature: request.temperature,
        };

        let mut req = self
            .http
            .post(ENDPOINT)
            .bearer_auth(&self.api_key)
            .json(&body);

        if let Some(referer) = &self.referer {
            req = req.header("HTTP-Referer", referer);
        }
        if let Some(title) = &self.title {
            req = req.header("X-Title", title);
        }

        let resp = req.send().await?.error_for_status()?;

        let chunks = sse_chunks(resp).filter_map(|line| async move {
            match line {
                Ok(line) if line == "[DONE]" => None,
                Ok(line) => match serde_json::from_str::<StreamResponse>(&line) {
                    Ok(parsed) => parsed.choices.into_iter().next().map(|choice| {
                        Ok(ChatChunk {
                            delta: choice.delta.content.unwrap_or_default(),
                            finish_reason: choice.finish_reason,
                        })
                    }),
                    Err(e) => Some(Err(InferenceError::Json(e))),
                },
                Err(e) => Some(Err(e)),
            }
        });

        Ok(Box::new(Box::pin(chunks)))
    }

    fn provider_name(&self) -> &'static str {
        "openrouter"
    }
}
