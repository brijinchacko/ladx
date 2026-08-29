//! LADX IR back out as an L5X.
//!
//! The point of this module is not that LADX can generate a project file. It is
//! that a project which came *in* through [`crate::l5x_ir`] can go back out
//! recognisably, so the import can be trusted. An importer nobody has ever run
//! backwards is an importer whose losses are invisible.
//!
//! What it writes is deliberately plain. Studio 5000 puts a great deal into an
//! L5X that LADX has no opinion about, and inventing plausible values for any of
//! it would be worse than leaving it out: a file that looks complete and is
//! subtly wrong is harder to diagnose than one that is obviously partial. So
//! this writes what the IR actually knows and nothing else.
//!
//! It is not a substitute for exporting from Studio 5000, and nothing here has
//! been imported by Studio 5000. Until it has, this is a round-trip check.

use ladx_ir::fidelity::{ConversionReport, Fidelity};
use ladx_ir::{DataType, IrProject, Pou, PouBody, PouKind, Tag, neutral_text};
use quick_xml::Writer;
use quick_xml::events::{BytesCData, BytesEnd, BytesStart, Event};
use std::collections::BTreeMap;

use crate::Result;

/// An L5X, and what it cost to write.
pub struct L5xExport {
    pub xml: String,
    pub report: ConversionReport,
}

/// Rockwell's spelling for the types the IR models.
fn type_name(dt: &DataType) -> String {
    match dt {
        DataType::Bool => "BOOL".into(),
        DataType::Int => "INT".into(),
        DataType::Dint => "DINT".into(),
        DataType::Real => "REAL".into(),
        DataType::String => "STRING".into(),
        DataType::Timer => "TIMER".into(),
        DataType::Counter => "COUNTER".into(),
        DataType::Named { name } => name.clone(),
        // Rockwell writes the element type and a Dimensions attribute; the IR
        // carries the length, so the caller records the shortfall.
        DataType::Array { of, .. } => type_name(of),
    }
}

/// Split `Program/Thing` back into its two halves.
///
/// The IR is flat and qualifies names on the way in so two programs cannot
/// collide. Going out, that has to be undone, and it has to be undone the same
/// way it was done or a project will come back with its routines in the wrong
/// program.
fn unqualify(name: &str) -> (Option<&str>, &str) {
    match name.split_once('/') {
        Some((program, rest)) => (Some(program), rest),
        None => (None, name),
    }
}

fn start(name: &str, attrs: &[(&str, &str)]) -> BytesStart<'static> {
    let mut e = BytesStart::new(name.to_string());
    for (k, v) in attrs {
        e.push_attribute((*k, *v));
    }
    e
}

pub fn write(project: &IrProject) -> Result<L5xExport> {
    let mut report = ConversionReport::new();
    let mut w = Writer::new_with_indent(Vec::new(), b' ', 2);

    w.write_event(Event::Decl(quick_xml::events::BytesDecl::new(
        "1.0",
        Some("UTF-8"),
        None,
    )))?;

    w.write_event(Event::Start(start(
        "RSLogix5000Content",
        &[("SchemaRevision", "1.0"), ("TargetType", "Controller")],
    )))?;
    w.write_event(Event::Start(start("Controller", &[("Name", &project.name)])))?;

    // ── data types ──────────────────────────────────────────────────────
    if !project.data_types.is_empty() {
        w.write_event(Event::Start(start("DataTypes", &[])))?;
        for dt in &project.data_types {
            w.write_event(Event::Start(start("DataType", &[("Name", &dt.name)])))?;
            w.write_event(Event::Start(start("Members", &[])))?;
            for m in &dt.members {
                write_member(&mut w, m)?;
            }
            w.write_event(Event::End(BytesEnd::new("Members")))?;
            w.write_event(Event::End(BytesEnd::new("DataType")))?;
        }
        w.write_event(Event::End(BytesEnd::new("DataTypes")))?;
    }

    // ── tags, split back into their scopes ──────────────────────────────
    let mut controller_tags: Vec<&Tag> = Vec::new();
    let mut program_tags: BTreeMap<&str, Vec<&Tag>> = BTreeMap::new();
    for t in &project.tags {
        match unqualify(&t.name) {
            (Some(program), _) => program_tags.entry(program).or_default().push(t),
            (None, _) => controller_tags.push(t),
        }
    }

    w.write_event(Event::Start(start("Tags", &[])))?;
    for t in &controller_tags {
        write_tag(&mut w, t, &mut report)?;
    }
    w.write_event(Event::End(BytesEnd::new("Tags")))?;

    // ── programs and routines ───────────────────────────────────────────
    let mut programs: BTreeMap<&str, Vec<&Pou>> = BTreeMap::new();
    let mut aois: Vec<&Pou> = Vec::new();
    for pou in &project.pous {
        if pou.kind == PouKind::FunctionBlock {
            aois.push(pou);
            continue;
        }
        programs.entry(pou.container.as_deref().unwrap_or("MainProgram")).or_default().push(pou);
    }

    w.write_event(Event::Start(start("Programs", &[])))?;
    for (program, pous) in &programs {
        // The entry point names a routine; it belongs on the program that
        // actually contains a POU of that name.
        let main = project.entry_point.as_deref().and_then(|e| {
            pous.iter().any(|p| p.name == e).then(|| e.to_string())
        });

        let mut attrs: Vec<(&str, &str)> = vec![("Name", program)];
        if let Some(m) = &main {
            attrs.push(("MainRoutineName", m));
        }
        w.write_event(Event::Start(start("Program", &attrs)))?;

        w.write_event(Event::Start(start("Tags", &[])))?;
        for t in program_tags.get(*program).into_iter().flatten() {
            write_tag(&mut w, t, &mut report)?;
        }
        w.write_event(Event::End(BytesEnd::new("Tags")))?;

        w.write_event(Event::Start(start("Routines", &[])))?;
        for pou in pous {
            write_routine(&mut w, pou, &mut report)?;
        }
        w.write_event(Event::End(BytesEnd::new("Routines")))?;
        w.write_event(Event::End(BytesEnd::new("Program")))?;
    }
    w.write_event(Event::End(BytesEnd::new("Programs")))?;

    // ── add-on instructions ─────────────────────────────────────────────
    if !aois.is_empty() {
        w.write_event(Event::Start(start("AddOnInstructionDefinitions", &[])))?;
        for aoi in &aois {
            let mut attrs: Vec<(&str, &str)> = vec![("Name", aoi.name.as_str())];
            if let Some(c) = &aoi.comment {
                attrs.push(("Description", c));
            }
            w.write_event(Event::Start(start("AddOnInstructionDefinition", &attrs)))?;
            w.write_event(Event::Start(start("Parameters", &[])))?;
            for p in &aoi.local_tags {
                let ty = type_name(&p.data_type);
                w.write_event(Event::Empty(start(
                    "Parameter",
                    &[("Name", &p.name), ("DataType", &ty)],
                )))?;
            }
            w.write_event(Event::End(BytesEnd::new("Parameters")))?;
            w.write_event(Event::End(BytesEnd::new("AddOnInstructionDefinition")))?;
        }
        w.write_event(Event::End(BytesEnd::new("AddOnInstructionDefinitions")))?;
    }

    w.write_event(Event::End(BytesEnd::new("Controller")))?;
    w.write_event(Event::End(BytesEnd::new("RSLogix5000Content")))?;

    let xml = String::from_utf8(w.into_inner())
        .map_err(|e| crate::ParseError::Schema(format!("produced invalid UTF-8: {e}")))?;
    Ok(L5xExport { xml, report })
}

fn write_member<W: std::io::Write>(w: &mut Writer<W>, m: &Tag) -> Result<()> {
    let ty = type_name(&m.data_type);
    let mut attrs: Vec<(&str, &str)> = vec![("Name", m.name.as_str()), ("DataType", &ty)];
    if let Some(c) = &m.comment {
        attrs.push(("Description", c));
    }
    w.write_event(Event::Empty(start("Member", &attrs)))?;
    Ok(())
}

fn write_tag<W: std::io::Write>(
    w: &mut Writer<W>,
    t: &Tag,
    report: &mut ConversionReport,
) -> Result<()> {
    let (_, bare) = unqualify(&t.name);
    let ty = type_name(&t.data_type);

    if let DataType::Array { length, .. } = &t.data_type {
        report.add(
            Fidelity::Approximate,
            format!("Tag {bare}"),
            format!("Written as {ty}; the array length {length} is not expressed."),
        );
    }

    let mut attrs: Vec<(&str, &str)> = vec![("Name", bare), ("DataType", &ty)];
    if let Some(a) = &t.address {
        attrs.push(("AliasFor", a));
    }

    match &t.comment {
        Some(c) => {
            w.write_event(Event::Start(start("Tag", &attrs)))?;
            w.write_event(Event::Start(start("Description", &[])))?;
            w.write_event(Event::CData(BytesCData::new(c.as_str())))?;
            w.write_event(Event::End(BytesEnd::new("Description")))?;
            w.write_event(Event::End(BytesEnd::new("Tag")))?;
        }
        None => {
            w.write_event(Event::Empty(start("Tag", &attrs)))?;
        }
    }
    Ok(())
}

fn write_routine<W: std::io::Write>(
    w: &mut Writer<W>,
    pou: &Pou,
    report: &mut ConversionReport,
) -> Result<()> {
    let name = pou.name.as_str();

    match &pou.body {
        PouBody::Ladder { rungs } => {
            w.write_event(Event::Start(start(
                "Routine",
                &[("Name", name), ("Type", "RLL")],
            )))?;
            w.write_event(Event::Start(start("RLLContent", &[])))?;
            for (n, rung) in rungs.iter().enumerate() {
                let number = n.to_string();
                match neutral_text::rung_to_text(rung) {
                    Ok(text) => {
                        w.write_event(Event::Start(start(
                            "Rung",
                            &[("Number", &number), ("Type", "N")],
                        )))?;
                        if let Some(c) = &rung.comment {
                            w.write_event(Event::Start(start("Comment", &[])))?;
                            w.write_event(Event::CData(BytesCData::new(c.as_str())))?;
                            w.write_event(Event::End(BytesEnd::new("Comment")))?;
                        }
                        w.write_event(Event::Start(start("Text", &[])))?;
                        w.write_event(Event::CData(BytesCData::new(text.as_str())))?;
                        w.write_event(Event::End(BytesEnd::new("Text")))?;
                        w.write_event(Event::End(BytesEnd::new("Rung")))?;
                    }
                    Err(e) => {
                        // Left out rather than written wrong, and named so
                        // somebody knows the export is short of a rung.
                        report.add(
                            Fidelity::Unsupported,
                            format!("{}/{}", pou.name, rung.id),
                            format!("Could not be written as Rockwell ladder ({e}); omitted."),
                        );
                    }
                }
            }
            w.write_event(Event::End(BytesEnd::new("RLLContent")))?;
            w.write_event(Event::End(BytesEnd::new("Routine")))?;
        }

        PouBody::StructuredText { source } => {
            w.write_event(Event::Start(start(
                "Routine",
                &[("Name", name), ("Type", "ST")],
            )))?;
            w.write_event(Event::Start(start("STContent", &[])))?;
            for (n, line) in source.lines().enumerate() {
                let number = n.to_string();
                w.write_event(Event::Start(start("Line", &[("Number", &number)])))?;
                w.write_event(Event::CData(BytesCData::new(line)))?;
                w.write_event(Event::End(BytesEnd::new("Line")))?;
            }
            w.write_event(Event::End(BytesEnd::new("STContent")))?;
            w.write_event(Event::End(BytesEnd::new("Routine")))?;
        }

        other => {
            report.add(
                Fidelity::ManualReview,
                pou.name.clone(),
                format!(
                    "{} is carried in the IR but LADX cannot write it as an L5X routine; \
                     the routine is present but empty.",
                    other.language_name()
                ),
            );
            w.write_event(Event::Empty(start(
                "Routine",
                &[("Name", name), ("Type", other.language_name())],
            )))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::l5x_ir;

    /// The test this module exists for.
    ///
    /// An importer nobody has run backwards is one whose losses are invisible.
    /// Reading the sample, writing it out, and reading it again must produce the
    /// same project: same tags in the same scopes, same routines in the same
    /// programs, same rungs, same AOI interface.
    #[test]
    fn a_project_survives_l5x_to_ir_to_l5x_to_ir() {
        let first = l5x_ir::parse_to_ir(l5x_ir::tests_sample().as_bytes()).unwrap().project;
        let written = write(&first).unwrap();
        let second = l5x_ir::parse_to_ir(written.xml.as_bytes())
            .unwrap_or_else(|e| panic!("our own output did not parse: {e}\n{}", written.xml))
            .project;

        assert_eq!(second.name, first.name);
        assert_eq!(second.entry_point, first.entry_point, "entry point moved");

        let names = |p: &IrProject| {
            let mut v: Vec<String> = p.tags.iter().map(|t| t.name.clone()).collect();
            v.sort();
            v
        };
        assert_eq!(names(&second), names(&first), "tags changed scope or vanished");

        let pous = |p: &IrProject| {
            let mut v: Vec<String> = p.pous.iter().map(|x| x.name.clone()).collect();
            v.sort();
            v
        };
        assert_eq!(pous(&second), pous(&first), "routines moved or vanished");
    }

    /// The rungs specifically, since a project can keep every name and still
    /// lose its logic.
    #[test]
    fn the_rungs_come_back() {
        let first = l5x_ir::parse_to_ir(l5x_ir::tests_sample().as_bytes()).unwrap().project;
        let written = write(&first).unwrap();
        let second = l5x_ir::parse_to_ir(written.xml.as_bytes()).unwrap().project;

        let rungs_of = |p: &IrProject, name: &str| -> Vec<String> {
            p.pous
                .iter()
                .find(|x| x.name == name)
                .and_then(|x| match &x.body {
                    PouBody::Ladder { rungs } => Some(
                        rungs
                            .iter()
                            .map(|r| neutral_text::rung_to_text(r).unwrap_or_default())
                            .collect(),
                    ),
                    _ => None,
                })
                .unwrap_or_default()
        };

        let before = rungs_of(&first, "MainRoutine");
        let after = rungs_of(&second, "MainRoutine");
        assert!(!before.is_empty(), "the fixture should have rungs");
        assert_eq!(after, before, "rung text changed across the round trip");
    }

    /// Comments are the part an export most often drops, and the part an
    /// engineer most notices.
    #[test]
    fn comments_and_descriptions_survive() {
        let first = l5x_ir::parse_to_ir(l5x_ir::tests_sample().as_bytes()).unwrap().project;
        let written = write(&first).unwrap();
        let second = l5x_ir::parse_to_ir(written.xml.as_bytes()).unwrap().project;

        let motor = second.tags.iter().find(|t| t.name == "Motor").unwrap();
        assert_eq!(motor.comment.as_deref(), Some("Motor contactor"));

        let main = second.pous.iter().find(|p| p.name == "MainRoutine").unwrap();
        let PouBody::Ladder { rungs } = &main.body else { panic!() };
        assert_eq!(rungs[0].comment.as_deref(), Some("Motor seal-in"));
    }

    /// The PID LADX never understood must come back out of the far side.
    #[test]
    fn an_instruction_ladx_never_understood_survives_the_whole_trip() {
        let first = l5x_ir::parse_to_ir(l5x_ir::tests_sample().as_bytes()).unwrap().project;
        let written = write(&first).unwrap();
        assert!(written.xml.contains("PID(Loop,PV,CV)"), "PID missing from the export");

        let second = l5x_ir::parse_to_ir(written.xml.as_bytes()).unwrap().project;
        let main = second.pous.iter().find(|p| p.name == "MainRoutine").unwrap();
        let PouBody::Ladder { rungs } = &main.body else { panic!() };
        let found = rungs.iter().any(|r| {
            r.logic
                .instructions()
                .into_iter()
                .chain(r.outputs.iter())
                .any(|i| i.vendor.as_ref().is_some_and(|v| v.original_mnemonic == "PID"))
        });
        assert!(found, "PID did not survive the round trip");
    }

    #[test]
    fn add_on_instructions_survive() {
        let first = l5x_ir::parse_to_ir(l5x_ir::tests_sample().as_bytes()).unwrap().project;
        let second = l5x_ir::parse_to_ir(write(&first).unwrap().xml.as_bytes()).unwrap().project;

        let aoi = second.pous.iter().find(|p| p.name == "MotorAOI").expect("AOI lost");
        assert_eq!(aoi.kind, PouKind::FunctionBlock);
        let params: Vec<&str> = aoi.local_tags.iter().map(|t| t.name.as_str()).collect();
        assert_eq!(params, vec!["Start", "Running", "Seal"]);
    }

    /// The output must be XML somebody else could read, not only us.
    #[test]
    fn the_output_is_well_formed() {
        let p = l5x_ir::parse_to_ir(l5x_ir::tests_sample().as_bytes()).unwrap().project;
        let xml = write(&p).unwrap().xml;
        assert!(xml.starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
        assert!(xml.contains("<RSLogix5000Content"));

        let mut r = quick_xml::Reader::from_str(&xml);
        let mut buf = Vec::new();
        let mut depth = 0i32;
        loop {
            match r.read_event_into(&mut buf) {
                Ok(quick_xml::events::Event::Start(_)) => depth += 1,
                Ok(quick_xml::events::Event::End(_)) => depth -= 1,
                Ok(quick_xml::events::Event::Eof) => break,
                Err(e) => panic!("our own XML does not parse: {e}"),
                _ => {}
            }
            buf.clear();
        }
        assert_eq!(depth, 0, "unbalanced elements");
    }
}
