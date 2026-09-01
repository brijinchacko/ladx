//! "Why won't it start", asked of the fixtures.

use ladx_ir::trace::{Sense, why};
use ladx_ir::IrProject;
use std::path::PathBuf;

fn fixture(slug: &str) -> IrProject {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../..")
        .join("tests/fixtures/projects")
        .join(slug)
        .join("project.ir.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

#[test]
fn it_finds_the_rung_that_drives_the_output() {
    let t = why(&fixture("01-motor-starter"), "Motor");
    let first = &t.steps[0];
    assert_eq!(first.tag, "Motor");
    assert_eq!(first.via, "Coil");
    assert_eq!(first.depth, 0);
    assert!(first.comment.as_deref().unwrap_or("").contains("seal-in"));
}

/// A start button in parallel with a seal-in contact is not a requirement.
///
/// Presenting both as things that must be true is how a trace tells somebody a
/// running motor cannot start, which is worse than saying nothing.
#[test]
fn an_alternative_is_not_reported_as_a_requirement() {
    let t = why(&fixture("01-motor-starter"), "Motor");
    let conds = &t.steps[0].conditions;

    let start = conds.iter().find(|c| c.tag == "Start_PB").unwrap();
    assert!(start.one_of_several, "the start button is one way in, not the only way");

    let stop = conds.iter().find(|c| c.tag == "Stop_PB").unwrap();
    assert!(!stop.one_of_several, "the stop circuit is a requirement");

    let checks: Vec<&str> = t.things_to_check().iter().map(|c| c.tag.as_str()).collect();
    assert!(!checks.contains(&"Start_PB"));
    assert!(checks.contains(&"Stop_PB"));
}

/// A motor holding itself in is a cycle, and following it must terminate.
#[test]
fn a_seal_in_does_not_loop_forever() {
    let t = why(&fixture("01-motor-starter"), "Motor");
    let repeats: Vec<_> = t.steps.iter().filter(|s| s.already_seen).collect();
    assert_eq!(repeats.len(), 1, "the motor's own contact, recorded once");
    assert_eq!(repeats[0].tag, "Motor");
    assert!(t.steps.len() < 10, "and the trace stays small");
}

#[test]
fn a_normally_closed_contact_reads_as_must_be_off() {
    let t = why(&fixture("03-conveyor"), "Conveyor");
    let jam = t.steps[0].conditions.iter().find(|c| c.tag == "Jam_Alarm").unwrap();
    assert_eq!(jam.sense, Sense::MustBeOff);
}

/// It follows a condition back to what drives it.
#[test]
fn it_follows_the_trail_backwards() {
    let t = why(&fixture("03-conveyor"), "Conveyor");
    let tags: Vec<&str> = t.steps.iter().map(|s| s.tag.as_str()).collect();
    assert!(tags.contains(&"Jam_Alarm"), "the alarm that drops it");
    assert!(tags.contains(&"Jam_Timer"), "and the timer that sets the alarm");
}

/// The trap this function exists to avoid.
///
/// The conveyor needs Jam_Alarm OFF. The conditions that SET the jam alarm
/// therefore need to be false: the photocell must be clear, not blocked. A flat
/// list built by walking the whole trace and keeping each condition's own sense
/// would say "check PE_Discharge is on", which is the opposite of the truth and
/// would send somebody to the wrong end of the machine.
#[test]
fn the_flat_list_does_not_invert_anything() {
    let t = why(&fixture("03-conveyor"), "Conveyor");
    let checks: Vec<&str> = t.things_to_check().iter().map(|c| c.tag.as_str()).collect();

    assert_eq!(checks, vec!["Stop_PB", "EStop_OK", "Jam_Alarm"]);

    // Everything behind a negated condition stays out of it.
    assert!(!checks.contains(&"PE_Discharge"), "would be stated backwards");
    assert!(!checks.contains(&"Jam_Timer"), "would be stated backwards");

    // But it is still in the trace, with its structure.
    assert!(t.steps.iter().any(|s| s.tag == "Jam_Timer"));
}

#[test]
fn an_input_is_named_as_coming_from_outside() {
    let t = why(&fixture("01-motor-starter"), "Start_PB");
    assert!(t.steps.is_empty());
    assert!(t.note.as_deref().unwrap_or("").contains("input"));
}

#[test]
fn a_tag_that_is_not_there_says_so_rather_than_nothing() {
    let t = why(&fixture("01-motor-starter"), "Conveyor_17");
    assert!(t.steps.is_empty());
    assert!(t.note.as_deref().unwrap_or("").contains("spelling"));
}

/// A mutual interlock: each direction is blocked by the other.
#[test]
fn it_explains_an_interlock() {
    let t = why(&fixture("02-reversing-motor"), "Fwd");
    let conds = &t.steps[0].conditions;
    let rev = conds.iter().find(|c| c.tag == "Rev").unwrap();
    assert_eq!(rev.sense, Sense::MustBeOff, "reverse must not be running");
    assert!(rev.driven_in_program, "and the trail can continue into it");
}

/// Every fixture answers about its own outputs without panicking or running
/// away, which is what the depth limit is for.
#[test]
fn every_output_can_be_asked_about() {
    for slug in [
        "01-motor-starter",
        "02-reversing-motor",
        "03-conveyor",
        "04-tank-filling",
        "05-duty-standby-pumps",
        "07-alarm-handling",
        "08-multi-step-sequence",
    ] {
        let p = fixture(slug);
        for tag in p.tags.iter().filter(|t| {
            t.field.as_ref().map(|f| f.direction == ladx_ir::IoDirection::Output).unwrap_or(false)
        }) {
            let t = why(&p, &tag.name);
            assert!(t.steps.len() < 40, "{slug}/{} produced {} steps", tag.name, t.steps.len());
            for s in &t.steps {
                assert!(s.depth <= 5, "{slug}: depth limit not respected");
            }
        }
    }
}
