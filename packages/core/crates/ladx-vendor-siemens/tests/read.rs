//! SCL in. The direction that did not exist until now.

use ladx_ir::{IrProject, Logic, OpCode, Operand, PouBody};
use ladx_vendor_siemens::read::{read_scl, ReadFidelity};
use ladx_vendor_siemens::scl::{declarations, pou_to_scl};
use std::path::PathBuf;

fn fixture(slug: &str) -> IrProject {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../..")
        .join("tests/fixtures/projects")
        .join(slug)
        .join("project.ir.json");
    serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap()
}

/// The IR as the writer would put it on disk.
fn to_scl(p: &IrProject) -> String {
    let mut src = String::new();
    for pou in &p.pous {
        let s = pou_to_scl(pou);
        src.push_str(&format!("// \u{2500}\u{2500} {} \u{2500}\u{2500}\n", pou.name));
        src.push_str(&declarations(&s.instances));
        src.push('\n');
        src.push_str(&s.source);
        src.push('\n');
    }
    src
}

/// The logic, with the generated ids stripped. SCL has no rung ids, so they
/// cannot survive and comparing them would only ever compare bookkeeping.
fn shape(p: &IrProject) -> Vec<String> {
    p.pous
        .iter()
        .flat_map(|pou| {
            let PouBody::Ladder { rungs } = &pou.body else { return Vec::new() };
            rungs
                .iter()
                .map(|r| {
                    format!(
                        "{}|{:?}=>{:?}",
                        pou.name,
                        r.logic
                            .instructions()
                            .iter()
                            .map(|i| (&i.op, &i.operands))
                            .collect::<Vec<_>>(),
                        r.outputs.iter().map(|i| (&i.op, &i.operands)).collect::<Vec<_>>()
                    )
                })
                .collect()
        })
        .collect()
}

const FIXTURES: [&str; 8] = [
    "01-motor-starter",
    "02-reversing-motor",
    "03-conveyor",
    "04-tank-filling",
    "05-duty-standby-pumps",
    "06-pid-loop",
    "07-alarm-handling",
    "08-multi-step-sequence",
];

/// The check that can actually fail: every fixture out to SCL and back, with
/// the logic compared instruction by instruction.
#[test]
fn every_fixture_survives_the_round_trip() {
    for slug in FIXTURES {
        let before = fixture(slug);
        let src = to_scl(&before);
        let after = read_scl(&before.name, &src);
        assert_eq!(shape(&before), shape(&after.project), "{slug} changed on the way home");
    }
}

/// A statement it cannot read must become a rung carrying the text, never
/// nothing. An importer that drops what it does not understand produces an IR
/// that looks complete and is missing rungs.
#[test]
fn nothing_is_dropped_silently() {
    for slug in FIXTURES {
        let before = fixture(slug);
        let after = read_scl(&before.name, &to_scl(&before));
        assert_eq!(after.unread(), 0, "{slug}: {}", after.summary());
        assert!(after.is_complete(), "{slug}");
    }

    let r = read_scl("odd", "// \u{2500}\u{2500} Main \u{2500}\u{2500}\nFOR i := 1 TO 10 DO x := 1; END_FOR;\n");
    assert_eq!(r.unread(), 1, "a loop is not a rung and must not vanish");
    assert!(!r.is_complete());
    let PouBody::Ladder { rungs } = &r.project.pous[0].body else { panic!() };
    assert_eq!(rungs.len(), 1, "the rung exists even though it was not read");
    assert_eq!(rungs[0].outputs[0].op, OpCode::Unsupported);
    assert!(rungs[0].outputs[0]
        .vendor
        .as_ref()
        .unwrap()
        .attributes
        .iter()
        .any(|(k, v)| k == "source" && v.contains("FOR")));
}

/// A timer preset read wrongly runs the machine on the wrong timing.
#[test]
fn a_timer_preset_comes_back_as_the_same_number_of_milliseconds() {
    let src = "// \u{2500}\u{2500} Main \u{2500}\u{2500}\nVAR\n  T1 : TON_TIME;\nEND_VAR\n\n\"T1\"(IN := \"Go\", PT := T#1m30s);\n";
    let r = read_scl("t", src);
    let PouBody::Ladder { rungs } = &r.project.pous[0].body else { panic!() };
    assert_eq!(rungs[0].outputs[0].op, OpCode::TimerOn);
    assert_eq!(rungs[0].outputs[0].operands[1], Operand::Number { value: 90_000.0 });
}

/// S7 spells a timer's done bit Q; every analysis in the IR looks for DN.
#[test]
fn a_siemens_timer_member_becomes_the_ir_spelling() {
    let src = "// \u{2500}\u{2500} Main \u{2500}\u{2500}\n\"Alarm\" := \"T1\".Q;\n";
    let r = read_scl("t", src);
    let PouBody::Ladder { rungs } = &r.project.pous[0].body else { panic!() };
    let names: Vec<_> = rungs[0].logic.instructions().iter().map(|i| &i.operands).collect();
    assert_eq!(names[0][0], Operand::Tag { name: "T1.DN".into() });
}

/// An edge is an instance and a call in SCL, and one contact in ladder.
#[test]
fn a_one_shot_comes_back_as_a_one_shot() {
    let src = "// \u{2500}\u{2500} Main \u{2500}\u{2500}\nVAR\n  R_TRIG_Go : R_TRIG;\nEND_VAR\n\n\
               \"R_TRIG_Go\"(CLK := \"Go\");\n\"Pulse\" := \"R_TRIG_Go\".Q;\n";
    let r = read_scl("t", src);
    let PouBody::Ladder { rungs } = &r.project.pous[0].body else { panic!() };
    assert_eq!(rungs.len(), 1, "the call is the mechanism, not a rung of its own");
    let i = rungs[0].logic.instructions();
    assert_eq!(i[0].op, OpCode::RisingEdge);
    assert_eq!(i[0].operands[0], Operand::Tag { name: "Go".into() });
}

/// Writing an integer register as a coil would make it look like a bit.
#[test]
fn a_number_written_to_a_register_is_a_move_not_a_coil() {
    // Two transitions, because one move into a register is an initialisation
    // and the sequence reader is right to refuse to call it a sequence.
    let src = "// \u{2500}\u{2500} Main \u{2500}\u{2500}\n\
               IF \"Step\" = 10 AND \"Done\" THEN \"Step\" := 20; END_IF;\n\
               IF \"Step\" = 20 AND \"Home\" THEN \"Step\" := 10; END_IF;\n";
    let r = read_scl("t", src);
    let PouBody::Ladder { rungs } = &r.project.pous[0].body else { panic!() };
    assert_eq!(rungs[0].outputs[0].op, OpCode::Move);
    assert_eq!(rungs[0].outputs[0].operands[0], Operand::Number { value: 20.0 });
    assert_eq!(rungs[0].outputs[0].operands[1], Operand::Tag { name: "Step".into() });
    // And the sequence reader downstream can then see it.
    let seqs = ladx_ir::sequence::sequences(&r.project);
    assert_eq!(seqs.sequences.len(), 1);
    assert_eq!(seqs.sequences[0].register, "Step");
    assert_eq!(seqs.sequences[0].steps, vec![10, 20]);
}

/// NOT over a group is not a negated contact, and guessing would be a
/// different rung.
#[test]
fn a_negation_it_cannot_express_in_ladder_is_refused_not_guessed() {
    let src = "// \u{2500}\u{2500} Main \u{2500}\u{2500}\n\"X\" := NOT (\"A\" AND \"B\");\n";
    let r = read_scl("t", src);
    assert_eq!(r.unread(), 1, "de Morgan is a different rung, not this one");
}

/// Reading the file must not silently invent addresses that are not in it.
#[test]
fn it_says_that_addresses_are_not_in_the_source() {
    let before = fixture("03-conveyor");
    let after = read_scl(&before.name, &to_scl(&before));
    assert!(after.project.tags.iter().all(|t| t.address.is_none()));
    assert!(
        after.notes.iter().any(|n| n.detail.contains("no hardware addresses")),
        "and it has to say so, or an I/O list built from this looks merely empty"
    );
}

/// The import is marked as Siemens, so an export back picks the right dialect.
#[test]
fn the_program_knows_where_it_came_from() {
    let r = read_scl("t", "// \u{2500}\u{2500} Main \u{2500}\u{2500}\n\"A\" := \"B\";\n");
    assert_eq!(r.project.source_vendor, Some(ladx_ir::Vendor::Siemens));
    assert_eq!(r.project.entry_point.as_deref(), Some("Main"));
}

/// Declarations become tags with their types, not everything flattened to BOOL.
#[test]
fn declared_types_are_kept() {
    let src = "// \u{2500}\u{2500} Main \u{2500}\u{2500}\nVAR\n  Count : INT;\n  Level : REAL;\n  T1 : TON_TIME;\nEND_VAR\n\n\"A\" := \"B\";\n";
    let r = read_scl("t", src);
    let ty = |n: &str| {
        r.project.tags.iter().find(|t| t.name == n).map(|t| t.data_type.clone()).unwrap()
    };
    assert_eq!(ty("Count"), ladx_ir::DataType::Int);
    assert_eq!(ty("Level"), ladx_ir::DataType::Real);
    assert_eq!(ty("T1"), ladx_ir::DataType::Timer);
}

/// Two outputs on one rung leave as two statements. Rejoining them keeps the
/// rung counts in every downstream report honest.
#[test]
fn statements_sharing_conditions_are_rejoined_into_one_rung() {
    let src = "// \u{2500}\u{2500} Main \u{2500}\u{2500}\n\"A\" := \"Go\";\n\"B\" := \"Go\";\n";
    let r = read_scl("t", src);
    let PouBody::Ladder { rungs } = &r.project.pous[0].body else { panic!() };
    assert_eq!(rungs.len(), 1);
    assert_eq!(rungs[0].outputs.len(), 2);
    assert!(r.notes.iter().any(|n| n.detail.contains("Joined to the statement above")));
}

/// A statement with its own comment was written as its own thing, and joining
/// it would throw that text away.
#[test]
fn a_statement_with_its_own_comment_is_left_alone() {
    let src = "// \u{2500}\u{2500} Main \u{2500}\u{2500}\n\"A\" := \"Go\";\n// Its own reason.\n\"B\" := \"Go\";\n";
    let r = read_scl("t", src);
    let PouBody::Ladder { rungs } = &r.project.pous[0].body else { panic!() };
    assert_eq!(rungs.len(), 2);
    assert_eq!(rungs[1].comment.as_deref(), Some("Its own reason."));
}

/// Unconditional statements must never be joined: they have no conditions in
/// common, they merely both have none.
#[test]
fn unconditional_statements_are_not_joined() {
    let src = "// \u{2500}\u{2500} Main \u{2500}\u{2500}\n\"Step\" := 0;\n\"Count\" := 0;\n";
    let r = read_scl("t", src);
    let PouBody::Ladder { rungs } = &r.project.pous[0].body else { panic!() };
    assert_eq!(rungs.len(), 2);
}

/// A routine is not a tag. Declaring it as one puts an invented BOOL in the
/// tag list, which then appears in the I/O list and in every drift report as a
/// tag no other list has heard of.
#[test]
fn a_called_routine_does_not_become_a_tag() {
    let before = fixture("08-multi-step-sequence");
    let after = read_scl(&before.name, &to_scl(&before));
    assert!(
        !after.project.tags.iter().any(|t| t.name == "Sequence"),
        "got {:?}",
        after.project.tags.iter().map(|t| &t.name).collect::<Vec<_>>()
    );
    // And the call itself still happened.
    assert!(after.project.pous.iter().any(|p| p.name == "Sequence"));
}

/// Rung comments are what makes a program readable, and they are the first
/// thing a converter loses.
#[test]
fn comments_survive_the_round_trip() {
    let before = fixture("03-conveyor");
    let after = read_scl(&before.name, &to_scl(&before));
    let PouBody::Ladder { rungs } = &after.project.pous[0].body else { panic!() };
    assert!(rungs.iter().any(|r| r
        .comment
        .as_deref()
        .is_some_and(|c| c.contains("Run, dropped by a jam"))));
}

/// A file that is not SCL must say so rather than importing as an empty
/// program.
#[test]
fn a_file_with_no_logic_says_so() {
    let r = read_scl("t", "just some words\n");
    assert!(r.notes.iter().any(|n| n.fidelity == ReadFidelity::Unread));
}

/// Parentheses decide what the rung means.
#[test]
fn grouping_is_preserved() {
    let src = "// \u{2500}\u{2500} Main \u{2500}\u{2500}\n\"M\" := (\"A\" OR \"M\") AND \"B\";\n";
    let r = read_scl("t", src);
    let PouBody::Ladder { rungs } = &r.project.pous[0].body else { panic!() };
    let Logic::Series { children } = &rungs[0].logic else {
        panic!("the AND is outermost, got {:?}", rungs[0].logic)
    };
    assert!(matches!(children[0], Logic::Parallel { .. }), "the seal-in is the branch");
}
