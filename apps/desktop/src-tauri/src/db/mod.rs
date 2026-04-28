//! Local-only SQLite store for parsed projects + their manifests. Lives
//! at `%APPDATA%\ladX\projects.db` (mac/Linux equivalent via Tauri's
//! app-data dir). Project file *contents* are NOT stored here — they
//! live on disk under `%APPDATA%\ladX\storage\<uuid>.<ext>`. The DB
//! holds metadata + manifest JSON only.

pub mod projects;
pub use projects::*;
