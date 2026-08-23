//! Local chat history. Lives in the same `projects.db` as the projects
//! table, they're tightly bound (every conversation links to a
//! project, except free-form ones with NULL project_id).
//!
//! There's no FK enforcement on project_id (NULL is valid) and we do
//! cascade delete in code, keeps the schema simple.

use anyhow::Result;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationRow {
    pub id: String,
    pub project_id: Option<String>,
    pub title: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageRow {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

/// Apply the conversation/message schema. Called inside ProjectsDb::open().
pub fn apply_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS conversations (
            id          TEXT PRIMARY KEY,
            project_id  TEXT,
            title       TEXT,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS conversations_project_idx
        ON conversations (project_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS messages (
            id              TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            role            TEXT NOT NULL,
            content         TEXT NOT NULL,
            created_at      TEXT NOT NULL,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS messages_conversation_idx
        ON messages (conversation_id, created_at);
        "#,
    )?;
    Ok(())
}

pub fn ensure_for_project(
    conn: &Connection,
    project_id: Option<&str>,
) -> Result<ConversationRow> {
    // Find the most recent conversation for this scope.
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, created_at, updated_at
         FROM conversations
         WHERE (project_id IS NULL AND ?1 IS NULL) OR project_id = ?1
         ORDER BY updated_at DESC LIMIT 1",
    )?;
    let existing = stmt
        .query_row(params![project_id], row_to_conversation)
        .optional()?;
    if let Some(c) = existing {
        return Ok(c);
    }
    create(conn, project_id)
}

pub fn create(conn: &Connection, project_id: Option<&str>) -> Result<ConversationRow> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO conversations (id, project_id, title, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)",
        params![id, project_id, now, now],
    )?;
    Ok(ConversationRow {
        id,
        project_id: project_id.map(str::to_string),
        title: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

pub fn append_message(
    conn: &Connection,
    conversation_id: &str,
    role: &str,
    content: &str,
) -> Result<MessageRow> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
        params![id, conversation_id, role, content, now],
    )?;
    conn.execute(
        "UPDATE conversations SET updated_at = ? WHERE id = ?",
        params![now, conversation_id],
    )?;
    Ok(MessageRow {
        id,
        conversation_id: conversation_id.to_string(),
        role: role.to_string(),
        content: content.to_string(),
        created_at: now,
    })
}

pub fn list_messages(conn: &Connection, conversation_id: &str) -> Result<Vec<MessageRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, created_at
         FROM messages WHERE conversation_id = ? ORDER BY created_at",
    )?;
    let rows = stmt
        .query_map([conversation_id], row_to_message)?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

pub fn delete_conversation(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM conversations WHERE id = ?", params![id])?;
    Ok(())
}

fn row_to_conversation(r: &rusqlite::Row<'_>) -> rusqlite::Result<ConversationRow> {
    Ok(ConversationRow {
        id: r.get("id")?,
        project_id: r.get("project_id")?,
        title: r.get("title")?,
        created_at: r.get("created_at")?,
        updated_at: r.get("updated_at")?,
    })
}

fn row_to_message(r: &rusqlite::Row<'_>) -> rusqlite::Result<MessageRow> {
    Ok(MessageRow {
        id: r.get("id")?,
        conversation_id: r.get("conversation_id")?,
        role: r.get("role")?,
        content: r.get("content")?,
        created_at: r.get("created_at")?,
    })
}
