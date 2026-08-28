//! Tauri commands for ladder programs, HMI applications and drawings.
//!
//! These are what replaces the cloud build's HTTP routes. The desktop makes no
//! outbound calls at all, so the frontend reaches storage through `invoke`,
//! and the document travels as a JSON string that only the frontend parses.

use crate::db::{
    designs::{
        create_cad as db_create_cad, create_hmi as db_create_hmi, delete_cad as db_delete_cad,
        delete_hmi as db_delete_hmi, get_cad as db_get_cad, get_hmi as db_get_hmi,
        list_cad as db_list_cad, list_hmi as db_list_hmi, list_ladder as db_list_ladder,
        load_ladder as db_load_ladder, rename_cad as db_rename_cad, save_cad as db_save_cad,
        save_hmi as db_save_hmi, save_ladder as db_save_ladder,
        set_cad_project as db_set_cad_project, DesignRow,
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

/* ── drawings ── */

#[tauri::command]
pub fn cad_list(state: tauri::State<'_, AppState>) -> Result<Vec<DesignRow>, String> {
    with_db(&state.projects, db_list_cad)
}

#[tauri::command]
pub fn cad_get(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<Option<DesignRow>, String> {
    with_db(&state.projects, |conn| db_get_cad(conn, &id))
}

#[tauri::command]
pub fn cad_create(
    state: tauri::State<'_, AppState>,
    project_id: Option<String>,
    name: String,
    doc: String,
) -> Result<DesignRow, String> {
    if doc.len() > MAX_DOC_BYTES {
        return Err("that drawing is too large to store".into());
    }
    with_db(&state.projects, |conn| {
        db_create_cad(conn, project_id.as_deref(), &name, &doc)
    })
}

#[tauri::command]
pub fn cad_save(
    state: tauri::State<'_, AppState>,
    id: String,
    name: String,
    doc: String,
) -> Result<bool, String> {
    if doc.len() > MAX_DOC_BYTES {
        return Err("that drawing is too large to store".into());
    }
    with_db(&state.projects, |conn| db_save_cad(conn, &id, &name, &doc))
}

/// Rename without writing the drawing.
///
/// The sheet list renames from a row with no drawing in hand, so a rename that
/// also wrote a document would write whatever the list happened to be holding.
#[tauri::command]
pub fn cad_rename(
    state: tauri::State<'_, AppState>,
    id: String,
    name: String,
) -> Result<bool, String> {
    with_db(&state.projects, |conn| db_rename_cad(conn, &id, &name))
}

#[tauri::command]
pub fn cad_set_project(
    state: tauri::State<'_, AppState>,
    id: String,
    project_id: Option<String>,
) -> Result<bool, String> {
    with_db(&state.projects, |conn| {
        db_set_cad_project(conn, &id, project_id.as_deref())
    })
}

#[tauri::command]
pub fn cad_delete(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    with_db(&state.projects, |conn| db_delete_cad(conn, &id))
}

fn with_db<T>(
    db: &ProjectsDb,
    f: impl FnOnce(&rusqlite::Connection) -> anyhow::Result<T>,
) -> Result<T, String> {
    db.with_conn(f).map_err(|e| e.to_string())
}
