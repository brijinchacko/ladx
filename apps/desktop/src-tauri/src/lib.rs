//! ladX.ai Studio — Tauri shell.
//!
//! CRITICAL — Network policy: this app makes EXACTLY ONE outbound HTTP call
//! in its entire lifetime: a licence activation check against
//! `https://auth.ladx.ai/activate`. No telemetry, no analytics, no model
//! downloads. See `apps/desktop/CLAUDE.md`.

#[tauri::command]
fn ping() -> &'static str {
    "pong"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![ping])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
