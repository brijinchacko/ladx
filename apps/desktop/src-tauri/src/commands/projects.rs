//! Project lifecycle commands. The frontend opens a native file
//! dialog (via the dialog plugin), passes the chosen path back here,
//! and we read the bytes, parse via `ladx-parsers`, copy the original
//! file into the per-install storage dir, and persist a row in the
//! local SQLite. Original-file content stays on disk; the DB has
//! metadata + manifest JSON only (per desktop CLAUDE.md).

use crate::db::ProjectRow;
use crate::state::AppState;
use ladx_parsers::parse_project_bytes;
use std::path::PathBuf;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn pick_and_parse_project(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Option<ProjectRow>, String> {
    // Native file dialog. Returns None when the user cancels.
    let chosen: Option<PathBuf> = app
        .dialog()
        .file()
        .add_filter("PLC project", &["l5x", "xml"])
        .blocking_pick_file()
        .and_then(|p| p.into_path().ok());

    let Some(src_path) = chosen else {
        return Ok(None);
    };

    let bytes = std::fs::read(&src_path).map_err(|e| e.to_string())?;
    let filename = src_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("project")
        .to_string();

    let parsed = parse_project_bytes(&filename, &bytes).map_err(|e| e.to_string())?;

    // Copy the source file into the local storage dir. We keep this so
    // re-parsing later (when the parsers crate gets smarter) doesn't
    // require the user to re-pick the file.
    let stored_filename = format!(
        "{}-{}",
        uuid::Uuid::new_v4(),
        sanitize_filename(&filename)
    );
    let dst = state.paths.project_storage_dir.join(&stored_filename);
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&dst, &bytes).map_err(|e| e.to_string())?;

    let vendor = format!("{:?}", parsed.project.vendor).to_lowercase();
    let row = state
        .projects
        .insert(
            &parsed.project.name,
            &vendor,
            &filename,
            bytes.len() as u64,
            &parsed.manifest,
        )
        .map_err(|e| e.to_string())?;

    state
        .audit
        .log("user", "project_imported", Some(&row.id))
        .ok();

    Ok(Some(row))
}

#[tauri::command]
pub fn list_projects(state: tauri::State<'_, AppState>) -> Result<Vec<ProjectRow>, String> {
    state.projects.list().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_project(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<Option<ProjectRow>, String> {
    state.projects.get(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_project(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    state.projects.delete(&id).map_err(|e| e.to_string())?;
    state
        .audit
        .log("user", "project_deleted", Some(&id))
        .ok();
    Ok(())
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' => c,
            _ => '_',
        })
        .collect()
}
