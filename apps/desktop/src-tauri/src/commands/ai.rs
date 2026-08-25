//! One completion, no streaming.
//!
//! The chat command streams because a person is reading it as it arrives.
//! Generating a screen is not that: the answer is a JSON object that means
//! nothing until it is complete, and the caller wants it in one piece.
//!
//! Deliberately generic. The prompt and the shape of the reply belong to
//! `@ladx/hmi`, which is where the checking lives too; duplicating either here
//! would mean maintaining it twice and drifting the day one of them changes.
//! This crosses the Ollama boundary and hands back what came out of it.

use futures_util::StreamExt;
use ladx_inference::{
    ChatMessage as InferenceChatMessage, ChatRequest, LlmClient, Role,
    ollama::OllamaClient as InferenceOllama,
};
use serde::{Deserialize, Serialize};

use crate::state::AppState;

/// A generated reply, with the model that wrote it so the UI can say which.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCompletion {
    pub text: String,
    pub model: String,
}

/// Whatever the caller asked for, in full.
///
/// `max_tokens` is capped rather than trusted: a request for a million tokens
/// against a local model is not a bigger answer, it is a machine that stops
/// responding while somebody waits for a screen.
#[tauri::command]
pub async fn ai_complete(
    state: tauri::State<'_, AppState>,
    system: String,
    prompt: String,
    model: Option<String>,
    max_tokens: Option<u32>,
) -> Result<AiCompletion, String> {
    let model = model.unwrap_or_else(default_model);

    let req = ChatRequest {
        model: model.clone(),
        messages: vec![
            InferenceChatMessage {
                role: Role::System,
                content: system,
            },
            InferenceChatMessage {
                role: Role::User,
                content: prompt,
            },
        ],
        max_tokens: Some(max_tokens.unwrap_or(6000).min(16000)),
        // Low, not zero. A layout is a set of choices and zero makes a local
        // model repeat the same wrong one however the request is worded.
        temperature: Some(0.2),
    };

    let client = InferenceOllama::default();
    let mut stream = client.chat_stream(req).await.map_err(|e| e.to_string())?;
    let mut text = String::new();
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(c) => {
                text.push_str(&c.delta);
                if c.finish_reason.is_some() {
                    break;
                }
            }
            Err(e) => return Err(e.to_string()),
        }
    }

    state.audit.log("user", "ai_complete", Some(&model)).ok();
    Ok(AiCompletion { text, model })
}

fn default_model() -> String {
    // Same biased default as the model picker. The frontend usually passes the
    // user-selected model explicitly.
    "qwen2.5-coder:14b".into()
}
