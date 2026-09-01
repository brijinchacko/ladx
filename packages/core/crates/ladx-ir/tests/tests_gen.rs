//! Acceptance tests written from the logic.

use ladx_ir::tests_gen::{test_plan, Kind};
use ladx_ir::IrProject;
use std::path::PathBuf;

fn fixture(slug: &str) -> IrProject {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../..")
        .join("tests/fixtures/projects")
        .join(slug)
        .join("project.ir.json");
    serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap()
}

/// Every condition gets a negative step. This is the half a person writing a
/// FAT by hand leaves out, and the half that finds a permissive wired to the
/// wrong terminal.
#[test]
fn every_condition_gets_a_test_that_proves_it_actually_blocks() {
    let plan = test_plan(&fixture("03-conveyor"));
    let g = plan.groups.iter().find(|g| g.subject.contains("Conveyor")).unwrap();

    let positives = g.steps.iter().filter(|s| s.kind == Kind::Positive).count();
    let negatives = g.steps.iter().filter(|s| s.kind != Kind::Positive).count();
    assert_eq!(positives, 1, "one way to start it");
    assert!(negatives >= 3, "one per permissive, got {negatives}");
}

/// A safety condition is marked, so it cannot be skipped as routine.
#[test]
fn safety_conditions_are_marked_as_safety() {
    let plan = test_plan(&fixture("03-conveyor"));
    // The positive step mentions the E-stop too, as one of the things set up
    // to start the motor. The one that matters is the step that removes it.
    let estop = plan
        .groups
        .iter()
        .flat_map(|g| &g.steps)
        .find(|s| s.kind == Kind::Safety)
        .expect("a safety step");
    assert!(estop.action.contains("EStop_OK off"), "got: {}", estop.action);
    assert!(plan.safety_steps() > 0);
    assert!(plan.to_markdown("t").contains("**SAFETY**"));
}

/// A seal-in is not a requirement. Telling somebody to set a running motor's
/// own output on before starting it is a step they cannot carry out.
#[test]
fn alternatives_are_offered_as_alternatives_not_requirements() {
    let plan = test_plan(&fixture("03-conveyor"));
    let start = plan
        .groups
        .iter()
        .find(|g| g.subject.contains("Conveyor"))
        .unwrap()
        .steps
        .iter()
        .find(|s| s.kind == Kind::Positive)
        .unwrap();
    assert!(start.action.contains("any of"), "got: {}", start.action);
    // And no negative step tries to disprove one branch of an OR.
    let sealin = plan.groups[0].steps.iter().any(|s| {
        s.kind != Kind::Positive && s.action.contains("Start_PB off")
    });
    assert!(!sealin, "removing one of two alternatives does not stop the output");
}

/// A comparison has to reach the sheet as a number. "Step satisfied" is not
/// something a person standing at a machine can do.
#[test]
fn a_comparison_becomes_a_value_a_person_can_set() {
    let plan = test_plan(&fixture("08-multi-step-sequence"));
    let clamp = plan.groups.iter().find(|g| g.subject.contains("Clamp")).unwrap();
    let pos = clamp.steps.iter().find(|s| s.kind == Kind::Positive).unwrap();
    assert!(pos.action.contains("Step at 10"), "got: {}", pos.action);
    assert!(!pos.action.contains("satisfied"));

    let neg = clamp.steps.iter().find(|s| s.kind == Kind::Negative).unwrap();
    assert!(neg.action.contains("anything other than 10"), "got: {}", neg.action);
}

/// Each step names the rung it came from, so a failed test leads somewhere.
#[test]
fn every_step_points_back_at_the_rung_it_came_from() {
    let plan = test_plan(&fixture("03-conveyor"));
    for step in plan.groups.iter().flat_map(|g| &g.steps) {
        assert!(step.from.contains('/'), "{:?}", step.from);
    }
}

/// The plan must not read as though LADX carried the tests out.
#[test]
fn the_plan_says_it_has_not_been_carried_out() {
    let plan = test_plan(&fixture("03-conveyor"));
    assert!(plan.not_covered.iter().any(|n| n.contains("nothing here has been carried out")));
    assert!(plan.not_covered.iter().any(|n| n.contains("Timing")));
    assert!(plan.to_markdown("t").contains("nothing here has been carried out"));
}
