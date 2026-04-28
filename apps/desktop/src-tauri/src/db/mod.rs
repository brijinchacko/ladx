//! Local-only SQLite store for parsed projects + their manifests + the
//! chat history that goes with them. Lives at
//! `%APPDATA%\ladX\projects.db` (mac/Linux equivalent via Tauri's
//! app-data dir). Project file *contents* are NOT stored here — they
//! live on disk under `%APPDATA%\ladX\storage\<uuid>.<ext>`. The DB
//! holds metadata + manifest JSON + chat threads.

pub mod conversations;
pub mod projects;
pub use projects::*;
