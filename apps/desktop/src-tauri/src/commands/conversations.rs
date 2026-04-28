//! Tauri commands for the local chat history. Helpers borrow the shared
//! ProjectsDb connection so we don't open a second handle.

use crate::db::{
    conversations::{
        append_message as db_append, create as db_create, delete_conversation as db_delete,
        ensure_for_project as db_ensure, list_messages as db_list_messages, ConversationRow,
        MessageRow,
    },
    ProjectsDb,
};
use crate::state::AppState;

#[tauri::command]
pub fn ensure_conversation(
    state: tauri::State<'_, AppState>,
    project_id: Option<String>,
) -> Result<ConversationRow, String> {
    with_db(&state.projects, |conn| {
        db_ensure(conn, project_id.as_deref())
    })
}

#[tauri::command]
pub fn create_conversation(
    state: tauri::State<'_, AppState>,
    project_id: Option<String>,
) -> Result<ConversationRow, String> {
    with_db(&state.projects, |conn| db_create(conn, project_id.as_deref()))
}

#[tauri::command]
pub fn list_messages(
    state: tauri::State<'_, AppState>,
    conversation_id: String,
) -> Result<Vec<MessageRow>, String> {
    with_db(&state.projects, |conn| {
        db_list_messages(conn, &conversation_id)
    })
}

#[tauri::command]
pub fn append_message(
    state: tauri::State<'_, AppState>,
    conversation_id: String,
    role: String,
    content: String,
) -> Result<MessageRow, String> {
    with_db(&state.projects, |conn| {
        db_append(conn, &conversation_id, &role, &content)
    })
}

#[tauri::command]
pub fn delete_conversation(
    state: tauri::State<'_, AppState>,
    conversation_id: String,
) -> Result<(), String> {
    with_db(&state.projects, |conn| {
        db_delete(conn, &conversation_id)
    })
}

fn with_db<R>(
    db: &ProjectsDb,
    f: impl FnOnce(&rusqlite::Connection) -> anyhow::Result<R>,
) -> Result<R, String> {
    db.with_conn(f).map_err(|e| e.to_string())
}
