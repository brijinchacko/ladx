//! Comparing two versions of a project, in engineering terms.

use ladx_ir::diff::{diff, Risk};
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

#[test]
fn an_unchanged_project_reports_nothing() {
    let p = fixture("03-conveyor");
    let d = diff(&p, &p);
    assert!(d.changes.is_empty(), "got {:?}", d.changes);
    assert_eq!(d.worst(), None);
}

/// The sentence the whole thing exists for.
///
/// Not "line 485 changed" but "that rung no longer checks the E-stop".
#[test]
fn a_removed_permissive_is_named_and_raised_as_safety() {
    let before = fixture("03-conveyor");
    let mut after = before.clone();

    // Take the E-stop out of the run rung.
    let ladx_ir::PouBody::Ladder { rungs } = &mut after.pous[0].body else { panic!() };
    let run = rungs.iter_mut().find(|r| r.id == "r7").unwrap();
    if let ladx_ir::Logic::Series { children } = &mut run.logic {
        children.retain(|c| match c {
            ladx_ir::Logic::Element { instruction } => !matches!(
                instruction.operands.first(),
                Some(ladx_ir::Operand::Tag { name }) if name == "EStop_OK"
            ),
            _ => true,
        });
    }

    let d = diff(&before, &after);
    let change = d
        .changes
        .iter()
        .find(|c| c.summary.contains("no longer checks EStop_OK"))
        .expect("the removed permissive has to be named");

    assert_eq!(change.risk, Risk::Safety);
    assert_eq!(d.worst(), Some(Risk::Safety));
    assert!(change.at[0].contains("r7"), "and it says where");
}

/// Nothing is ever called safe. LADX can see that a permissive went; it cannot
/// see whether that was the point of the change.
#[test]
fn no_change_is_ever_marked_safe() {
    let before = fixture("01-motor-starter");
    let mut after = before.clone();
    after.tags.push(ladx_ir::Tag {
        name: "Spare".into(),
        data_type: ladx_ir::DataType::Bool,
        address: None,
        initial_value: None,
        comment: None,
        field: None,
    });

    let d = diff(&before, &after);
    // Adding an unused tag is the most harmless change there is, and it is
    // still Low rather than safe: there is no such verdict.
    assert_eq!(d.changes[0].risk, Risk::Low);
    assert!(d.changes.iter().all(|c| c.risk >= Risk::Low));
}

/// Moving a safety input to a different terminal is not a small change.
#[test]
fn moving_a_protective_input_is_safety_rather_than_a_note() {
    let before = fixture("03-conveyor");
    let mut after = before.clone();
    for t in &mut after.tags {
        if t.name == "EStop_OK" {
            t.address = Some("I1.7".into());
        }
    }

    let d = diff(&before, &after);
    let change = d.changes.iter().find(|c| c.summary.contains("moved from")).unwrap();
    assert_eq!(change.risk, Risk::Safety);
    assert!(change.summary.contains("I0.2"));
    assert!(change.summary.contains("I1.7"));
}

/// An ordinary tag moving is still worth stopping for, just not safety.
#[test]
fn moving_an_ordinary_input_is_high_rather_than_safety() {
    let before = fixture("03-conveyor");
    let mut after = before.clone();
    for t in &mut after.tags {
        if t.name == "PE_Discharge" {
            t.address = Some("I1.3".into());
        }
    }
    let change = diff(&before, &after)
        .changes
        .into_iter()
        .find(|c| c.summary.contains("moved from"))
        .unwrap();
    assert_eq!(change.risk, Risk::High);
}

#[test]
fn a_removed_routine_says_what_it_means() {
    let before = fixture("08-multi-step-sequence");
    let mut after = before.clone();
    after.pous.retain(|p| p.name != "Sequence");

    let d = diff(&before, &after);
    let change = d.changes.iter().find(|c| c.summary.contains("Sequence was removed")).unwrap();
    assert_eq!(change.risk, Risk::High);
    assert!(change.summary.contains("not happening any more"));
}

#[test]
fn a_new_tag_carries_its_description() {
    let before = fixture("01-motor-starter");
    let mut after = before.clone();
    after.tags.push(ladx_ir::Tag {
        name: "Run_Hours".into(),
        data_type: ladx_ir::DataType::Dint,
        address: None,
        initial_value: None,
        comment: Some("Motor run time".into()),
        field: None,
    });
    let d = diff(&before, &after);
    assert!(d.changes.iter().any(|c| c.summary.contains("Run_Hours is new, \"Motor run time\"")));
}

/// Worst first, so somebody reading three lines reads the three that matter.
#[test]
fn changes_are_ordered_by_risk() {
    let before = fixture("03-conveyor");
    let mut after = before.clone();
    after.tags.retain(|t| t.name != "EStop_OK");
    after.tags.push(ladx_ir::Tag {
        name: "Spare".into(),
        data_type: ladx_ir::DataType::Bool,
        address: None,
        initial_value: None,
        comment: None,
        field: None,
    });

    let d = diff(&before, &after);
    let risks: Vec<Risk> = d.changes.iter().map(|c| c.risk).collect();
    let mut sorted = risks.clone();
    sorted.sort_by(|a, b| b.cmp(a));
    assert_eq!(risks, sorted);
    assert_eq!(d.worst(), Some(Risk::Safety));
}

/// A diff that examined less than the whole project must not read as one that
/// found nothing elsewhere.
#[test]
fn it_says_what_it_did_not_compare() {
    let before = fixture("01-motor-starter");
    let mut after = before.clone();
    after.pous.push(ladx_ir::Pou {
        name: "Calc".into(),
        kind: ladx_ir::PouKind::Program,
        body: ladx_ir::PouBody::StructuredText { source: "x := 1;".into() },
        local_tags: vec![],
        comment: None,
        container: None,
    });

    let d = diff(&before, &after);
    assert!(d.not_compared.iter().any(|n| n.contains("Calc") && n.contains("did not compare")));
}

/// The comparison people actually want is this program against the one running
/// on the machine, and an export pulled off a controller numbers its rungs from
/// zero. Matching on the number alone reported an identical program as three
/// removals and three additions.
#[test]
fn a_renumbered_program_is_the_same_program() {
    let before = fixture("03-conveyor");

    // The same logic, with every rung under a different number, which is what
    // comes back from the controller.
    let mut after = before.clone();
    for pou in &mut after.pous {
        if let ladx_ir::PouBody::Ladder { rungs } = &mut pou.body {
            for (n, rung) in rungs.iter_mut().enumerate() {
                rung.id = format!("r{n}");
            }
        }
    }

    let d = diff(&before, &after);
    assert!(d.changes.is_empty(), "got {:?}", d.changes);
    assert!(
        d.not_compared.iter().any(|n| n.contains("rather than their numbers")),
        "and it has to say why the rung references will not line up"
    );
}

/// Matching by content must not hide a real change. A rung that was genuinely
/// removed has no counterpart to pair with.
#[test]
fn content_matching_does_not_hide_a_removed_rung() {
    let before = fixture("03-conveyor");
    let mut after = before.clone();
    if let ladx_ir::PouBody::Ladder { rungs } = &mut after.pous[0].body {
        rungs.remove(0);
        // and renumber, so it cannot pass by luck of the ids lining up
        for (n, rung) in rungs.iter_mut().enumerate() {
            rung.id = format!("r{n}");
        }
    }
    let d = diff(&before, &after);
    assert!(
        d.changes.iter().any(|c| c.summary.contains("removed")),
        "a removed rung must still be reported, got {:?}",
        d.changes
    );
}

/// Two rungs are only the same rung if they are in the same routine. Identical
/// logic in a different POU is a different rung.
#[test]
fn content_matching_does_not_cross_routines() {
    let before = fixture("08-multi-step-sequence");
    let mut after = before.clone();
    // Move every rung out of the second POU into the first, renumbering.
    let moved: Vec<_> = match &after.pous[1].body {
        ladx_ir::PouBody::Ladder { rungs } => rungs.clone(),
        _ => vec![],
    };
    if let ladx_ir::PouBody::Ladder { rungs } = &mut after.pous[1].body {
        rungs.clear();
    }
    if let ladx_ir::PouBody::Ladder { rungs } = &mut after.pous[0].body {
        rungs.extend(moved);
    }
    let d = diff(&before, &after);
    assert!(
        !d.changes.is_empty(),
        "rungs that changed routine are a change, not a renumbering"
    );
}
