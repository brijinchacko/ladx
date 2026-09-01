//! The machine's sequence, read out of the step register.

use ladx_ir::sequence::sequences;
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
fn it_reads_the_steps_and_the_order_they_run_in() {
    let s = sequences(&fixture("08-multi-step-sequence"));
    assert_eq!(s.sequences.len(), 1);

    let seq = &s.sequences[0];
    assert_eq!(seq.register, "Step");
    assert_eq!(seq.steps, vec![0, 10, 20, 30]);
}

/// The transitions, with what has to be true for each.
#[test]
fn it_says_what_moves_the_machine_between_steps() {
    let s = sequences(&fixture("08-multi-step-sequence"));
    let seq = &s.sequences[0];

    let clamp = seq.transitions.iter().find(|t| t.from == Some(0)).unwrap();
    assert_eq!(clamp.to, 10);
    assert!(clamp.when.contains(&"Start_PB is on".to_string()));
    assert!(clamp.when.contains(&"Part_Present is on".to_string()));

    // The step it is on is not listed as a condition of leaving it.
    assert!(!clamp.when.iter().any(|w| w.starts_with("Step")));
}

/// A fault reset that jumps to idle from anywhere has no step it comes from,
/// and saying "from step 0" would be wrong in the way that matters.
#[test]
fn a_reset_from_anywhere_has_no_from_step() {
    let s = sequences(&fixture("08-multi-step-sequence"));
    let reset = s.sequences[0]
        .transitions
        .iter()
        .find(|t| t.from.is_none())
        .expect("the E-stop reset");
    assert_eq!(reset.to, 0);
    assert!(reset.when.contains(&"EStop_OK is off".to_string()));
}

/// "What prevents step 40" is the question somebody asks at the machine.
#[test]
fn it_answers_what_has_to_be_true_to_leave_a_step() {
    let s = sequences(&fixture("08-multi-step-sequence"));
    let out = s.sequences[0].what_prevents(20);
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].to, 30);
    assert!(out[0].when.iter().any(|w| w.contains("Dwell")));
}

/// A program with no step register is not a program with an empty sequence.
#[test]
fn a_program_without_a_sequence_says_so_rather_than_returning_nothing() {
    let s = sequences(&fixture("01-motor-starter"));
    assert!(s.sequences.is_empty());
    assert!(
        s.notes.iter().any(|n| n.contains("No step register found")),
        "an empty list would read as 'no sequence here'"
    );
    assert!(
        s.notes.iter().any(|n| n.contains("chain of latched bits")),
        "and it says which shapes it does not recognise"
    );
}

/// One move into a register is an initialisation, not a sequence.
#[test]
fn a_single_move_is_not_called_a_sequence() {
    let mut p = fixture("01-motor-starter");
    let ladx_ir::PouBody::Ladder { rungs } = &mut p.pous[0].body else { panic!() };
    rungs.push(ladx_ir::Rung {
        id: "r_init".into(),
        comment: None,
        logic: ladx_ir::Logic::empty(),
        outputs: vec![ladx_ir::Instruction {
            id: "i".into(),
            op: ladx_ir::OpCode::Move,
            operands: vec![
                ladx_ir::Operand::Number { value: 0.0 },
                ladx_ir::Operand::Tag { name: "Counter".into() },
            ],
            vendor: None,
        }],
    });
    assert!(sequences(&p).sequences.is_empty());
}

/// A step nothing leaves is where the machine stops, and that is worth saying.
#[test]
fn it_reports_terminal_and_unreachable_steps() {
    let mut p = fixture("08-multi-step-sequence");
    // Remove the rung that returns to idle, stranding step 30.
    for pou in &mut p.pous {
        if let ladx_ir::PouBody::Ladder { rungs } = &mut pou.body {
            rungs.retain(|r| r.id != "r31");
        }
    }
    let s = sequences(&p);
    assert!(s.sequences[0].terminal.contains(&30), "nothing leaves 30 now");
}

/// The register is found by shape rather than by name, so a sequence in a tag
/// called Phase is found just as one called Step is.
#[test]
fn the_register_is_found_by_shape_not_by_name() {
    let mut p = fixture("08-multi-step-sequence");
    for pou in &mut p.pous {
        if let ladx_ir::PouBody::Ladder { rungs } = &mut pou.body {
            for r in rungs {
                for i in r.outputs.iter_mut().chain(
                    // conditions too: the comparisons name it
                    std::iter::empty(),
                ) {
                    for o in &mut i.operands {
                        if let ladx_ir::Operand::Tag { name } = o {
                            if name == "Step" {
                                *name = "Phase".into();
                            }
                        }
                    }
                }
            }
        }
    }
    let s = sequences(&p);
    assert_eq!(s.sequences[0].register, "Phase");
}
