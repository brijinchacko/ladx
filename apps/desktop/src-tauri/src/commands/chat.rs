//! Streaming chat against the local Ollama. Tauri commands can't return
//! streams, so we use the event bus: the caller mints a unique
//! `channelId`, listens for `chat-stream:<id>` (deltas),
//! `chat-stream-error:<id>` (any error), and `chat-stream-end:<id>` (we
//! emit this exactly once when the stream completes), and the command
//! returns once we've finished streaming.

use futures_util::StreamExt;
use ladx_inference::{
    ChatMessage as InferenceChatMessage, ChatRequest, LlmClient, Role,
    ollama::OllamaClient as InferenceOllama,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::state::AppState;

/// Wire-shape of a chat message from the frontend. Mirrors the web
/// streaming protocol — role is lowercase string so JS can send it as-is.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

fn role_from_str(s: &str) -> Role {
    match s {
        "system" => Role::System,
        "assistant" => Role::Assistant,
        _ => Role::User,
    }
}

#[tauri::command]
pub async fn ollama_chat_stream(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    channel_id: String,
    messages: Vec<ChatMessage>,
    model: String,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
) -> Result<(), String> {
    let inference_messages: Vec<InferenceChatMessage> = messages
        .into_iter()
        .map(|m| InferenceChatMessage {
            role: role_from_str(&m.role),
            content: m.content,
        })
        .collect();

    let req = ChatRequest {
        model: model.clone(),
        messages: inference_messages,
        max_tokens,
        temperature,
    };

    let client = InferenceOllama::default();
    let mut stream = match client.chat_stream(req).await {
        Ok(s) => s,
        Err(e) => {
            let msg = e.to_string();
            let _ = app.emit(&format!("chat-stream-error:{channel_id}"), msg.clone());
            let _ = app.emit::<()>(&format!("chat-stream-end:{channel_id}"), ());
            return Err(msg);
        }
    };

    let mut accumulated = String::new();
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(c) => {
                if !c.delta.is_empty() {
                    accumulated.push_str(&c.delta);
                    let _ = app.emit(&format!("chat-stream:{channel_id}"), c.delta);
                }
                if c.finish_reason.is_some() {
                    break;
                }
            }
            Err(e) => {
                let msg = e.to_string();
                let _ = app.emit(&format!("chat-stream-error:{channel_id}"), msg);
                break;
            }
        }
    }

    let _ = app.emit::<()>(&format!("chat-stream-end:{channel_id}"), ());
    state
        .audit
        .log(
            "user",
            "ollama_chat_stream_completed",
            Some(&format!("model={model}, chars={}", accumulated.len())),
        )
        .ok();

    Ok(())
}
