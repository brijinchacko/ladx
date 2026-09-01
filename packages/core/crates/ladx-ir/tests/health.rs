//! The health report, and mostly the things it must NOT say.
//!
//! A checker is judged on its false positives. Anything that reports forty
//! items on a working machine gets switched off after the second project, and
//! the forty-first item, the one that mattered, goes with it. So most of what
//! follows is the fixtures, which are all correct programs, being checked and
//! coming back quiet.

use ladx_ir::health::{Severity, analyse};
use ladx_ir::{IrProject, OpCode};
use std::path::PathBuf;

fn fixture(slug: &str) -> IrProject {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../..")
        .join("tests/fixtures/projects")
        .join(slug)
        .join("project.ir.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

/// The most important test here.
///
/// These are working machines. A seal-in, a mutual interlock, a set/reset pair,
/// a step sequence and a duty/standby alternation are all normal, correct
/// ladder, and none of them may produce a Critical or a Warning. If this starts
/// failing, the checker has become the kind nobody keeps switched on.
#[test]
fn correct_programs_produce_nothing_alarming() {
    for slug in [
        "01-motor-starter",
        "02-reversing-motor",
        "04-tank-filling",
        "05-duty-standby-pumps",
        "08-multi-step-sequence",
    ] {
        let r = analyse(&fixture(slug));
        let loud: Vec<&str> = r
            .findings
            .iter()
            .filter(|f| f.severity >= Severity::Warning)
            .map(|f| f.title.as_str())
            .collect();
        assert!(loud.is_empty(), "{slug} should be quiet, got: {loud:?}");
    }
}

/// A latch and its reset is a latch, not a duplicate coil.
#[test]
fn a_set_and_reset_pair_is_not_reported() {
    let r = analyse(&fixture("04-tank-filling"));
    assert!(
        !r.findings.iter().any(|f| f.check == "duplicate-coil"),
        "set and reset on one bit is how a latch is written"
    );
    assert!(
        !r.findings.iter().any(|f| f.check == "latch-without-reset"),
        "this one has its reset"
    );
}

/// A step register moved into from six rungs is a sequence, not a fault.
#[test]
fn a_step_sequence_is_not_reported() {
    let r = analyse(&fixture("08-multi-step-sequence"));
    assert!(!r.findings.iter().any(|f| f.check == "duplicate-coil"));
    assert!(
        !r.findings.iter().any(|f| f.check == "uncalled-routine"),
        "Sequence is called from Main"
    );
}

/// The alarm fixture latches three alarms and resets all three on one rung.
#[test]
fn alarms_with_a_common_reset_are_not_reported() {
    let r = analyse(&fixture("07-alarm-handling"));
    assert!(!r.findings.iter().any(|f| f.check == "latch-without-reset"));
}

/// And the conveyor deliberately latches its jam alarm with no reset, which is
/// the thing worth telling somebody about.
#[test]
fn a_latch_with_no_way_to_clear_it_is_reported() {
    let r = analyse(&fixture("03-conveyor"));
    let f = r
        .findings
        .iter()
        .find(|f| f.check == "latch-without-reset")
        .expect("the jam alarm latches and nothing clears it");

    assert_eq!(f.severity, Severity::Warning);
    assert!(f.title.contains("Jam_Alarm"));
    assert_eq!(f.locations[0].pou.as_deref(), Some("Main"));
    assert!(f.locations[0].rung.is_some(), "a finding has to be navigable");
    // Says the case where it is fine, rather than only the case where it is not.
    assert!(f.detail.contains("outside this program"));
}

/// Two plain coils on one bit: the real fault this check exists for.
#[test]
fn two_coils_on_one_bit_is_reported() {
    let mut p = fixture("01-motor-starter");
    let ladx_ir::PouBody::Ladder { rungs } = &mut p.pous[0].body else { panic!() };
    let mut extra = rungs[0].clone();
    extra.id = "r99".into();
    rungs.push(extra);

    let r = analyse(&p);
    let f = r
        .findings
        .iter()
        .find(|f| f.check == "duplicate-coil")
        .expect("two coils on Motor should be reported");

    assert_eq!(f.severity, Severity::Warning);
    assert!(f.title.contains("Motor"));
    assert_eq!(f.locations.len(), 2, "both rungs, so either can be opened");
    assert!(f.detail.contains("set and reset"), "says what it is not");
}

#[test]
fn a_reference_to_something_undeclared_is_critical() {
    let mut p = fixture("01-motor-starter");
    p.tags.retain(|t| t.name != "Stop_PB");

    let r = analyse(&p);
    let f = r.findings.iter().find(|f| f.check == "undeclared-tag").expect("should be found");
    assert_eq!(f.severity, Severity::Critical);
    assert_eq!(r.worst(), Some(Severity::Critical));
    assert!(f.title.contains("Stop_PB"));
}

#[test]
fn a_routine_nothing_calls_is_reported() {
    let mut p = fixture("08-multi-step-sequence");
    // Remove the call, leaving the routine stranded.
    let ladx_ir::PouBody::Ladder { rungs } = &mut p.pous[0].body else { panic!() };
    rungs.retain(|r| {
        !r.outputs.iter().any(|o| o.op == OpCode::Call)
    });

    let r = analyse(&p);
    let f = r.findings.iter().find(|f| f.check == "uncalled-routine").expect("should be found");
    assert!(f.title.contains("Sequence"));
    assert_eq!(f.severity, Severity::Warning);
}

/// An unused spare is worth mentioning and is not a problem.
#[test]
fn an_unused_tag_is_only_a_suggestion() {
    let mut p = fixture("01-motor-starter");
    p.tags.push(ladx_ir::Tag {
        name: "Spare".into(),
        data_type: ladx_ir::DataType::Bool,
        address: Some("I0.7".into()),
        initial_value: None,
        comment: None,
        field: None,
    });

    let r = analyse(&p);
    let f = r.findings.iter().find(|f| f.check == "unused-tag").expect("should be found");
    assert_eq!(f.severity, Severity::Suggestion);
    assert!(f.detail.contains("normal for a spare"));
}

/// Silence about a check nobody ran reads as a pass, so it is said out loud.
#[test]
fn it_says_which_routines_it_did_not_examine() {
    let mut p = fixture("01-motor-starter");
    p.pous.push(ladx_ir::Pou {
        name: "Calc".into(),
        kind: ladx_ir::PouKind::Program,
        body: ladx_ir::PouBody::StructuredText { source: "X := 1;".into() },
        local_tags: vec![],
        comment: None,
        container: None,
    });

    let r = analyse(&p);
    assert!(
        r.not_checked.iter().any(|n| n.contains("Calc")),
        "an unexamined routine must be declared, got {:?}",
        r.not_checked
    );
}

/// Worst first, so somebody reading three lines reads the three that matter.
#[test]
fn findings_are_ordered_worst_first() {
    let mut p = fixture("01-motor-starter");
    p.tags.retain(|t| t.name != "Stop_PB");
    p.tags.push(ladx_ir::Tag {
        name: "Spare".into(),
        data_type: ladx_ir::DataType::Bool,
        address: None,
        initial_value: None,
        comment: None,
        field: None,
    });

    let r = analyse(&p);
    let severities: Vec<Severity> = r.findings.iter().map(|f| f.severity).collect();
    let mut sorted = severities.clone();
    sorted.sort_by(|a, b| b.cmp(a));
    assert_eq!(severities, sorted);
}

/// Every fixture analyses without panicking, and every finding is navigable.
#[test]
fn every_finding_names_something() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../..")
        .join("tests/fixtures/projects");
    for entry in std::fs::read_dir(dir).unwrap().filter_map(|e| e.ok()) {
        if !entry.path().is_dir() {
            continue;
        }
        let slug = entry.file_name().to_string_lossy().into_owned();
        for f in analyse(&fixture(&slug)).findings {
            assert!(!f.locations.is_empty(), "{slug}: {} names nowhere", f.title);
            assert!(!f.check.is_empty());
            assert!(!f.detail.is_empty(), "{slug}: {} explains nothing", f.title);
        }
    }
}
