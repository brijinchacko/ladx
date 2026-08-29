//! The dependency graph, asked the questions the product is meant to answer.
//!
//! Run against the fixture projects rather than hand-built objects, because the
//! value of the graph is entirely in whether it gets real ladder right. A
//! fixture is a small machine somebody could actually build.

use ladx_ir::graph::{Access, ProjectGraph};
use ladx_ir::IrProject;
use std::path::PathBuf;

fn fixture(slug: &str) -> IrProject {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../..")
        .join("tests/fixtures/projects")
        .join(slug)
        .join("project.ir.json");
    let raw = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_str(&raw).expect("fixture should parse")
}

fn graph(slug: &str) -> ProjectGraph {
    ProjectGraph::build(&fixture(slug))
}

/// "Which blocks write this output?"
#[test]
fn it_knows_what_drives_a_motor() {
    let g = graph("01-motor-starter");

    let writers = g.writers_of("Motor");
    assert_eq!(writers.len(), 1, "one coil drives the motor");
    assert_eq!(writers[0].via, "Coil");
    assert_eq!(writers[0].pou, "Main");

    // And the seal-in contact is a read of the same tag, not a second write.
    // Getting this wrong would make every latched output look like it was
    // driven from two places.
    let readers = g.readers_of("Motor");
    assert_eq!(readers.len(), 1);
    assert_eq!(readers[0].via, "Contact");
}

/// "Where is EStop_OK used?"
#[test]
fn it_finds_every_place_an_interlock_is_examined() {
    let g = graph("03-conveyor");
    let uses = g.uses_of("EStop_OK");
    assert_eq!(uses.len(), 1);
    assert_eq!(uses[0].access, Access::Read);

    // Nothing drives it: it comes from the field.
    assert!(g.writers_of("EStop_OK").is_empty());
}

/// A timer is written by the timer instruction and read through its done bit.
///
/// The done bit is a member reference, `Jam_Timer.DN`, and resolving it back to
/// the timer is what makes "what drives this" answerable at all. Without it the
/// alarm rung looks unrelated to the timer that causes it.
#[test]
fn a_member_reference_belongs_to_its_tag() {
    let g = graph("03-conveyor");

    let writers = g.writers_of("Jam_Timer");
    assert_eq!(writers.len(), 1);
    assert_eq!(writers[0].via, "TimerOn");

    let readers = g.readers_of("Jam_Timer");
    assert_eq!(readers.len(), 1, "the done bit is a read of the timer");
}

/// A preset is a value the instruction reads, not something it drives.
#[test]
fn a_timer_preset_is_not_a_write() {
    let g = graph("03-conveyor");
    // 5000 is a literal, so it is not a tag use at all, and the only write is
    // the timer instance.
    assert_eq!(g.writers_of("Jam_Timer").len(), 1);
}

/// MOV(source, destination) writes only the destination.
#[test]
fn a_move_writes_its_destination_and_reads_its_source() {
    let g = graph("08-multi-step-sequence");

    let writers = g.writers_of("Step");
    assert!(writers.len() >= 4, "the sequence moves into Step several times");
    assert!(writers.iter().all(|w| w.via == "Move"));

    // And the comparisons that gate each step are reads of the same register.
    let readers = g.readers_of("Step");
    assert!(readers.len() >= 4, "each step is gated by comparing Step");
    assert!(readers.iter().all(|r| r.via == "Equal"));
}

/// "What calls this?"
#[test]
fn it_knows_which_pou_calls_which() {
    let g = graph("08-multi-step-sequence");

    let from_main = g.calls_from("Main");
    assert_eq!(from_main.len(), 1);
    assert_eq!(from_main[0].to, "Sequence");

    assert_eq!(g.callers_of("Sequence").len(), 1);
    assert!(g.callers_of("Main").is_empty(), "nothing calls the entry point");

    // A call is not a tag use. If it were, "Sequence" would show up as a tag
    // that nothing declares.
    assert!(g.uses_of("Sequence").is_empty());
}

/// Set and reset are both writes, and both need to be found.
#[test]
fn a_latch_and_its_reset_are_both_writes() {
    let g = graph("04-tank-filling");
    let writers = g.writers_of("Filling");
    assert_eq!(writers.len(), 2);
    let vias: Vec<&str> = writers.iter().map(|w| w.via.as_str()).collect();
    assert!(vias.contains(&"SetCoil"));
    assert!(vias.contains(&"ResetCoil"));
}

/// Everything the alarm fixture latches is driven from more than one rung,
/// which is normal and is why this is a query rather than a verdict.
#[test]
fn it_reports_tags_driven_from_several_places_without_calling_them_wrong() {
    let g = graph("07-alarm-handling");
    let several = g.written_from_several_places();

    // Each alarm is set on one rung and reset on another.
    for alarm in ["Alm_EStop", "Alm_Guard", "Alm_Motor"] {
        assert!(several.contains_key(alarm), "{alarm} is set and reset separately");
    }
}

/// A tag the logic uses that nothing declares.
#[test]
fn it_notices_a_reference_to_something_undeclared() {
    let mut p = fixture("01-motor-starter");
    p.tags.retain(|t| t.name != "Overload_OK");

    let g = ProjectGraph::build(&p);
    assert_eq!(g.undeclared(), vec!["Overload_OK"]);
}

#[test]
fn a_complete_project_has_nothing_undeclared() {
    for slug in ["01-motor-starter", "02-reversing-motor", "04-tank-filling"] {
        let g = graph(slug);
        assert!(g.undeclared().is_empty(), "{slug} refers to {:?}", g.undeclared());
    }
}

/// A declared tag nothing refers to.
#[test]
fn it_notices_a_tag_nobody_uses() {
    let mut p = fixture("01-motor-starter");
    p.tags.push(ladx_ir::Tag {
        name: "Spare_Input".into(),
        data_type: ladx_ir::DataType::Bool,
        address: Some("I0.7".into()),
        initial_value: None,
        comment: None,
        field: None,
    });

    let g = ProjectGraph::build(&p);
    assert_eq!(g.unused(), vec!["Spare_Input"]);
}

/// An instruction LADX does not model must not be guessed at.
///
/// PID drives its output in reality, but LADX has no way to know that, and a
/// graph that guessed would answer "what drives CV_Heater" with something it
/// invented. Recording every operand as a read is the honest answer: it is
/// mentioned there, and LADX does not know in which direction.
#[test]
fn an_unrecognised_instruction_is_recorded_but_not_guessed_at() {
    let g = graph("06-pid-loop");

    let uses = g.uses_of("CV_Heater");
    assert_eq!(uses.len(), 1, "the PID's mention of it is recorded");
    assert_eq!(uses[0].via, "PID", "under its own mnemonic");
    assert_eq!(
        uses[0].access,
        Access::Read,
        "not claimed as a write, because LADX cannot know that it is one"
    );
    assert!(g.writers_of("CV_Heater").is_empty());
}

/// Every fixture builds without panicking, which is the least the graph owes.
#[test]
fn every_fixture_builds() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../..")
        .join("tests/fixtures/projects");
    let mut n = 0;
    for entry in std::fs::read_dir(dir).unwrap().filter_map(|e| e.ok()) {
        if !entry.path().is_dir() {
            continue;
        }
        let slug = entry.file_name().to_string_lossy().into_owned();
        let g = graph(&slug);
        assert!(!g.uses.is_empty(), "{slug} produced no tag uses at all");
        n += 1;
    }
    assert_eq!(n, 8, "all eight fixtures");
}
