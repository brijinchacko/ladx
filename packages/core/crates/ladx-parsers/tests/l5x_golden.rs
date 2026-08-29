//! The fixture projects, written out as L5X, and read back.
//!
//! `ladx-ir` cannot host these: it would have to depend on `ladx-parsers`,
//! which depends on it. So the IR fixtures are read from the same place and the
//! L5X side of the story lives here.
//!
//! Two things are asserted. The written L5X is byte-stable against a golden, so
//! a change in what LADX exports is visible in a diff rather than discovered by
//! a customer. And every fixture survives IR to L5X and back, which is the
//! claim the import and export make jointly and neither can make alone.
//!
//! ```text
//! UPDATE_GOLDEN=1 cargo test -p ladx-parsers --test l5x_golden
//! ```

use ladx_ir::{IrProject, PouBody, neutral_text};
use ladx_parsers::{l5x_ir, l5x_write};
use std::path::PathBuf;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../..")
        .canonicalize()
        .expect("repo root should resolve")
}

fn fixtures() -> Vec<(String, IrProject)> {
    let dir = repo_root().join("tests/fixtures/projects");
    let mut found: Vec<_> = std::fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("no fixtures at {}: {e}", dir.display()))
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    found.sort();
    assert!(!found.is_empty(), "no fixtures in {}", dir.display());

    found
        .into_iter()
        .map(|d| {
            let slug = d.file_name().unwrap().to_string_lossy().into_owned();
            let raw = std::fs::read_to_string(d.join("project.ir.json")).unwrap();
            (slug, serde_json::from_str(&raw).unwrap())
        })
        .collect()
}

fn check_golden(name: &str, actual: &str) {
    let path = repo_root().join("tests/golden").join(name);
    if std::env::var("UPDATE_GOLDEN").is_ok() {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, actual).unwrap();
        return;
    }
    let expected = std::fs::read_to_string(&path).unwrap_or_else(|_| {
        panic!(
            "no golden at {}.\nRun: UPDATE_GOLDEN=1 cargo test -p ladx-parsers --test l5x_golden",
            path.display()
        )
    });
    if expected != actual {
        eprintln!("--- expected ---\n{expected}\n--- actual ---\n{actual}");
        panic!("golden mismatch for {name}");
    }
}

/// What LADX exports, frozen.
#[test]
fn exported_l5x_is_unchanged() {
    for (slug, project) in fixtures() {
        let out = l5x_write::write(&project)
            .unwrap_or_else(|e| panic!("{slug} could not be written: {e}"));
        check_golden(&format!("{slug}.L5X"), &out.xml);
    }
}

/// IR to L5X and back, for every fixture.
///
/// The joint claim: whatever the import and the export each do individually,
/// together they must return the project. A fixture that loses a routine here
/// would be a project that loses a routine on a customer's machine.
#[test]
fn every_fixture_survives_a_trip_through_l5x() {
    for (slug, project) in fixtures() {
        let xml = l5x_write::write(&project).unwrap().xml;
        let back = l5x_ir::parse_to_ir(xml.as_bytes())
            .unwrap_or_else(|e| panic!("{slug}: our own L5X did not parse: {e}\n{xml}"))
            .project;

        assert_eq!(back.name, project.name, "{slug} lost its name");

        // Tags: the IR fixtures are all controller scope, so the names should
        // come back identical.
        let before: Vec<&str> = project.tags.iter().map(|t| t.name.as_str()).collect();
        let after: Vec<&str> = back.tags.iter().map(|t| t.name.as_str()).collect();
        assert_eq!(after, before, "{slug} changed its tags");

        // Comments are the first thing an exporter drops and the first thing an
        // engineer notices.
        for t in &project.tags {
            if let Some(want) = &t.comment {
                let got = back.tags.iter().find(|x| x.name == t.name).unwrap();
                assert_eq!(
                    got.comment.as_ref(),
                    Some(want),
                    "{slug} lost the description on {}",
                    t.name
                );
            }
        }

        // Rungs, compared as the text they would be written as, which is the
        // form that actually lands in the file.
        for pou in &project.pous {
            let PouBody::Ladder { rungs } = &pou.body else { continue };
            let want: Vec<String> = rungs
                .iter()
                .map(|r| neutral_text::rung_to_text(r).unwrap())
                .collect();

            let got_pou = back
                .pous
                .iter()
                .find(|p| p.name == pou.name)
                .unwrap_or_else(|| panic!("{slug} lost POU {}", pou.name));
            let PouBody::Ladder { rungs: got_rungs } = &got_pou.body else {
                panic!("{slug}/{} came back as a different language", pou.name)
            };
            let got: Vec<String> = got_rungs
                .iter()
                .map(|r| neutral_text::rung_to_text(r).unwrap())
                .collect();

            assert_eq!(got, want, "{slug}/{} changed its rungs", pou.name);

            for (i, r) in rungs.iter().enumerate() {
                assert_eq!(
                    got_rungs[i].comment, r.comment,
                    "{slug}/{} rung {i} lost its comment",
                    pou.name
                );
            }
        }
    }
}

/// The PID fixture, end to end through a file.
#[test]
fn the_unmodelled_instruction_survives_a_file() {
    let (_, pid) = fixtures().into_iter().find(|(s, _)| s == "06-pid-loop").unwrap();
    let xml = l5x_write::write(&pid).unwrap().xml;

    assert!(xml.contains("PID("), "PID is missing from the exported file");

    let back = l5x_ir::parse_to_ir(xml.as_bytes()).unwrap().project;
    let kept = back.pous.iter().any(|p| {
        let PouBody::Ladder { rungs } = &p.body else { return false };
        rungs.iter().any(|r| {
            r.logic
                .instructions()
                .into_iter()
                .chain(r.outputs.iter())
                .any(|i| i.vendor.as_ref().is_some_and(|v| v.original_mnemonic == "PID"))
        })
    });
    assert!(kept, "PID did not survive the file");
}
