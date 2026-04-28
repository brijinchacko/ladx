//! ladX.ai Studio — Tauri shell.
//!
//! CRITICAL — Network policy: this app makes EXACTLY ONE outbound HTTP
//! call in its entire lifetime: a licence activation check against
//! `https://auth.ladx.ai/activate` (override via LADX_ACTIVATION_URL).
//! Every other network call is forbidden. See `apps/desktop/CLAUDE.md`.
//!
//! Talking to Ollama on `localhost:11434` is local-only and not subject
//! to that policy.

mod audit;
mod commands;
mod db;
mod licence;
mod ollama;
mod state;

use tauri::Manager;

#[tauri::command]
fn ping() -> &'static str {
    "pong"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle();
            let state = state::AppState::build(handle).map_err(|e| e.to_string())?;
            // Stamp boot in the audit log so we can prove a session
            // happened even if everything else later fails.
            state.audit.log("system", "studio_boot", None).ok();
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            commands::ollama::ollama_status,
            commands::ollama::ollama_models,
            commands::licence::licence_status,
            commands::licence::licence_activate,
            commands::chat::ollama_chat_stream,
            commands::settings::settings_load,
            commands::settings::settings_save,
            commands::projects::pick_and_parse_project,
            commands::projects::list_projects,
            commands::projects::get_project,
            commands::projects::delete_project,
            commands::validator::validate_st,
            commands::autofix::auto_fix_st,
            commands::conversations::ensure_conversation,
            commands::conversations::create_conversation,
            commands::conversations::list_messages,
            commands::conversations::append_message,
            commands::conversations::delete_conversation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
