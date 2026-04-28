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
    project_id: Option<String>,
) -> Result<(), String> {
    // Optional project grounding — load the manifest and prepend a
    // system message describing the project's routines/tags/UDTs.
    let mut grounded: Vec<InferenceChatMessage> = Vec::new();
    if let Some(pid) = &project_id {
        if let Ok(Some(project)) = state.projects.get(pid) {
            grounded.push(InferenceChatMessage {
                role: Role::System,
                content: build_project_system_prompt(&project),
            });
        }
    }
    grounded.extend(messages.into_iter().filter(|m| m.role != "system").map(|m| {
        InferenceChatMessage {
            role: role_from_str(&m.role),
            content: m.content,
        }
    }));

    let req = ChatRequest {
        model: model.clone(),
        messages: grounded,
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

/// Builds a compact grounding system prompt from a project manifest.
/// Mirrors the cloud-side `buildProjectSystemPrompt` so the model gets
/// the same shape of context whether it's running in OpenRouter or
/// locally on Ollama.
fn build_project_system_prompt(project: &crate::db::ProjectRow) -> String {
    const MAX_ROUTINES: usize = 200;
    const MAX_TAGS: usize = 500;
    const MAX_UDTS: usize = 100;
    const MAX_AOIS: usize = 100;

    let m = &project.manifest;

    let routines: String = m
        .routines
        .iter()
        .take(MAX_ROUTINES)
        .map(|r| format!("{} ({})", r.name, r.language))
        .collect::<Vec<_>>()
        .join(", ");
    let tags: String = m
        .tags
        .iter()
        .take(MAX_TAGS)
        .map(|t| match &t.data_type {
            Some(dt) => format!("{}: {}", t.name, dt),
            None => t.name.clone(),
        })
        .collect::<Vec<_>>()
        .join(", ");
    let udts = m.udts.iter().take(MAX_UDTS).cloned().collect::<Vec<_>>().join(", ");
    let aois = m.aois.iter().take(MAX_AOIS).cloned().collect::<Vec<_>>().join(", ");

    format!(
        "You are ladX Studio, an expert PLC engineering assistant running locally. \
         The user is working on a project named \"{name}\" targeting {vendor}.\n\n\
         Project manifest (names only — full source is not yet available; ask the user to paste a routine if you need its body):\n\
         - Routines: {routines}\n\
         - Tags: {tags}\n\
         - UDTs: {udts}\n\
         - AOIs: {aois}\n\n\
         When the user asks about specific routines, tags, or UDTs, refer to them by exact name. \
         If a name they mention isn't in the manifest, say so — do not hallucinate.\n\
         When generating code, target IEC 61131-3 Structured Text by default; use ladder XML only if asked.\n\
         Be terse and engineer-to-engineer. Skip apologies and disclaimers.",
        name = project.name,
        vendor = project.vendor,
        routines = if routines.is_empty() { "(none)".into() } else { routines },
        tags = if tags.is_empty() { "(none)".into() } else { tags },
        udts = if udts.is_empty() { "(none)".into() } else { udts },
        aois = if aois.is_empty() { "(none)".into() } else { aois },
    )
}
