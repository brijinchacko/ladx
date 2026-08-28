//! Small durable key/value store, in the same database as everything else.
//!
//! For what the assistant remembers: the conversation on each tool, and which
//! model was chosen. The web keeps these in the browser's own storage, which
//! is right there and wrong here.
//!
//! It is not pedantry about a rule. Webview storage is not the project folder,
//! is not backed up with it, does not travel on the memory stick at handover,
//! and is cleared by a webview reset that has nothing to do with LADX. A
//! conversation about why an interlock is written the way it is is the
//! reasoning behind logic that is now in a machine, and it deserves to live
//! where the rest of the work lives.
//!
//! One table rather than a column per thing, because the keys are the
//! frontend's to choose: `ladx.ai.thread.ladder:<project>` is a key this side
//! should not have to know the shape of.

use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension};

pub fn apply_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS kv (
            key        TEXT PRIMARY KEY,
            value      TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        "#,
    )?;
    Ok(())
}

pub fn get(conn: &Connection, key: &str) -> Result<Option<String>> {
    Ok(conn
        .query_row("SELECT value FROM kv WHERE key = ?", params![key], |r| {
            r.get::<_, String>(0)
        })
        .optional()?)
}

pub fn set(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value, chrono::Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

pub fn remove(conn: &Connection, key: &str) -> Result<()> {
    conn.execute("DELETE FROM kv WHERE key = ?", params![key])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        apply_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn round_trips_a_value() {
        let c = db();
        set(&c, "ladx.ai.thread.ladder:p1", "[{\"id\":\"t1\"}]").unwrap();
        assert_eq!(
            get(&c, "ladx.ai.thread.ladder:p1").unwrap().as_deref(),
            Some("[{\"id\":\"t1\"}]")
        );
    }

    #[test]
    fn a_key_that_was_never_set_is_not_an_error() {
        // The normal case on a first run, and the frontend treats it as "no
        // conversation yet" rather than as a failure.
        assert!(get(&db(), "nothing").unwrap().is_none());
    }

    #[test]
    fn writing_twice_replaces_rather_than_failing() {
        // The thread is written on every turn, so this is the common path.
        let c = db();
        set(&c, "k", "first").unwrap();
        set(&c, "k", "second").unwrap();
        assert_eq!(get(&c, "k").unwrap().as_deref(), Some("second"));
    }

    #[test]
    fn removing_clears_it() {
        let c = db();
        set(&c, "k", "v").unwrap();
        remove(&c, "k").unwrap();
        assert!(get(&c, "k").unwrap().is_none());
    }

    #[test]
    fn removing_something_absent_is_not_an_error() {
        // "Start the conversation again" on a thread that was never saved.
        assert!(remove(&db(), "never-there").is_ok());
    }

    #[test]
    fn holds_a_thread_the_size_the_assistant_keeps() {
        // Forty turns with step lists is not small, and a TEXT column has to
        // take it without truncating: a clipped JSON array is a thread that
        // fails to parse and is silently discarded on load.
        let c = db();
        let big = "x".repeat(400_000);
        set(&c, "k", &big).unwrap();
        assert_eq!(get(&c, "k").unwrap().unwrap().len(), 400_000);
    }
}
