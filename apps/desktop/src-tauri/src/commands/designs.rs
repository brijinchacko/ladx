//! Tauri commands for ladder programs and HMI applications.
//!
//! These are what replaces the cloud build's HTTP routes. The desktop makes no
//! outbound calls at all, so the frontend reaches storage through `invoke`,
//! and the document travels as a JSON string that only the frontend parses.

use crate::db::{
    designs::{
        create_hmi as db_create_hmi, delete_hmi as db_delete_hmi, get_hmi as db_get_hmi,
        list_hmi as db_list_hmi, list_ladder as db_list_ladder, load_ladder as db_load_ladder,
        save_hmi as db_save_hmi, save_ladder as db_save_ladder, DesignRow,
    },
    ProjectsDb,
};
use crate::state::AppState;

/// A document larger than this is a bug rather than a drawing, and writing it
/// would block the UI thread on serialisation.
const MAX_DOC_BYTES: usize = 4_000_000;

#[tauri::command]
pub fn ladder_load(
    state: tauri::State<'_, AppState>,
    project_id: Option<String>,
) -> Result<Option<DesignRow>, String> {
    with_db(&state.projects, |conn| {
        db_load_ladder(conn, project_id.as_deref())
    })
}

#[tauri::command]
pub fn ladder_save(
    state: tauri::State<'_, AppState>,
    project_id: Option<String>,
    name: String,
    doc: String,
) -> Result<DesignRow, String> {
    if doc.len() > MAX_DOC_BYTES {
        return Err("that program is too large to store".into());
    }
    with_db(&state.projects, |conn| {
        db_save_ladder(conn, project_id.as_deref(), &name, &doc)
    })
}

#[tauri::command]
pub fn ladder_list(state: tauri::State<'_, AppState>) -> Result<Vec<DesignRow>, String> {
    with_db(&state.projects, db_list_ladder)
}

#[tauri::command]
pub fn hmi_list(state: tauri::State<'_, AppState>) -> Result<Vec<DesignRow>, String> {
    with_db(&state.projects, db_list_hmi)
}

#[tauri::command]
pub fn hmi_get(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<Option<DesignRow>, String> {
    with_db(&state.projects, |conn| db_get_hmi(conn, &id))
}

#[tauri::command]
pub fn hmi_create(
    state: tauri::State<'_, AppState>,
    project_id: Option<String>,
    name: String,
    doc: String,
) -> Result<DesignRow, String> {
    if doc.len() > MAX_DOC_BYTES {
        return Err("that application is too large to store".into());
    }
    with_db(&state.projects, |conn| {
        db_create_hmi(conn, project_id.as_deref(), &name, &doc)
    })
}

#[tauri::command]
pub fn hmi_save(
    state: tauri::State<'_, AppState>,
    id: String,
    name: String,
    doc: String,
) -> Result<bool, String> {
    if doc.len() > MAX_DOC_BYTES {
        return Err("that application is too large to store".into());
    }
    with_db(&state.projects, |conn| db_save_hmi(conn, &id, &name, &doc))
}

#[tauri::command]
pub fn hmi_delete(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    with_db(&state.projects, |conn| db_delete_hmi(conn, &id))
}

fn with_db<T>(
    db: &ProjectsDb,
    f: impl FnOnce(&rusqlite::Connection) -> anyhow::Result<T>,
) -> Result<T, String> {
    db.with_conn(f).map_err(|e| e.to_string())
}
