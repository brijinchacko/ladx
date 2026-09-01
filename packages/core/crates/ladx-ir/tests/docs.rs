//! Documents written from the program, and the gaps they admit to.

use ladx_ir::docs::control_narrative;
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

/// Every claim about the program names the rung it came from.
///
/// A document gets copied into other documents, and a citation that survives
/// copying is the only kind worth having, which is why provenance is in the
/// text rather than in a column beside it.
#[test]
fn every_statement_about_the_logic_cites_a_rung() {
    let d = control_narrative(&fixture("03-conveyor"));
    let operation = d.sections.iter().find(|s| s.heading == "Operation").unwrap();

    assert!(!operation.paragraphs.is_empty());
    for p in &operation.paragraphs {
        assert!(!p.from.is_empty(), "{} cites nothing", p.text);
        assert!(p.from[0].contains('/'), "a citation names a routine and a rung");
    }

    let md = d.to_markdown();
    assert!(md.contains("*Source: Main/r7*"));
}

/// The conditions on the rung, in the order they are read.
#[test]
fn it_describes_what_has_to_be_true() {
    let d = control_narrative(&fixture("03-conveyor"));
    let md = d.to_markdown();
    assert!(md.contains("Stop_PB is on"));
    assert!(md.contains("EStop_OK is on"));
    assert!(md.contains("Jam_Alarm is off"));
}

/// An alternative is not a requirement, in prose as in the trace.
#[test]
fn a_seal_in_reads_as_an_alternative() {
    let d = control_narrative(&fixture("01-motor-starter"));
    let md = d.to_markdown();
    assert!(
        md.contains("any of Start_PB or Motor is on"),
        "the start button and the seal-in are alternatives:\n{md}"
    );
}

/// What the program cannot say is written into the document rather than left
/// out, because a gap is obviously a gap and an invention is only obvious to
/// somebody who already knows the answer.
#[test]
fn what_the_program_cannot_answer_is_marked_rather_than_invented() {
    let d = control_narrative(&fixture("01-motor-starter"));
    let md = d.to_markdown();

    assert!(md.contains("REQUIRES ENGINEER INPUT"));
    assert!(md.contains("purpose of the machine"));
    assert!(md.contains("Safety requirements"));
    assert!(d.gaps() >= 3);
}

/// A routine LADX cannot read is declared, so silence is not mistaken for
/// nothing happening there.
#[test]
fn an_unreadable_routine_is_declared() {
    let mut p = fixture("01-motor-starter");
    p.pous.push(ladx_ir::Pou {
        name: "Faults".into(),
        kind: ladx_ir::PouKind::Program,
        body: ladx_ir::PouBody::StructuredText { source: "x := 1;".into() },
        local_tags: vec![],
        comment: None,
        container: None,
    });
    let md = control_narrative(&p).to_markdown();
    assert!(md.contains("Faults is not ladder"));
    assert!(md.contains("nothing in this document describes what it does"));
}

/// An output nothing drives is a gap, not a sentence.
#[test]
fn an_undriven_output_is_reported_rather_than_described() {
    let mut p = fixture("01-motor-starter");
    p.tags.push(ladx_ir::Tag {
        name: "Spare_Lamp".into(),
        data_type: ladx_ir::DataType::Bool,
        address: Some("Q0.7".into()),
        initial_value: None,
        comment: None,
        field: Some(ladx_ir::FieldDevice {
            direction: ladx_ir::IoDirection::Output,
            kind: Some(ladx_ir::DeviceKind::Lamp),
        }),
    });
    let d = control_narrative(&p);
    let operation = d.sections.iter().find(|s| s.heading == "Operation").unwrap();
    assert!(operation
        .needs_engineer
        .iter()
        .any(|g| g.contains("Spare_Lamp") && g.contains("nothing in the program drives it")));
}

/// A tag with no description does not read as a mistake.
#[test]
fn a_tag_with_no_description_is_not_named_twice() {
    let md = control_narrative(&fixture("03-conveyor")).to_markdown();
    assert!(!md.contains("(Conveyor)"), "the tag and the name are the same string:\n{md}");
    assert!(md.contains("**Conveyor**."));
}

/// And one with a description reads as the description.
#[test]
fn a_described_tag_reads_as_its_description() {
    let md = control_narrative(&fixture("01-motor-starter")).to_markdown();
    assert!(md.contains("**Motor contactor** (Motor)."));
}

#[test]
fn every_fixture_produces_a_document() {
    for slug in [
        "01-motor-starter",
        "02-reversing-motor",
        "03-conveyor",
        "04-tank-filling",
        "05-duty-standby-pumps",
        "07-alarm-handling",
        "08-multi-step-sequence",
    ] {
        let d = control_narrative(&fixture(slug));
        assert!(!d.to_markdown().trim().is_empty(), "{slug} produced nothing");
        assert!(d.sections.len() >= 4, "{slug} is missing sections");
    }
}
