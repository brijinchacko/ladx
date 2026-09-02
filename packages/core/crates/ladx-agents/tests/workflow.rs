//! Several specialists on one job, with the checks as the gates.

use ladx_agents::workflow::*;
use ladx_ir::IrProject;
use std::cell::RefCell;
use std::path::PathBuf;

fn fixture(slug: &str) -> IrProject {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../..")
        .join("tests/fixtures/projects")
        .join(slug)
        .join("project.ir.json");
    serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap()
}

fn hardware(slots: &[(u32, &str)]) -> ladx_ir::hardware::Hardware {
    ladx_ir::hardware::Hardware {
        modules: slots
            .iter()
            .map(|(slot, catalog)| ladx_ir::hardware::Module {
                name: format!("M{slot}"),
                kind: ladx_ir::hardware::kind_for(catalog),
                points: ladx_ir::hardware::points_for(catalog),
                catalog: Some((*catalog).into()),
                slot: Some(*slot),
                parent: None,
                revision: None,
                inhibited: false,
            })
            .collect(),
        notes: vec![],
    }
}

/// A model that records what it was asked, so a test can prove a step never
/// ran rather than merely that the run ended.
fn recorder<'a>(log: &'a RefCell<Vec<Role>>) -> impl Fn(Role, &str) -> Result<String, String> + 'a {
    move |role, _| {
        log.borrow_mut().push(role);
        Ok(format!("{role:?} answered"))
    }
}

#[test]
fn a_workflow_runs_its_steps_in_order() {
    let p = fixture("03-conveyor");
    let log = RefCell::new(Vec::new());
    let ask = recorder(&log);
    let ctx = Context { project: &p, hardware: None, tag_lists: &[], ask: &ask, answers: &[], model_answers: &[], wait_for_model: false };
    let r = run(&assess_program(), "what is this", &ctx);
    assert!(r.finished, "{}", r.to_text());
    assert_eq!(*log.borrow(), vec![Role::Surveyor, Role::Documenter]);
}

/// The point of the whole design: a check stops the run, and the steps after
/// it do not happen. A workflow that carried on and attached a note would be
/// handing a known fault to a reviewer to spot by eye.
#[test]
fn a_failing_gate_stops_the_run_and_nothing_after_it_happens() {
    let mut p = fixture("03-conveyor");
    // An address in a slot with no card in it.
    p.tags.push(ladx_ir::Tag {
        name: "Ghost".into(),
        data_type: ladx_ir::DataType::Bool,
        address: Some("Local:9:I.Data.0".into()),
        initial_value: None,
        comment: None,
        field: None,
    });
    let hw = hardware(&[(1, "1756-IB16")]);
    let log = RefCell::new(Vec::new());
    let ask = recorder(&log);
    let ctx = Context {
        project: &p,
        hardware: Some(&hw),
        tag_lists: &[],
        ask: &ask,
        answers: &[],
        model_answers: &[],
        wait_for_model: false,
    };

    let r = run(&prepare_handover(), "ship it", &ctx);
    assert!(!r.finished);
    let blocker = r.blocker().expect("the hardware check");
    assert_eq!(blocker.id, "hardware");
    assert!(blocker.findings.iter().any(|f| f.contains("slot 9")));

    // The narrative step is after it and must not have run.
    assert!(log.borrow().is_empty(), "the model was asked after a gate failed");
    assert_eq!(
        r.steps.iter().find(|s| s.id == "narrative").unwrap().outcome,
        Outcome::NotReached
    );
}

/// A check with nothing to compare against cannot fail, and a step that cannot
/// fail must never report Passed: read back later, that green line would say
/// the lists agreed.
#[test]
fn a_check_with_nothing_to_do_does_not_report_passed() {
    let p = fixture("03-conveyor");
    let log = RefCell::new(Vec::new());
    let ask = recorder(&log);
    let ctx = Context { project: &p, hardware: None, tag_lists: &[], ask: &ask, answers: &[], model_answers: &[], wait_for_model: false };
    let r = run(&prepare_handover(), "ship it", &ctx);

    for id in ["tag-lists", "hardware"] {
        let s = r.steps.iter().find(|s| s.id == id).unwrap();
        assert_eq!(s.outcome, Outcome::Noted, "{id} claimed to have checked something");
        assert!(!s.findings.is_empty(), "{id} says nothing about why");
    }
}

/// A person is a person. No model step may stand in for one.
#[test]
fn a_step_that_needs_a_person_waits_for_a_person() {
    let p = fixture("03-conveyor");
    let log = RefCell::new(Vec::new());
    let ask = recorder(&log);
    let ctx = Context { project: &p, hardware: None, tag_lists: &[], ask: &ask, answers: &[], model_answers: &[], wait_for_model: false };

    let r = run(&modify_program(), "add a jam alarm", &ctx);
    assert!(!r.finished);
    let w = r.waiting_on().expect("the confirmation");
    assert_eq!(w.id, "confirm-plan");
    assert!(w.input.contains("safe to change"));
    // Nothing was written.
    assert!(!log.borrow().contains(&Role::Author));
}

#[test]
fn once_the_person_has_answered_the_run_goes_on() {
    let p = fixture("01-motor-starter");
    let log = RefCell::new(Vec::new());
    let ask = recorder(&log);
    let answers = vec![("confirm-plan".to_string(), "Yes, the cell is locked off.".to_string())];
    let ctx = Context {
        project: &p,
        hardware: None,
        tag_lists: &[],
        ask: &ask,
        answers: &answers,
        model_answers: &[],
        wait_for_model: false,
    };
    let r = run(&modify_program(), "add an overload", &ctx);
    assert!(r.finished, "{}", r.to_text());
    assert!(log.borrow().contains(&Role::Author));
    assert!(log.borrow().contains(&Role::Reviewer));
}

/// A model that cannot be reached stops the run. Carrying on would produce a
/// record showing steps that never happened.
#[test]
fn a_model_that_cannot_be_reached_stops_the_run() {
    let p = fixture("03-conveyor");
    let ask = |_: Role, _: &str| -> Result<String, String> { Err("no model available".into()) };
    let ctx = Context { project: &p, hardware: None, tag_lists: &[], ask: &ask, answers: &[], model_answers: &[], wait_for_model: false };
    let r = run(&assess_program(), "what is this", &ctx);
    assert!(!r.finished);
    assert!(r.stopped_because.as_ref().unwrap().contains("no model available"));
    assert_eq!(
        r.steps.iter().find(|s| s.id == "report").unwrap().outcome,
        Outcome::NotReached
    );
}

/// Departing from a house standard is a question for a person, not a fault,
/// and must not stop anybody working.
#[test]
fn a_house_standard_deviation_notes_but_does_not_block() {
    let p = fixture("01-motor-starter");
    let log = RefCell::new(Vec::new());
    let ask = recorder(&log);
    let answers = vec![("confirm-plan".to_string(), "yes".to_string())];
    let ctx = Context {
        project: &p,
        hardware: None,
        tag_lists: &[],
        ask: &ask,
        answers: &answers,
        model_answers: &[],
        wait_for_model: false,
    };
    let r = run(&modify_program(), "x", &ctx);
    let lib = r.steps.iter().find(|s| s.id == "library").unwrap();
    assert_eq!(lib.outcome, Outcome::Noted);
    assert!(!lib.findings.is_empty());
    assert!(r.finished, "a house standard must not stop the job");
}

/// Nothing a workflow does can earn a level above IEC, and a run that ended by
/// claiming one would be the exact failure this product exists to avoid.
#[test]
fn no_run_can_claim_more_than_ladx_may_award() {
    let p = fixture("03-conveyor");
    let ask = |role: Role, _: &str| Ok(format!("{role:?}"));
    let ctx = Context { project: &p, hardware: None, tag_lists: &[], ask: &ask, answers: &[], model_answers: &[], wait_for_model: false };
    let r = run(&prepare_handover(), "ship it", &ctx);
    let level = r.steps.iter().find(|s| s.id == "level").unwrap();
    assert!(level.findings[0].contains("IEC"));
    assert!(!level.findings[0].to_lowercase().contains("production ready"));
    assert!(ladx_ir::validation::Level::Iec.is_self_awardable());
    assert!(!ladx_ir::validation::Level::Iec.is_production_ready());
}

/// The run is the record. Every step appears, in order, including the ones
/// that did not happen.
#[test]
fn every_step_appears_in_the_record_including_the_ones_that_did_not_run() {
    let p = fixture("03-conveyor");
    let ask = |_: Role, _: &str| -> Result<String, String> { Err("down".into()) };
    let ctx = Context { project: &p, hardware: None, tag_lists: &[], ask: &ask, answers: &[], model_answers: &[], wait_for_model: false };
    let wf = assess_program();
    let r = run(&wf, "x", &ctx);
    assert_eq!(r.steps.len(), wf.steps.len());
    for (a, b) in wf.steps.iter().zip(&r.steps) {
        assert_eq!(a.id, b.id, "the record must be in the order it ran");
    }
    assert!(r.to_text().contains("Stopped:"));
}

/// Every shipped workflow has to describe itself, and every step has to say
/// what it is for.
#[test]
fn every_shipped_workflow_explains_itself() {
    for w in workflows() {
        assert!(!w.about.is_empty(), "{}", w.name);
        assert!(!w.steps.is_empty(), "{}", w.name);
        for s in &w.steps {
            assert!(!s.about.is_empty(), "{}/{}", w.name, s.id);
        }
        // A workflow with no check step is a chain of guesses.
        assert!(
            w.steps.iter().any(|s| matches!(s.kind, StepKind::Check { .. })),
            "{} has no gate",
            w.name
        );
    }
    assert!(workflow("modify-program").is_some());
    assert!(workflow("no-such-thing").is_none());
}
