//! Ladder programs and HMI applications, stored locally.
//!
//! Both are one JSON document per project, which is the same shape the cloud
//! build uses: a ladder program belongs to a project, and so does an HMI
//! application. The document's internals belong to `@ladx/studio` and
//! `@ladx/hmi`; nothing here parses them, because duplicating those shapes in
//! Rust would mean maintaining them twice and drifting the day one changes.
//!
//! `project_id` is nullable and holds the unattached scratch program, of which
//! there is one, matching the cloud behaviour so a person moving between the
//! two surfaces finds the same thing.

use anyhow::Result;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignRow {
    pub id: String,
    pub project_id: Option<String>,
    pub name: String,
    /// The document, verbatim JSON.
    pub doc: String,
    pub updated_at: String,
}

pub fn apply_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS ladder_programs (
            id          TEXT PRIMARY KEY,
            project_id  TEXT,
            name        TEXT NOT NULL DEFAULT 'Untitled program',
            doc         TEXT NOT NULL,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        -- One program per project, so saving twice updates rather than
        -- accumulating. The scratch program has a NULL project_id, and SQLite
        -- treats NULLs as distinct in a unique index, so it is handled by the
        -- partial index below instead.
        CREATE UNIQUE INDEX IF NOT EXISTS ladder_programs_project_idx
        ON ladder_programs (project_id) WHERE project_id IS NOT NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS ladder_programs_scratch_idx
        ON ladder_programs (id) WHERE project_id IS NULL;

        CREATE TABLE IF NOT EXISTS hmi_projects (
            id          TEXT PRIMARY KEY,
            project_id  TEXT,
            name        TEXT NOT NULL DEFAULT 'Untitled HMI',
            doc         TEXT NOT NULL,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS hmi_projects_project_idx
        ON hmi_projects (project_id);

        CREATE INDEX IF NOT EXISTS hmi_projects_updated_idx
        ON hmi_projects (updated_at DESC);
        "#,
    )?;
    Ok(())
}

/// The one ladder program for a project, or the scratch one when `project_id`
/// is None.
pub fn load_ladder(conn: &Connection, project_id: Option<&str>) -> Result<Option<DesignRow>> {
    let row = match project_id {
        Some(pid) => conn
            .query_row(
                "SELECT id, project_id, name, doc, updated_at
                 FROM ladder_programs WHERE project_id = ?1",
                params![pid],
                map_row,
            )
            .optional()?,
        None => conn
            .query_row(
                "SELECT id, project_id, name, doc, updated_at
                 FROM ladder_programs WHERE project_id IS NULL LIMIT 1",
                [],
                map_row,
            )
            .optional()?,
    };
    Ok(row)
}

/// Write a program, replacing whatever the project had.
pub fn save_ladder(
    conn: &Connection,
    project_id: Option<&str>,
    name: &str,
    doc: &str,
) -> Result<DesignRow> {
    let now = Utc::now().to_rfc3339();
    let existing = load_ladder(conn, project_id)?;
    let id = existing
        .as_ref()
        .map(|r| r.id.clone())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    conn.execute(
        "INSERT INTO ladder_programs (id, project_id, name, doc, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(id) DO UPDATE SET name = ?3, doc = ?4, updated_at = ?5",
        params![id, project_id, name, doc, now],
    )?;

    Ok(DesignRow {
        id,
        project_id: project_id.map(|s| s.to_string()),
        name: name.to_string(),
        doc: doc.to_string(),
        updated_at: now,
    })
}

pub fn list_ladder(conn: &Connection) -> Result<Vec<DesignRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, doc, updated_at
         FROM ladder_programs ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/* ─────────────────────────────── HMI ─────────────────────────────── */

pub fn list_hmi(conn: &Connection) -> Result<Vec<DesignRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, doc, updated_at
         FROM hmi_projects ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_hmi(conn: &Connection, id: &str) -> Result<Option<DesignRow>> {
    Ok(conn
        .query_row(
            "SELECT id, project_id, name, doc, updated_at FROM hmi_projects WHERE id = ?1",
            params![id],
            map_row,
        )
        .optional()?)
}

/// Create an application. Unlike a ladder program a project may have several,
/// because a plant has an overview screen set and a maintenance one.
pub fn create_hmi(
    conn: &Connection,
    project_id: Option<&str>,
    name: &str,
    doc: &str,
) -> Result<DesignRow> {
    let now = Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO hmi_projects (id, project_id, name, doc, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![id, project_id, name, doc, now],
    )?;
    Ok(DesignRow {
        id,
        project_id: project_id.map(|s| s.to_string()),
        name: name.to_string(),
        doc: doc.to_string(),
        updated_at: now,
    })
}

pub fn save_hmi(conn: &Connection, id: &str, name: &str, doc: &str) -> Result<bool> {
    let now = Utc::now().to_rfc3339();
    let n = conn.execute(
        "UPDATE hmi_projects SET name = ?2, doc = ?3, updated_at = ?4 WHERE id = ?1",
        params![id, name, doc, now],
    )?;
    Ok(n > 0)
}

pub fn delete_hmi(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM hmi_projects WHERE id = ?1", params![id])?;
    Ok(())
}

fn map_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DesignRow> {
    Ok(DesignRow {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        doc: row.get(3)?,
        updated_at: row.get(4)?,
    })
}
