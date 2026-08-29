//! Golden tests over the synthetic fixture projects.
//!
//! These exist because of what is about to happen to this crate. `ladx-ir` has
//! no consumers today; the plan is to make it the single representation the
//! whole product is built on, which means moving the ladder editor, Convert and
//! the importers onto it. The failure mode of that work is not a crash. It is a
//! conversion that still runs, still produces plausible output, and quietly
//! produces *different* output than it did before.
//!
//! A unit test does not catch that, because a unit test asserts what its author
//! already thought of. A golden file catches it by asserting that nothing
//! changed at all, including the parts nobody thought to check.
//!
//! To accept a deliberate change:
//!
//! ```text
//! UPDATE_GOLDEN=1 cargo test -p ladx-ir --test golden
//! ```
//!
//! and read the diff before committing it. A golden diff in a commit that was
//! not meant to change output is the entire point of the file.

use ladx_ir::{IrProject, Logic, OpCode, Pou, PouBody, neutral_text, plcopen_graph, to_st};
use std::path::PathBuf;

fn repo_root() -> PathBuf {
    // crates/ladx-ir -> crates -> core -> packages -> repo root
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

    assert!(!found.is_empty(), "no fixture projects found in {}", dir.display());

    found
        .into_iter()
        .map(|d| {
            let slug = d.file_name().unwrap().to_string_lossy().into_owned();
            let file = d.join("project.ir.json");
            let raw = std::fs::read_to_string(&file)
                .unwrap_or_else(|e| panic!("{}: {e}", file.display()));
            let project: IrProject = serde_json::from_str(&raw)
                .unwrap_or_else(|e| panic!("{} is not a valid IR document: {e}", file.display()));
            (slug, project)
        })
        .collect()
}

/// Compare against the stored golden, or write it when asked.
fn check_golden(name: &str, actual: &str) {
    let path = repo_root().join("tests/golden").join(name);
    if std::env::var("UPDATE_GOLDEN").is_ok() {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, actual).unwrap();
        return;
    }
    let expected = std::fs::read_to_string(&path).unwrap_or_else(|_| {
        panic!(
            "no golden file at {}.\nRun: UPDATE_GOLDEN=1 cargo test -p ladx-ir --test golden",
            path.display()
        )
    });
    if expected != actual {
        // Printed rather than asserted with a message, so the difference is
        // readable instead of one enormous escaped line.
        eprintln!("--- expected ({}) ---\n{expected}", path.display());
        eprintln!("--- actual ---\n{actual}");
        panic!("golden mismatch for {name}");
    }
}

/// Every fixture, rendered to structured text.
#[test]
fn structured_text_output_is_unchanged() {
    for (slug, project) in fixtures() {
        let mut out = String::new();
        out.push_str(&format!("project: {}\n", project.name));
        out.push_str(&format!("entry_point: {:?}\n", project.entry_point));
        out.push_str(&format!("scan_ms: {:?}\n", project.scan_ms));
        out.push_str(&format!("source_vendor: {:?}\n\n", project.source_vendor));

        for pou in &project.pous {
            out.push_str(&format!("=== POU {} ({:?}) ===\n", pou.name, pou.kind));
            let c = to_st::pou_to_st(pou);
            out.push_str(&c.source);
            if !c.notes.is_empty() {
                out.push_str("\n--- notes ---\n");
                for n in &c.notes {
                    out.push_str(&format!("{n:?}\n"));
                }
            }
            out.push('\n');
        }
        check_golden(&format!("{slug}.st.txt"), &out);
    }
}

/// The document survives a trip through JSON unchanged.
///
/// The fixtures are the input to everything else, so a fixture that does not
/// round-trip would make every other golden meaningless.
#[test]
fn every_fixture_round_trips_through_json() {
    for (slug, project) in fixtures() {
        let json = serde_json::to_string(&project).unwrap();
        let back: IrProject = serde_json::from_str(&json)
            .unwrap_or_else(|e| panic!("{slug} failed to re-read: {e}"));
        assert_eq!(back, project, "{slug} changed on a JSON round trip");
    }
}

/// Ladder logic survives the tree/graph conversion PLCopen export needs.
#[test]
fn ladder_logic_survives_the_graph_round_trip() {
    for (slug, project) in fixtures() {
        for pou in &project.pous {
            let PouBody::Ladder { rungs } = &pou.body else {
                continue;
            };
            for rung in rungs {
                let normalised = plcopen_graph::normalise(rung.logic.clone());
                let graph = plcopen_graph::tree_to_graph(&normalised);
                let ends = plcopen_graph::ends_of(&graph);
                let back = plcopen_graph::graph_to_tree(&graph, &ends)
                    .unwrap_or_else(|e| panic!("{slug}/{}/{}: {e:?}", pou.name, rung.id));
                assert_eq!(
                    plcopen_graph::normalise(back),
                    normalised,
                    "{slug}/{}/{} changed shape through the graph",
                    pou.name,
                    rung.id
                );
            }
        }
    }
}

/// Fixture 06 exists to prove the IR does not throw away what it cannot model.
///
/// If this fails, an import is destroying tuning parameters out of a customer's
/// working loop, which is the single worst thing this software could do
/// quietly. Asserted by name rather than by walking every fixture, because the
/// point is this specific guarantee and it should fail with that sentence.
#[test]
fn an_unmodelled_instruction_keeps_everything_it_arrived_with() {
    let (_, pid) = fixtures()
        .into_iter()
        .find(|(s, _)| s == "06-pid-loop")
        .expect("the PID fixture must exist");

    let mut found = false;
    for pou in &pid.pous {
        let PouBody::Ladder { rungs } = &pou.body else { continue };
        for rung in rungs {
            for out in &rung.outputs {
                if out.op != OpCode::Unsupported {
                    continue;
                }
                found = true;
                let v = out.vendor.as_ref().expect("unsupported must carry its origin");
                assert_eq!(v.original_mnemonic, "PID");
                let keys: Vec<&str> = v.attributes.iter().map(|(k, _)| k.as_str()).collect();
                for want in ["Kp", "Ki", "Kd", "UpdateTime", "ControlMode"] {
                    assert!(keys.contains(&want), "PID lost its {want} parameter");
                }
            }
        }
    }
    assert!(found, "the PID fixture no longer contains an unsupported instruction");
}

/// A named entry point that does not exist would break every call graph built
/// on it later.
#[test]
fn the_entry_point_names_a_pou_that_exists() {
    for (slug, project) in fixtures() {
        let Some(entry) = &project.entry_point else { continue };
        assert!(
            project.pous.iter().any(|p: &Pou| &p.name == entry),
            "{slug} names entry point {entry:?}, which is not one of its POUs"
        );
    }
}

/// What a rung means, with the bookkeeping stripped off.
///
/// A round trip is not required to return byte-identical structs, and asserting
/// that it does tests the wrong thing. Instruction ids are synthetic and get
/// reassigned by whoever built the object last, and the reader records the
/// original mnemonic in `vendor` even for instructions it understands perfectly
/// well, which a hand-written fixture has no reason to carry.
///
/// What must survive is the meaning: the same instructions, with the same
/// operands, in the same series and parallel arrangement. That is what this
/// projects onto, so a failure here is a real change in the logic rather than a
/// change in how it was labelled.
fn meaning(logic: &Logic) -> String {
    match logic {
        Logic::Element { instruction } => instruction_meaning(instruction),
        Logic::Series { children } => {
            format!("series({})", children.iter().map(meaning).collect::<Vec<_>>().join(","))
        }
        Logic::Parallel { children } => {
            format!("parallel({})", children.iter().map(meaning).collect::<Vec<_>>().join(","))
        }
    }
}

fn instruction_meaning(i: &ladx_ir::Instruction) -> String {
    // For something LADX never understood, the original mnemonic *is* the
    // meaning, so it is part of the comparison rather than stripped with the
    // rest of the provenance.
    let op = if i.op == OpCode::Unsupported {
        i.vendor.as_ref().map(|v| v.original_mnemonic.clone()).unwrap_or_else(|| "?".into())
    } else {
        format!("{:?}", i.op)
    };
    let operands: Vec<String> = i
        .operands
        .iter()
        .map(|o| match o {
            ladx_ir::Operand::Tag { name } => name.clone(),
            ladx_ir::Operand::Text { value } => value.clone(),
            ladx_ir::Operand::Number { value } => format!("{value}"),
        })
        .collect();
    format!("{op}({})", operands.join(","))
}

/// The guarantee that matters for an export: the text is stable.
///
/// Written, read back, written again, and the two strings must match. This is
/// the property a customer's file depends on. If it holds, exporting a project
/// LADX imported returns the same rungs it was given, whether or not LADX
/// understood every instruction in them.
#[test]
fn writing_a_fixture_rung_is_stable() {
    for (slug, project) in fixtures() {
        for pou in &project.pous {
            let PouBody::Ladder { rungs } = &pou.body else { continue };
            for rung in rungs {
                let once = neutral_text::rung_to_text(rung)
                    .unwrap_or_else(|e| panic!("{slug}/{}/{} could not be written: {e}", pou.name, rung.id));
                let reread = neutral_text::parse_rung(&once, rung.id.clone())
                    .unwrap_or_else(|e| panic!("{slug}/{} wrote unreadable text {once:?}: {e}", rung.id));
                let twice = neutral_text::rung_to_text(&reread)
                    .unwrap_or_else(|e| panic!("{slug}/{} could not be rewritten: {e}", rung.id));

                assert_eq!(twice, once, "{slug}/{}/{} is not stable", pou.name, rung.id);
            }
        }
    }
}

/// And the structure survives, for every rung LADX fully understands.
///
/// The exception is deliberate and worth stating, because it is a real limit
/// rather than a gap in the test. Rockwell neutral text does not say whether an
/// instruction drives the rung or gates it; that is knowledge about the
/// instruction, and for one LADX has never heard of it has none. So a rung
/// holding an unknown mnemonic comes back with it on the condition side, even
/// if whoever built the IR knew it was an output.
///
/// The text is unchanged either way, which is why the stability test above
/// covers those rungs and this one does not. What LADX cannot currently do is
/// remember its own classification of an instruction it does not understand
/// across an export. Nothing is lost from the file; something is lost from the
/// model.
#[test]
fn structure_survives_for_rungs_ladx_fully_understands() {
    let mut checked = 0;
    for (slug, project) in fixtures() {
        for pou in &project.pous {
            let PouBody::Ladder { rungs } = &pou.body else { continue };
            for rung in rungs {
                let has_unknown = rung
                    .logic
                    .instructions()
                    .into_iter()
                    .chain(rung.outputs.iter())
                    .any(|i| i.op == OpCode::Unsupported);
                if has_unknown {
                    continue;
                }

                let text = neutral_text::rung_to_text(rung).unwrap();
                let back = neutral_text::parse_rung(&text, rung.id.clone()).unwrap();

                // Normalised first: a series wrapping a single element is the
                // same circuit as that element alone, and which one you get
                // depends on whether a human or the reader built the object.
                assert_eq!(
                    meaning(&plcopen_graph::normalise(back.logic.clone())),
                    meaning(&plcopen_graph::normalise(rung.logic.clone())),
                    "{slug}/{}/{} changed meaning: {text}",
                    pou.name,
                    rung.id
                );

                let before: Vec<String> = rung.outputs.iter().map(instruction_meaning).collect();
                let after: Vec<String> = back.outputs.iter().map(instruction_meaning).collect();
                assert_eq!(
                    after, before,
                    "{slug}/{}/{} lost or changed an output: {text}",
                    pou.name, rung.id
                );
                checked += 1;
            }
        }
    }
    assert!(checked > 20, "only {checked} rungs were checked; the fixtures should give more");
}
