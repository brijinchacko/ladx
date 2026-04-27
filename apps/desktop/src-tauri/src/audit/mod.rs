//! SQLite-backed audit log for Studio. Append-only; the WORM trigger
//! enforces "no UPDATE / no DELETE" at the DB level so a leaked client
//! can't tamper with history. Path is `%APPDATA%\ladX\audit.db` on
//! Windows, equivalent on macOS/Linux via Tauri's app-data dir.

use anyhow::{Context, Result};
use chrono::Utc;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct AuditDb {
    conn: Mutex<Connection>,
}

impl AuditDb {
    pub fn open(path: &PathBuf) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).with_context(|| {
                format!("creating audit dir: {}", parent.display())
            })?;
        }
        let conn = Connection::open(path).with_context(|| {
            format!("opening audit db: {}", path.display())
        })?;

        // WAL mode: better concurrency + crash safety. Same recommendation
        // for ALCOA+ append-only stores.
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = FULL;

            CREATE TABLE IF NOT EXISTS audit_entries (
                id          TEXT PRIMARY KEY,
                ts          TEXT NOT NULL,
                actor       TEXT NOT NULL,
                event       TEXT NOT NULL,
                subject_id  TEXT,
                payload     TEXT
            );

            CREATE TRIGGER IF NOT EXISTS audit_entries_no_update
            BEFORE UPDATE ON audit_entries
            BEGIN
                SELECT RAISE(ABORT, 'audit_entries is append-only — no UPDATE');
            END;

            CREATE TRIGGER IF NOT EXISTS audit_entries_no_delete
            BEFORE DELETE ON audit_entries
            BEGIN
                SELECT RAISE(ABORT, 'audit_entries is append-only — no DELETE');
            END;
            "#,
        )?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn log(&self, actor: &str, event: &str, subject_id: Option<&str>) -> Result<()> {
        let id = uuid::Uuid::new_v4().to_string();
        let ts = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO audit_entries (id, ts, actor, event, subject_id, payload) VALUES (?, ?, ?, ?, ?, NULL)",
            rusqlite::params![id, ts, actor, event, subject_id],
        )?;
        Ok(())
    }

    pub fn recent(&self, limit: u32) -> Result<Vec<AuditRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, ts, actor, event, subject_id FROM audit_entries ORDER BY ts DESC LIMIT ?",
        )?;
        let rows = stmt
            .query_map([limit], |r| {
                Ok(AuditRow {
                    id: r.get(0)?,
                    ts: r.get(1)?,
                    actor: r.get(2)?,
                    event: r.get(3)?,
                    subject_id: r.get(4)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AuditRow {
    pub id: String,
    pub ts: String,
    pub actor: String,
    pub event: String,
    pub subject_id: Option<String>,
}
