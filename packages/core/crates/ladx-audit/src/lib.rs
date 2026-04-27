//! Append-only audit log. ALCOA+ requires every prompt, retrieval, model
//! output, validator result, and human approval be recorded immutably.
//!
//! Two backends planned:
//! - SQLite (desktop): `%APPDATA%\ladX\audit.db` with WAL + WORM trigger.
//! - Postgres (cloud): a table with deny-update/deny-delete row-level policy.
//!
//! Phase 1 ships an in-memory backend so API routes compile and unit-test
//! without needing infra. Concrete backends land in Phase 2 (SQLite for
//! desktop) and Phase 1 follow-up (Postgres for cloud).

use async_trait::async_trait;
use chrono::Utc;
use ladx_types::AuditEntry;
use std::sync::{Arc, Mutex};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AuditError {
    #[error("backend error: {0}")]
    Backend(String),
}

pub type Result<T> = std::result::Result<T, AuditError>;

#[async_trait]
pub trait AuditLog: Send + Sync {
    async fn log(&self, entry: AuditEntry) -> Result<()>;
    async fn recent(&self, limit: u32) -> Result<Vec<AuditEntry>>;
}

/// Convenience constructor that records an event with the current time.
pub fn make_entry(actor: &str, event: &str, subject_id: Option<&str>) -> AuditEntry {
    AuditEntry {
        id: uuid::Uuid::new_v4().to_string(),
        timestamp: Utc::now(),
        actor: actor.into(),
        event: event.into(),
        subject_id: subject_id.map(str::to_string),
        payload: None,
    }
}

/// In-memory audit sink. Useful for tests and dev. NOT for production.
#[derive(Default, Clone)]
pub struct InMemoryAudit {
    entries: Arc<Mutex<Vec<AuditEntry>>>,
}

#[async_trait]
impl AuditLog for InMemoryAudit {
    async fn log(&self, entry: AuditEntry) -> Result<()> {
        self.entries
            .lock()
            .map_err(|e| AuditError::Backend(e.to_string()))?
            .push(entry);
        Ok(())
    }

    async fn recent(&self, limit: u32) -> Result<Vec<AuditEntry>> {
        let g = self
            .entries
            .lock()
            .map_err(|e| AuditError::Backend(e.to_string()))?;
        let take = limit as usize;
        Ok(g.iter().rev().take(take).cloned().collect())
    }
}
