//! Rockwell to Siemens, end to end.

use ladx_ir::fidelity::{ConversionReport, Fidelity};
use ladx_ir::IrProject;
use ladx_vendor_siemens::migrate::{ir_to_siemens, l5x_to_siemens};
use std::path::PathBuf;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../..")
}

fn fixture(slug: &str) -> IrProject {
    let p = root().join("tests/fixtures/projects").join(slug).join("project.ir.json");
    serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap()
}

fn l5x(slug: &str) -> Vec<u8> {
    std::fs::read(root().join("tests/golden").join(format!("{slug}.L5X"))).unwrap()
}

/// The whole pipeline, on a real file: L5X in, SCL out.
#[test]
fn an_l5x_becomes_scl() {
    let m = l5x_to_siemens(&l5x("01-motor-starter")).expect("should convert");

    assert_eq!(m.project.name, "Motor starter");
    assert_eq!(m.pous.len(), 1);

    let source = m.to_source();
    assert!(source.contains("\"Motor\" := "), "got:\n{source}");
    assert!(source.contains("(\"Start_PB\" OR \"Motor\")"), "the seal-in survived");
}

/// The joint account: whoever gets the result does not care which half lost
/// something.
///
/// Written against an L5X that produces a finding on each side rather than
/// against a golden one, because the goldens LADX writes declare every type
/// and so give the importer nothing to report. That is correct of them and
/// makes them the wrong fixture for this.
#[test]
fn the_report_covers_both_halves() {
    // Conveyor_Speed has no DataType, which the importer has to guess and say
    // so. The timer gives the exporter something to report.
    let raw = br#"<?xml version="1.0"?>
<RSLogix5000Content>
  <Controller Name="Mixed">
    <Tags>
      <Tag Name="Conveyor_Speed"/>
      <Tag Name="Run" DataType="BOOL"/>
      <Tag Name="T1" DataType="TIMER"/>
    </Tags>
    <Programs>
      <Program Name="MainProgram" MainRoutineName="Main">
        <Routines>
          <Routine Name="Main" Type="RLL">
            <RLLContent>
              <Rung Number="0"><Text><![CDATA[XIC(Run)TON(T1,5000,0);]]></Text></Rung>
            </RLLContent>
          </Routine>
        </Routines>
      </Program>
    </Programs>
  </Controller>
</RSLogix5000Content>"#;

    let m = l5x_to_siemens(raw).expect("should convert");

    let approximate: Vec<&str> = m
        .report
        .notes
        .iter()
        .filter(|n| n.fidelity == Fidelity::Approximate)
        .map(|n| n.detail.as_str())
        .collect();

    assert!(
        approximate.iter().any(|d| d.contains("declared no data type")),
        "the import's guess should be in the joint report: {approximate:?}"
    );
    assert!(
        approximate.iter().any(|d| d.contains("not interchangeable")),
        "and so should the export's timer note: {approximate:?}"
    );
}

/// And a project whose types are all declared has nothing to report from the
/// import half, which is the goldens' case.
#[test]
fn a_fully_declared_project_produces_no_import_guesses() {
    let m = l5x_to_siemens(&l5x("01-motor-starter")).unwrap();
    assert!(
        !m.report.notes.iter().any(|n| n.detail.contains("declared no data type")),
        "nothing was guessed, so nothing should be claimed"
    );
}

/// The summary the plan asks for.
#[test]
fn it_counts_what_it_did() {
    let m = l5x_to_siemens(&l5x("01-motor-starter")).unwrap();
    let s = m.summary();
    assert!(s.contains("exact"));
    assert!(s.contains("approximate"));
    assert!(s.contains("require manual review"));
}

/// A timer becomes a Siemens timer with a TIME preset and its declaration.
#[test]
fn a_timer_crosses_properly() {
    let m = l5x_to_siemens(&l5x("03-conveyor")).unwrap();
    let source = m.to_source();
    assert!(source.contains("Jam_Timer : TON_TIME;"), "declared:\n{source}");
    assert!(source.contains("PT := T#5s"), "and with a TIME literal");
    assert!(!source.contains("PT := 5000"));
}

/// The instruction nobody can convert survives as a comment and a finding,
/// rather than being dropped or invented.
#[test]
fn a_pid_survives_the_whole_journey_as_a_finding() {
    let m = ir_to_siemens(&fixture("06-pid-loop"), ConversionReport::new());

    let source = m.to_source();
    assert!(source.contains("// PID("), "named, and carried as a comment:\n{source}");
    assert!(source.contains("under: \"Loop_Enable\""), "with the conditions it sat under");
    // The operands as well. A comment saying an unknown instruction was here,
    // without saying what it worked on, leaves the person rewriting it by hand
    // to go back to the original file anyway.
    for tag in ["PV_Temp", "SP_Temp", "CV_Heater"] {
        assert!(source.contains(tag), "{tag} is missing from:\n{source}");
    }
    assert!(m.needs_review(), "it must reach a person");
    assert!(
        m.report.for_review().iter().any(|n| n.detail.contains("nothing is invented")),
        "and say what it did instead"
    );
}

/// Structured text is carried, and the fact that SCL is not IEC ST is said out
/// loud rather than left to be discovered at compile time.
#[test]
fn structured_text_is_carried_with_a_warning() {
    let mut p = fixture("01-motor-starter");
    p.pous.push(ladx_ir::Pou {
        name: "Calc".into(),
        kind: ladx_ir::PouKind::Program,
        body: ladx_ir::PouBody::StructuredText { source: "Scratch := Scratch + 1;".into() },
        local_tags: vec![],
        comment: None,
        container: None,
    });

    let m = ir_to_siemens(&p, ConversionReport::new());
    assert!(m.to_source().contains("Scratch := Scratch + 1;"), "carried");

    let note = m.report.notes.iter().find(|n| n.subject == "Calc").expect("reported");
    assert_eq!(note.fidelity, Fidelity::ManualReview);
    assert!(note.detail.contains("not identical"));
    assert!(note.detail.contains("will not compile until"), "said plainly");
}

/// A routine LADX cannot convert leaves the project short, and says so rather
/// than producing a file that looks complete.
#[test]
fn a_routine_it_cannot_convert_is_declared_missing() {
    let mut p = fixture("01-motor-starter");
    p.pous.push(ladx_ir::Pou {
        name: "Seq".into(),
        kind: ladx_ir::PouKind::Program,
        body: ladx_ir::PouBody::SequentialFunctionChart { source: String::new() },
        local_tags: vec![],
        comment: None,
        container: None,
    });

    let m = ir_to_siemens(&p, ConversionReport::new());
    let note = m.report.notes.iter().find(|n| n.subject == "Seq").unwrap();
    assert_eq!(note.fidelity, Fidelity::Unsupported);
    assert!(note.detail.contains("short this routine"));
    assert_eq!(m.pous.len(), 1, "and nothing was invented for it");
}

/// Every fixture converts without panicking.
#[test]
fn every_fixture_migrates() {
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
        let m = l5x_to_siemens(&l5x(slug)).unwrap_or_else(|e| panic!("{slug}: {e}"));
        assert!(!m.to_source().trim().is_empty(), "{slug} produced nothing");
    }
}

/// Found by reading the converted file rather than the assertions.
///
/// Through the L5X path a PID lands on the condition side, because an
/// instruction LADX does not recognise cannot be classified as an output. The
/// exporter only wrote output instructions, so a rung whose only content was
/// one of those produced nothing at all: the report flagged it and the SCL file
/// was quietly a rung short. A file that looks complete and is not is the
/// harder failure to catch.
#[test]
fn a_rung_that_converts_to_nothing_is_still_in_the_file() {
    let m = l5x_to_siemens(&l5x("06-pid-loop")).unwrap();
    let source = m.to_source();

    assert!(source.contains("// not converted:"), "got:\n{source}");
    assert!(source.contains("PID("), "with the instruction named");
    assert!(source.contains("PV_Temp"), "and its operands, so nothing is lost");

    assert!(
        m.report.notes.iter().any(|n| n.detail.contains("carried as a comment rather than left out")),
        "and it is reported"
    );
}

/// And the report does not describe something it did not do.
///
/// The condition used to be evaluated before the decision to skip the rung, so
/// it reported that an instruction "was replaced with FALSE" in a rung that was
/// never written. Nothing was replaced, because nothing was written.
#[test]
fn it_does_not_report_a_replacement_that_never_happened() {
    let m = l5x_to_siemens(&l5x("06-pid-loop")).unwrap();
    assert!(
        !m.report.notes.iter().any(|n| n.detail.contains("replaced with FALSE")),
        "nothing was written for that rung, so nothing was replaced: {:?}",
        m.report.notes.iter().map(|n| &n.detail).collect::<Vec<_>>()
    );
}
