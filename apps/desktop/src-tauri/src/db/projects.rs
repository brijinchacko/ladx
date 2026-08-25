//! Projects table + helpers. Manifest is stored as a TEXT column
//! holding the JSON-serialised `ProjectManifest`. We deliberately do
//! not impose a schema beyond `id PRIMARY KEY` so the manifest shape
//! can evolve in `ladx-types` without a SQL migration here.

use anyhow::{Context, Result};
use chrono::Utc;
use ladx_types::ProjectManifest;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub source_filename: String,
    pub size_bytes: u64,
    pub tag_count: u32,
    pub routine_count: u32,
    pub udt_count: u32,
    pub aoi_count: u32,
    pub parsed_at: String,
    pub manifest: ProjectManifest,
}

pub struct ProjectsDb {
    conn: Mutex<Connection>,
}

impl ProjectsDb {
    pub fn open(path: &PathBuf) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)
            .with_context(|| format!("opening projects db: {}", path.display()))?;
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;

            CREATE TABLE IF NOT EXISTS projects (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                vendor          TEXT NOT NULL,
                source_filename TEXT NOT NULL,
                size_bytes      INTEGER NOT NULL,
                tag_count       INTEGER NOT NULL DEFAULT 0,
                routine_count   INTEGER NOT NULL DEFAULT 0,
                udt_count       INTEGER NOT NULL DEFAULT 0,
                aoi_count       INTEGER NOT NULL DEFAULT 0,
                parsed_at       TEXT NOT NULL,
                manifest_json   TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS projects_parsed_at_idx
            ON projects (parsed_at DESC);
            "#,
        )?;
        // Conversations, messages, ladder programs and HMI applications all
        // live in the same DB: one file to back up, and one lock to reason
        // about.
        super::conversations::apply_schema(&conn)?;
        super::designs::apply_schema(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Run a closure with the locked connection. Used by the chat-history
    /// commands so they don't need their own DB handle.
    pub fn with_conn<R>(&self, f: impl FnOnce(&Connection) -> Result<R>) -> Result<R> {
        let conn = self.conn.lock().unwrap();
        f(&conn)
    }

    pub fn insert(
        &self,
        name: &str,
        vendor: &str,
        source_filename: &str,
        size_bytes: u64,
        manifest: &ProjectManifest,
    ) -> Result<ProjectRow> {
        let id = uuid::Uuid::new_v4().to_string();
        let parsed_at = Utc::now().to_rfc3339();
        let manifest_json = serde_json::to_string(manifest)?;
        let tag_count = manifest.tags.len() as u32;
        let routine_count = manifest.routines.len() as u32;
        let udt_count = manifest.udts.len() as u32;
        let aoi_count = manifest.aois.len() as u32;

        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, vendor, source_filename, size_bytes, tag_count, routine_count, udt_count, aoi_count, parsed_at, manifest_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                id,
                name,
                vendor,
                source_filename,
                size_bytes as i64,
                tag_count as i64,
                routine_count as i64,
                udt_count as i64,
                aoi_count as i64,
                parsed_at,
                manifest_json
            ],
        )?;

        Ok(ProjectRow {
            id,
            name: name.to_string(),
            vendor: vendor.to_string(),
            source_filename: source_filename.to_string(),
            size_bytes,
            tag_count,
            routine_count,
            udt_count,
            aoi_count,
            parsed_at,
            manifest: manifest.clone(),
        })
    }

    pub fn list(&self) -> Result<Vec<ProjectRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, vendor, source_filename, size_bytes, tag_count, routine_count, udt_count, aoi_count, parsed_at, manifest_json
             FROM projects ORDER BY parsed_at DESC",
        )?;
        let rows = stmt
            .query_map([], row_to_project)?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    }

    pub fn get(&self, id: &str) -> Result<Option<ProjectRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, vendor, source_filename, size_bytes, tag_count, routine_count, udt_count, aoi_count, parsed_at, manifest_json
             FROM projects WHERE id = ?",
        )?;
        let row = stmt.query_row(params![id], row_to_project).optional()?;
        Ok(row)
    }

    pub fn delete(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM projects WHERE id = ?", params![id])?;
        Ok(())
    }
}

fn row_to_project(r: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectRow> {
    let manifest_json: String = r.get("manifest_json")?;
    let manifest: ProjectManifest = serde_json::from_str(&manifest_json)
        .map_err(|e| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e)))?;
    Ok(ProjectRow {
        id: r.get("id")?,
        name: r.get("name")?,
        vendor: r.get("vendor")?,
        source_filename: r.get("source_filename")?,
        size_bytes: r.get::<_, i64>("size_bytes")? as u64,
        tag_count: r.get::<_, i64>("tag_count")? as u32,
        routine_count: r.get::<_, i64>("routine_count")? as u32,
        udt_count: r.get::<_, i64>("udt_count")? as u32,
        aoi_count: r.get::<_, i64>("aoi_count")? as u32,
        parsed_at: r.get("parsed_at")?,
        manifest,
    })
}
