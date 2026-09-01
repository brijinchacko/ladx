//! SCL from the fixtures, checked for the things S7 actually requires.

use ladx_ir::fidelity::Fidelity;
use ladx_ir::{IrProject, PouBody};
use ladx_vendor_siemens::scl::{declarations, pou_to_scl};
use std::path::PathBuf;

fn fixture(slug: &str) -> IrProject {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../..")
        .join("tests/fixtures/projects")
        .join(slug)
        .join("project.ir.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn scl(slug: &str) -> ladx_vendor_siemens::scl::Scl {
    let p = fixture(slug);
    pou_to_scl(&p.pous[0])
}

/// The difference that makes this a Siemens exporter rather than a rename of
/// the ST one.
#[test]
fn a_timer_preset_is_a_time_literal_not_a_number() {
    let out = scl("03-conveyor");
    assert!(out.source.contains("PT := T#5s"), "got:\n{}", out.source);
    assert!(!out.source.contains("PT := 5000"), "a bare number is a type error in SCL");
}

/// A timer in S7 is an instance with storage. Generated code that calls one
/// without declaring it does not compile.
#[test]
fn a_timer_brings_its_instance_declaration() {
    let out = scl("03-conveyor");
    assert_eq!(out.instances.get("Jam_Timer").map(String::as_str), Some("TON_TIME"));

    let decl = declarations(&out.instances);
    assert!(decl.contains("VAR"));
    assert!(decl.contains("Jam_Timer : TON_TIME;"));
    assert!(decl.contains("END_VAR"));
}

/// And it is not silently presented as equivalent to the Rockwell one.
#[test]
fn the_timer_difference_is_reported() {
    let out = scl("03-conveyor");
    assert!(
        out.report.notes.iter().any(|n| {
            n.fidelity == Fidelity::Approximate && n.detail.contains("not interchangeable")
        }),
        "the semantic difference has to be stated"
    );
}

/// A one-shot has no operator in SCL.
#[test]
fn a_one_shot_becomes_an_edge_instance_named_after_its_tag() {
    let out = scl("05-duty-standby-pumps");
    assert!(out.instances.contains_key("R_TRIG_Run_Req"), "got {:?}", out.instances);
    assert_eq!(out.instances.get("R_TRIG_Run_Req").map(String::as_str), Some("R_TRIG"));
    // Named after the tag so two one-shots do not share storage and cancel
    // each other.
    assert!(out.source.contains("\"R_TRIG_Run_Req\".Q"));
}

#[test]
fn a_seal_in_keeps_its_brackets() {
    let out = scl("01-motor-starter");
    assert!(
        out.source.contains("(\"Start_PB\" OR \"Motor\")"),
        "the parallel has to stay grouped:\n{}",
        out.source
    );
    assert!(out.source.contains("\"Motor\" := "));
}

#[test]
fn tags_are_quoted_the_way_s7_writes_them() {
    let out = scl("01-motor-starter");
    assert!(out.source.contains("\"Stop_PB\""));
    assert!(!out.source.contains(" Stop_PB "), "an unquoted tag is a different symbol in S7");
}

#[test]
fn a_normally_closed_contact_becomes_not() {
    let out = scl("02-reversing-motor");
    assert!(out.source.contains("NOT \"Rev\""));
}

#[test]
fn set_and_reset_become_if_blocks() {
    let out = scl("04-tank-filling");
    assert!(out.source.contains("\"Filling\" := TRUE;"));
    assert!(out.source.contains("\"Filling\" := FALSE;"));
}

/// An instruction with no S7 form is a comment, so nothing is lost and nothing
/// is invented.
#[test]
fn an_unrecognised_instruction_becomes_a_comment_and_a_finding() {
    let out = scl("06-pid-loop");
    assert!(out.source.contains("// PID under:"), "got:\n{}", out.source);
    assert!(
        out.report.notes.iter().any(|n| n.fidelity == Fidelity::Unsupported
            && n.detail.contains("nothing is invented"))
    );
    assert!(out.report.needs_human());
}

#[test]
fn rung_comments_survive_as_scl_comments() {
    let out = scl("01-motor-starter");
    assert!(out.source.contains("// Motor seal-in"));
}

/// Every fixture produces something, and nothing panics.
#[test]
fn every_fixture_converts() {
    for slug in [
        "01-motor-starter",
        "02-reversing-motor",
        "03-conveyor",
        "04-tank-filling",
        "05-duty-standby-pumps",
        "06-pid-loop",
        "07-alarm-handling",
        "08-multi-step-sequence",
    ] {
        let p = fixture(slug);
        for pou in &p.pous {
            let PouBody::Ladder { .. } = &pou.body else { continue };
            let out = pou_to_scl(pou);
            assert!(!out.source.trim().is_empty(), "{slug}/{} produced nothing", pou.name);
        }
    }
}

/// The bug the generated output showed and the assertions did not.
///
/// `.DN` is Rockwell's done bit. S7 exposes `Q`, and it quotes the symbol
/// rather than the whole path: `"Jam_Timer".Q`, never `"Jam_Timer.DN"`, which
/// is both the wrong member and the wrong symbol and does not compile.
#[test]
fn a_rockwell_done_bit_becomes_the_s7_output() {
    let out = scl("03-conveyor");
    assert!(out.source.contains("\"Jam_Timer\".Q"), "got:\n{}", out.source);
    assert!(!out.source.contains("Jam_Timer.DN"), "the Rockwell spelling must not survive");
    assert!(!out.source.contains("\"Jam_Timer.Q\""), "S7 quotes the symbol, not the path");
}

#[test]
fn the_other_timer_members_map_too() {
    use ladx_ir::{Instruction, Logic, OpCode, Operand, Pou, PouKind, Rung};

    let rung = |tag: &str| Rung {
        id: "r1".into(),
        comment: None,
        logic: Logic::Element {
            instruction: Instruction {
                id: "i1".into(),
                op: OpCode::Contact,
                operands: vec![Operand::Tag { name: tag.into() }],
                vendor: None,
            },
        },
        outputs: vec![Instruction {
            id: "o1".into(),
            op: OpCode::Coil,
            operands: vec![Operand::Tag { name: "Out".into() }],
            vendor: None,
        }],
    };

    for (rockwell, s7) in [("T1.DN", "\"T1\".Q"), ("T1.ACC", "\"T1\".ET"), ("T1.PRE", "\"T1\".PT")] {
        let pou = Pou {
            name: "P".into(),
            kind: PouKind::Program,
            body: PouBody::Ladder { rungs: vec![rung(rockwell)] },
            local_tags: vec![],
            comment: None,
            container: None,
        };
        let out = pou_to_scl(&pou);
        assert!(out.source.contains(s7), "{rockwell} should become {s7}, got:\n{}", out.source);
    }
}

/// A member with no S7 equivalent is reported rather than invented.
#[test]
fn a_member_s7_does_not_have_is_reported() {
    use ladx_ir::{Instruction, Logic, OpCode, Operand, Pou, PouKind, Rung};

    let pou = Pou {
        name: "P".into(),
        kind: PouKind::Program,
        body: PouBody::Ladder {
            rungs: vec![Rung {
                id: "r1".into(),
                comment: None,
                logic: Logic::Element {
                    instruction: Instruction {
                        id: "i1".into(),
                        op: OpCode::Contact,
                        // Rockwell's timer-timing bit. An IEC timer has no such
                        // output.
                        operands: vec![Operand::Tag { name: "T1.TT".into() }],
                        vendor: None,
                    },
                },
                outputs: vec![Instruction {
                    id: "o1".into(),
                    op: OpCode::Coil,
                    operands: vec![Operand::Tag { name: "Out".into() }],
                    vendor: None,
                }],
            }],
        },
        local_tags: vec![],
        comment: None,
        container: None,
    };

    let out = pou_to_scl(&pou);
    let note = out
        .report
        .notes
        .iter()
        .find(|n| n.detail.contains("T1.TT"))
        .expect("it has to be reported");
    assert_eq!(note.fidelity, Fidelity::ManualReview);
    assert!(note.detail.contains("only Q and ET"));
    assert!(note.detail.contains("will not compile"), "said plainly");
}
