//! Closes spec §8.1 on the desktop: when the validator fails, we
//! re-prompt Ollama with the diagnostics ("fix every diagnostic above
//! and return the corrected routine — reply with ONLY one ```st block"),
//! validate the response, retry up to MAX_ATTEMPTS. Mirrors the cloud
//! `autoFix` helper at apps/web/lib/inference/auto-fix.ts.

use futures_util::StreamExt;
use ladx_inference::{
    ChatMessage as InferenceChatMessage, ChatRequest, LlmClient, Role,
    ollama::OllamaClient as InferenceOllama,
};
use ladx_types::{ValidatorDiagnostic, ValidatorReport};
use ladx_validator::{
    light::LightValidator, matiec::MatiecValidator, validate_with_fallback,
};
use serde::{Deserialize, Serialize};

use crate::state::AppState;

const MAX_ATTEMPTS: u32 = 3;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoFixAttempt {
    pub source: String,
    pub report: ValidatorReport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoFixResult {
    pub ok: bool,
    pub source: String,
    pub report: ValidatorReport,
    pub attempts: Vec<AutoFixAttempt>,
}

#[tauri::command]
pub async fn auto_fix_st(
    state: tauri::State<'_, AppState>,
    source: String,
    initial_report: ValidatorReport,
    project_id: Option<String>,
    model: Option<String>,
    max_attempts: Option<u32>,
) -> Result<AutoFixResult, String> {
    let max = max_attempts.unwrap_or(MAX_ATTEMPTS).min(MAX_ATTEMPTS);
    let model = model.unwrap_or_else(default_model);

    let mut attempts = Vec::new();
    attempts.push(AutoFixAttempt {
        source: source.clone(),
        report: initial_report.clone(),
    });
    if initial_report.ok {
        return Ok(AutoFixResult {
            ok: true,
            source,
            report: initial_report,
            attempts,
        });
    }

    let system_prompt = if let Some(pid) = &project_id {
        if let Ok(Some(project)) = state.projects.get(pid) {
            Some(crate::commands::chat::project_system_prompt_for(&project))
        } else {
            None
        }
    } else {
        None
    };

    let mut current_source = source;
    let mut current_report = initial_report;
    let client = InferenceOllama::default();

    for _ in 0..max {
        let mut messages: Vec<InferenceChatMessage> = Vec::new();
        if let Some(p) = &system_prompt {
            messages.push(InferenceChatMessage {
                role: Role::System,
                content: p.clone(),
            });
        }
        messages.push(InferenceChatMessage {
            role: Role::User,
            content: build_feedback_prompt(&current_source, &current_report),
        });

        let req = ChatRequest {
            model: model.clone(),
            messages,
            max_tokens: None,
            temperature: Some(0.2),
        };

        let raw = match collect_stream(&client, req).await {
            Ok(s) => s,
            Err(e) => return Err(e),
        };
        let fixed = extract_st_block(&raw);
        let report = run_validator(&fixed)?;
        attempts.push(AutoFixAttempt {
            source: fixed.clone(),
            report: report.clone(),
        });

        if report.ok {
            state
                .audit
                .log("user", "auto_fix_succeeded", Some(&format!("attempts={}", attempts.len())))
                .ok();
            return Ok(AutoFixResult {
                ok: true,
                source: fixed,
                report,
                attempts,
            });
        }
        current_source = fixed;
        current_report = report;
    }

    state
        .audit
        .log("user", "auto_fix_failed", Some(&format!("attempts={}", attempts.len())))
        .ok();
    Ok(AutoFixResult {
        ok: false,
        source: current_source,
        report: current_report,
        attempts,
    })
}

async fn collect_stream(
    client: &InferenceOllama,
    req: ChatRequest,
) -> Result<String, String> {
    let mut stream = client.chat_stream(req).await.map_err(|e| e.to_string())?;
    let mut acc = String::new();
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(c) => {
                acc.push_str(&c.delta);
                if c.finish_reason.is_some() {
                    break;
                }
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(acc)
}

fn run_validator(source: &str) -> Result<ValidatorReport, String> {
    let primary = MatiecValidator::from_env();
    let fallback = LightValidator;
    validate_with_fallback(&primary, &fallback, source).map_err(|e| e.to_string())
}

fn build_feedback_prompt(source: &str, report: &ValidatorReport) -> String {
    let mut out = String::new();
    out.push_str("Here is some IEC 61131-3 Structured Text that failed validation:\n\n```st\n");
    out.push_str(source);
    out.push_str("\n```\n\n");
    out.push_str(&format!(
        "The previous ST output failed validation ({} backend).\n\nDiagnostics:\n",
        report.backend
    ));
    let mut count = 0;
    for d in &report.diagnostics {
        if count >= 30 {
            break;
        }
        out.push_str(&format_diagnostic(d));
        out.push('\n');
        count += 1;
    }
    if report.diagnostics.len() > 30 {
        out.push_str(&format!(
            "…and {} more diagnostics.\n",
            report.diagnostics.len() - 30
        ));
    }
    out.push_str("\nFix every diagnostic above and return the corrected routine.\n");
    out.push_str("Reply with ONLY one ```st code block — no commentary, no markdown around it.");
    out
}

fn format_diagnostic(d: &ValidatorDiagnostic) -> String {
    let loc = if d.line > 0 {
        if d.column > 0 {
            format!("line {}, col {}", d.line, d.column)
        } else {
            format!("line {}", d.line)
        }
    } else {
        "(unknown loc)".to_string()
    };
    let sev = match d.severity {
        ladx_types::DiagnosticSeverity::Error => "error",
        ladx_types::DiagnosticSeverity::Warning => "warning",
        ladx_types::DiagnosticSeverity::Info => "info",
    };
    format!("- [{sev}] {loc}: {} ({})", d.message, d.source)
}

/// Pull the first ```st (or ```structured-text) fenced block out of the
/// model's reply. Falls back to any ``` fenced block, then the whole
/// trimmed text.
fn extract_st_block(content: &str) -> String {
    let lower = content.to_ascii_lowercase();
    for tag in ["```st", "```structured-text", "```iec"] {
        if let Some(start) = lower.find(tag) {
            let after = start + tag.len();
            if let Some(rel_end) = content[after..].find("```") {
                // Skip to next newline after the opening fence.
                let body_start = match content[after..after + rel_end].find('\n') {
                    Some(nl) => after + nl + 1,
                    None => after,
                };
                return content[body_start..after + rel_end].trim().to_string();
            }
        }
    }
    if let Some(start) = content.find("```") {
        let after = start + 3;
        if let Some(rel_end) = content[after..].find("```") {
            let body_start = match content[after..after + rel_end].find('\n') {
                Some(nl) => after + nl + 1,
                None => after,
            };
            return content[body_start..after + rel_end].trim().to_string();
        }
    }
    content.trim().to_string()
}

fn default_model() -> String {
    // Same biased default as the model picker. The frontend usually
    // passes the user-selected model explicitly.
    "qwen2.5-coder:14b".into()
}
