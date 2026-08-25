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

#[cfg(test)]
mod tests {
    use super::*;

    /// A schema in memory, so a test never touches the real store.
    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        apply_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn a_project_has_one_ladder_program_that_saving_replaces() {
        // The cloud build has exactly one per project. Accumulating a second
        // would leave Monitor and Convert to guess which is current.
        let c = db();
        save_ladder(&c, Some("p1"), "First", r#"{"rungs":[]}"#).unwrap();
        save_ladder(&c, Some("p1"), "Second", r#"{"rungs":[1]}"#).unwrap();

        let all = list_ladder(&c).unwrap();
        assert_eq!(all.len(), 1);
        let row = load_ladder(&c, Some("p1")).unwrap().unwrap();
        assert_eq!(row.name, "Second");
        assert_eq!(row.doc, r#"{"rungs":[1]}"#);
    }

    #[test]
    fn saving_twice_keeps_the_same_id() {
        // The id is what a caller holds on to; changing it under them would
        // orphan anything that referenced the program.
        let c = db();
        let a = save_ladder(&c, Some("p1"), "x", "{}").unwrap();
        let b = save_ladder(&c, Some("p1"), "y", "{}").unwrap();
        assert_eq!(a.id, b.id);
    }

    #[test]
    fn the_scratch_program_is_separate_from_every_project() {
        let c = db();
        save_ladder(&c, None, "Scratch", r#"{"s":1}"#).unwrap();
        save_ladder(&c, Some("p1"), "Project", r#"{"p":1}"#).unwrap();

        assert_eq!(load_ladder(&c, None).unwrap().unwrap().doc, r#"{"s":1}"#);
        assert_eq!(
            load_ladder(&c, Some("p1")).unwrap().unwrap().doc,
            r#"{"p":1}"#
        );
        assert_eq!(list_ladder(&c).unwrap().len(), 2);
    }

    #[test]
    fn there_is_only_ever_one_scratch_program() {
        let c = db();
        save_ladder(&c, None, "First", "{}").unwrap();
        save_ladder(&c, None, "Second", "{}").unwrap();
        let scratch: Vec<_> = list_ladder(&c)
            .unwrap()
            .into_iter()
            .filter(|r| r.project_id.is_none())
            .collect();
        assert_eq!(scratch.len(), 1);
        assert_eq!(scratch[0].name, "Second");
    }

    #[test]
    fn a_project_with_no_program_loads_as_nothing_rather_than_erroring() {
        let c = db();
        assert!(load_ladder(&c, Some("nope")).unwrap().is_none());
        assert!(load_ladder(&c, None).unwrap().is_none());
    }

    #[test]
    fn a_project_may_have_several_hmi_applications() {
        // Unlike a ladder program: a plant has an overview screen set and a
        // maintenance one, and both belong to the same job.
        let c = db();
        create_hmi(&c, Some("p1"), "Overview", "{}").unwrap();
        create_hmi(&c, Some("p1"), "Maintenance", "{}").unwrap();
        assert_eq!(list_hmi(&c).unwrap().len(), 2);
    }

    #[test]
    fn every_application_gets_its_own_id() {
        let c = db();
        let a = create_hmi(&c, None, "A", "{}").unwrap();
        let b = create_hmi(&c, None, "B", "{}").unwrap();
        assert_ne!(a.id, b.id);
    }

    #[test]
    fn saving_an_application_updates_it_in_place() {
        let c = db();
        let row = create_hmi(&c, None, "A", r#"{"v":1}"#).unwrap();
        assert!(save_hmi(&c, &row.id, "A renamed", r#"{"v":2}"#).unwrap());

        let back = get_hmi(&c, &row.id).unwrap().unwrap();
        assert_eq!(back.name, "A renamed");
        assert_eq!(back.doc, r#"{"v":2}"#);
        assert_eq!(list_hmi(&c).unwrap().len(), 1);
    }

    #[test]
    fn saving_an_application_that_is_not_there_reports_it_rather_than_creating_one() {
        // A silent insert would leave a duplicate behind whenever a stale
        // window saved after the real one was deleted.
        let c = db();
        assert!(!save_hmi(&c, "missing", "x", "{}").unwrap());
        assert_eq!(list_hmi(&c).unwrap().len(), 0);
    }

    #[test]
    fn deleting_removes_only_the_one_asked_for() {
        let c = db();
        let a = create_hmi(&c, None, "A", "{}").unwrap();
        let b = create_hmi(&c, None, "B", "{}").unwrap();
        delete_hmi(&c, &a.id).unwrap();
        let left = list_hmi(&c).unwrap();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].id, b.id);
    }

    #[test]
    fn the_document_is_stored_verbatim() {
        // Rust never parses it: the shape belongs to the frontend packages,
        // and holding it in two languages means drifting the day one changes.
        let c = db();
        let doc = r#"{"screens":[{"widgets":[{"kind":"symbol","image":{"kind":"raster"}}]}],"odd":"é"}"#;
        let row = create_hmi(&c, None, "A", doc).unwrap();
        assert_eq!(get_hmi(&c, &row.id).unwrap().unwrap().doc, doc);
    }

    #[test]
    fn applying_the_schema_twice_is_safe() {
        // It runs on every open, so this is the normal path rather than an
        // edge case.
        let c = db();
        apply_schema(&c).unwrap();
        apply_schema(&c).unwrap();
        save_ladder(&c, Some("p1"), "x", "{}").unwrap();
        assert_eq!(list_ladder(&c).unwrap().len(), 1);
    }

    #[test]
    fn applications_are_listed_newest_first() {
        let c = db();
        create_hmi(&c, None, "Older", "{}").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        create_hmi(&c, None, "Newer", "{}").unwrap();
        let rows = list_hmi(&c).unwrap();
        assert_eq!(rows[0].name, "Newer");
    }
}
