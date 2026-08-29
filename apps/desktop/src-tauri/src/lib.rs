//! ladX.ai Studio, Tauri shell.
//!
//! CRITICAL, Network policy: this app makes EXACTLY ONE outbound HTTP
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
mod workspace;

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
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            commands::settings::features_list,
            commands::settings::feature_set,
            commands::projects::pick_and_parse_project,
            commands::projects::list_projects,
            commands::projects::get_project,
            commands::projects::delete_project,
            commands::validator::validate_st,
            // Behind vendor.rockwell. Reads the logic rather than the names,
            // and is not what the project picker uses.
            commands::vendor::l5x_import,
            commands::vendor::pick_and_import_l5x,
            commands::vendor::l5x_export,
            commands::autofix::auto_fix_st,
            commands::ai::ai_complete,
            commands::conversations::ensure_conversation,
            commands::conversations::create_conversation,
            commands::conversations::list_messages,
            commands::conversations::append_message,
            commands::conversations::delete_conversation,
            commands::designs::ladder_load,
            commands::designs::ladder_save,
            commands::designs::ladder_list,
            commands::designs::hmi_list,
            commands::designs::hmi_get,
            commands::designs::hmi_create,
            commands::designs::hmi_save,
            commands::designs::hmi_delete,
            commands::designs::cad_list,
            commands::designs::cad_get,
            commands::designs::cad_create,
            commands::designs::cad_save,
            commands::designs::cad_rename,
            commands::designs::cad_set_project,
            commands::designs::cad_delete,
            commands::workspace::pick_workspace,
            commands::workspace::create_project_folder,
            commands::workspace::list_project_folders,
            commands::workspace::open_project_folder,
            commands::workspace::save_into_project,
            commands::workspace::read_from_project,
            commands::workspace::list_project_files,
            commands::workspace::reveal_project,
            commands::workspace::set_workspace_dir,
            commands::workspace::get_workspace_dir,
            commands::workspace::set_last_project,
            commands::workspace::set_sidebar_collapsed,
            commands::workspace::set_check_for_updates,
            commands::memory::memory_get,
            commands::memory::memory_set,
            commands::memory::memory_remove,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
