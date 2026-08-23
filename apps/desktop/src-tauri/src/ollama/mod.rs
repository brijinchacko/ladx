//! Ollama lifecycle. Detects whether Ollama is running on localhost,
//! lists available models, and (in chat.rs) streams completions back to
//! the Tauri frontend. We never spawn Ollama ourselves, the user
//! installs it separately and runs `ollama serve` (per spec / desktop
//! CLAUDE.md).

pub mod client;
pub mod models;
