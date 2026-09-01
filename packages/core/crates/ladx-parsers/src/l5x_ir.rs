//! L5X into LADX IR: the content, not just the names.
//!
//! The existing [`crate::l5x`] reader answers "what is in this project" with a
//! list of names, which is enough to show somebody a manifest and not nearly
//! enough to reason about a machine. This one reads the logic.
//!
//! Almost all of the hard part is already solved elsewhere. An L5X does not
//! store a rung as a drawing, it stores Rockwell neutral text, and
//! `ladx_ir::neutral_text` already parses that into a proper series/parallel
//! tree. So this module is mostly careful XML walking: find the routines,
//! find the rungs, hand the text over, and keep track of what was lost on the
//! way so the conversion report can say so.
//!
//! It is deliberately additive. `l5x::parse` is untouched and still backs
//! `pick_and_parse_project`, because that path works and is in front of people.

use ladx_ir::fidelity::{ConversionReport, Fidelity};
use ladx_ir::{DataType, DataTypeDef, IrProject, OpCode, Pou, PouBody, PouKind, Rung, Tag, Vendor};
use ladx_ir::neutral_text;
use quick_xml::events::Event;
use quick_xml::reader::Reader;

use crate::{ParseError, Result};

/// A project read out of an L5X, and an honest account of the reading.
pub struct L5xImport {
    pub project: IrProject,
    pub report: ConversionReport,
    /// The racks and the cards in them, where the export carries them. A
    /// controller-only export does not, and an empty list there means "not in
    /// this file", not "no hardware".
    pub hardware: ladx_ir::hardware::Hardware,
}

/// Where the walker currently is.
///
/// L5X nests tags inside two different scopes and routines inside programs, so
/// a flat scan cannot tell a controller tag from a program tag. Tracking the
/// path is what makes the difference visible.
#[derive(Default)]
struct Ctx {
    program: Option<String>,
    routine: Option<String>,
    routine_kind: Option<String>,
    /// Set while inside `<DataType>`, so members land on the right UDT.
    data_type: Option<DataTypeDef>,
    /// Module being assembled, and the port that gives away its slot.
    module: Option<ladx_ir::hardware::Module>,
    /// Rung being assembled.
    rung_number: Option<String>,
    rung_comment: Option<String>,
    rung_text: Option<String>,
    /// Which text node the next characters belong to.
    expect: Option<Expect>,
    /// Accumulated rungs for the current routine.
    rungs: Vec<Rung>,
    /// Accumulated ST lines for the current routine.
    st_lines: Vec<String>,
    /// Description for the tag currently open.
    tag_description: Option<String>,
    open_tag: Option<Tag>,
    /// The Add-On Instruction being read, if any.
    ///
    /// An AOI is a function block in everything but name: it has an interface,
    /// local tags and a body. The old name-only reader listed them, and
    /// dropping them here would be a regression in what LADX knows about a
    /// project, so they come across as POUs.
    aoi: Option<Pou>,
}

#[derive(Clone, Copy, PartialEq)]
enum Expect {
    RungText,
    RungComment,
    StLine,
    TagDescription,
}

/// Rockwell's atomic types, and everything else by name.
fn data_type_for(raw: &str) -> DataType {
    match raw.to_ascii_uppercase().as_str() {
        "BOOL" | "BIT" => DataType::Bool,
        "SINT" | "USINT" | "INT" | "UINT" => DataType::Int,
        "DINT" | "UDINT" | "LINT" | "ULINT" => DataType::Dint,
        "REAL" | "LREAL" => DataType::Real,
        "STRING" => DataType::String,
        "TIMER" => DataType::Timer,
        "COUNTER" => DataType::Counter,
        other => DataType::Named { name: other.to_string() },
    }
}

fn attr_map(e: &quick_xml::events::BytesStart) -> Result<Vec<(String, String)>> {
    let mut out = Vec::new();
    for a in e.attributes() {
        let a = a?;
        out.push((
            String::from_utf8_lossy(a.key.as_ref()).into_owned(),
            std::str::from_utf8(&a.value)?.to_string(),
        ));
    }
    Ok(out)
}

fn get<'a>(attrs: &'a [(String, String)], key: &str) -> Option<&'a str> {
    attrs.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
}

/// Read an L5X into the IR.
pub fn parse_to_ir(bytes: &[u8]) -> Result<L5xImport> {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut project = IrProject::new("Untitled");
    project.source_vendor = Some(Vendor::Rockwell);
    let mut report = ConversionReport::new();
    let mut ctx = Ctx::default();
    let mut hardware = ladx_ir::hardware::Hardware::default();
    let mut saw_root = false;
    let mut main_routine: Option<String> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Err(e) => return Err(ParseError::Xml(e)),
            Ok(Event::Eof) => break,

            // Start and Empty carry the same attributes, and an element like
            // `<Tag Name="X" DataType="BOOL"/>` arrives as Empty with no
            // closing event ever following it. Handling only Start silently
            // drops every self-closing element, which in an L5X is most of the
            // tags: they only grow a body when they carry a description.
            Ok(ev @ (Event::Start(_) | Event::Empty(_))) => {
                let closed_immediately = matches!(ev, Event::Empty(_));
                let e = match &ev {
                    Event::Start(e) | Event::Empty(e) => e,
                    _ => unreachable!(),
                };
                let name = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                let attrs = attr_map(e)?;

                match name.as_str() {
                    "RSLogix5000Content" => saw_root = true,

                    // The hardware configuration. Present in a full controller
                    // export, absent from a routine-only one, which is why the
                    // absence is reported rather than left to look like an
                    // empty rack.
                    "Module" => {
                        let Some(module_name) = get(&attrs, "Name") else { continue };
                        let catalog = get(&attrs, "CatalogNumber").map(str::to_string);
                        let revision = match (get(&attrs, "Major"), get(&attrs, "Minor")) {
                            (Some(major), Some(minor)) => Some(format!("{major}.{minor}")),
                            _ => None,
                        };
                        let module = ladx_ir::hardware::Module {
                            name: module_name.to_string(),
                            kind: catalog
                                .as_deref()
                                .map(ladx_ir::hardware::kind_for)
                                .unwrap_or(ladx_ir::hardware::ModuleKind::Other),
                            points: catalog.as_deref().and_then(ladx_ir::hardware::points_for),
                            catalog,
                            slot: None,
                            parent: get(&attrs, "ParentModule").map(str::to_string),
                            revision,
                            inhibited: get(&attrs, "Inhibited") == Some("true"),
                        };
                        if closed_immediately {
                            hardware.modules.push(module);
                        } else {
                            ctx.module = Some(module);
                        }
                    }

                    // The slot is not on the module. It is the address of the
                    // port that faces the chassis, and a module can have more
                    // than one port, so the upstream one is the one that says
                    // where the card physically sits.
                    "Port" => {
                        if let Some(m) = ctx.module.as_mut() {
                            let upstream = get(&attrs, "Upstream") == Some("true");
                            if upstream || m.slot.is_none() {
                                if let Some(slot) =
                                    get(&attrs, "Address").and_then(|a| a.parse().ok())
                                {
                                    if upstream || m.slot.is_none() {
                                        m.slot = Some(slot);
                                    }
                                }
                            }
                        }
                    }

                    "Controller" => {
                        if let Some(n) = get(&attrs, "Name") {
                            project.name = n.to_string();
                        }
                    }

                    "DataType" => {
                        if let Some(n) = get(&attrs, "Name") {
                            ctx.data_type =
                                Some(DataTypeDef { name: n.to_string(), members: Vec::new() });
                        }
                    }

                    "Member" => {
                        if let Some(dt) = ctx.data_type.as_mut() {
                            if let Some(n) = get(&attrs, "Name") {
                                // Rockwell pads UDTs with hidden filler members.
                                let hidden = get(&attrs, "Hidden") == Some("true");
                                if !hidden {
                                    dt.members.push(Tag {
                                        name: n.to_string(),
                                        data_type: data_type_for(
                                            get(&attrs, "DataType").unwrap_or("BOOL"),
                                        ),
                                        address: None,
                                        initial_value: None,
                                        comment: get(&attrs, "Description").map(str::to_string),
                                        field: None,
                                    });
                                }
                            }
                        }
                    }

                    "AddOnInstructionDefinition" => {
                        if let Some(n) = get(&attrs, "Name") {
                            ctx.aoi = Some(Pou {
                                name: n.to_string(),
                                kind: PouKind::FunctionBlock,
                                body: PouBody::Ladder { rungs: Vec::new() },
                                local_tags: Vec::new(),
                                comment: get(&attrs, "Description").map(str::to_string),
                                // An AOI is controller scope, not inside a program.
                                container: None,
                            });
                        }
                    }

                    // An AOI's interface and its locals both land in local_tags.
                    // Usage says which is which and is kept as the comment when
                    // there is nothing better, because "is this an input or an
                    // output of this block" is the first thing anybody asks.
                    "Parameter" | "LocalTag" => {
                        if let Some(aoi) = ctx.aoi.as_mut() {
                            if let Some(n) = get(&attrs, "Name") {
                                let usage = get(&attrs, "Usage").unwrap_or("Local");
                                aoi.local_tags.push(Tag {
                                    name: n.to_string(),
                                    data_type: data_type_for(
                                        get(&attrs, "DataType").unwrap_or("BOOL"),
                                    ),
                                    address: None,
                                    initial_value: None,
                                    comment: Some(
                                        get(&attrs, "Description")
                                            .map(str::to_string)
                                            .unwrap_or_else(|| format!("{usage} parameter")),
                                    ),
                                    field: None,
                                });
                            }
                        }
                    }

                    "Program" => {
                        ctx.program = get(&attrs, "Name").map(str::to_string);
                        if let Some(m) = get(&attrs, "MainRoutineName") {
                            main_routine = Some(m.to_string());
                        }
                    }

                    "Routine" => {
                        ctx.routine = get(&attrs, "Name").map(str::to_string);
                        ctx.routine_kind = get(&attrs, "Type").map(str::to_string);
                        ctx.rungs.clear();
                        ctx.st_lines.clear();
                    }

                    "Rung" => {
                        ctx.rung_number = get(&attrs, "Number").map(str::to_string);
                        ctx.rung_comment = None;
                        ctx.rung_text = None;
                    }

                    "Text" => ctx.expect = Some(Expect::RungText),
                    "Comment" => ctx.expect = Some(Expect::RungComment),
                    "Line" => ctx.expect = Some(Expect::StLine),
                    "Description" => {
                        if ctx.open_tag.is_some() {
                            ctx.expect = Some(Expect::TagDescription);
                        }
                    }

                    "Tag" => {
                        if let Some(n) = get(&attrs, "Name") {
                            ctx.tag_description = None;
                            // A tag with no declared type is a guess, and the
                            // guess is reported rather than made quietly. BOOL
                            // is the safest default and is still wrong for
                            // anything called Speed or Setpoint, so somebody
                            // needs to be told which tags were assumed.
                            if get(&attrs, "DataType").is_none() {
                                report.add(
                                    Fidelity::Approximate,
                                    format!("Tag {n}"),
                                    "The source declared no data type; read as BOOL. \
                                     Check this before relying on it.",
                                );
                            }
                            ctx.open_tag = Some(Tag {
                                name: n.to_string(),
                                data_type: data_type_for(get(&attrs, "DataType").unwrap_or("BOOL")),
                                // L5X keeps the physical alias here when there is one.
                                address: get(&attrs, "AliasFor").map(str::to_string),
                                initial_value: None,
                                comment: None,
                                field: None,
                            });
                        }
                    }

                    _ => {}
                }

                if closed_immediately {
                    close_element(&name, &mut ctx, &mut project, &mut report, &mut hardware);
                }
            }

            // Rung text and comments are almost always CDATA, because they
            // contain characters that would otherwise need escaping. Plain text
            // is handled too rather than assumed away: both appear in the wild,
            // and reading only one of them loses content silently.
            Ok(Event::Text(t)) if ctx.expect.is_some() => {
                stash(&mut ctx, String::from_utf8_lossy(t.as_ref()).into_owned());
            }
            Ok(Event::CData(c)) if ctx.expect.is_some() => {
                stash(&mut ctx, String::from_utf8_lossy(c.as_ref()).into_owned());
            }

            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                close_element(&name, &mut ctx, &mut project, &mut report, &mut hardware);
            }

            _ => {}
        }
        buf.clear();
    }

    if !saw_root {
        return Err(ParseError::Schema(
            "not an L5X: no RSLogix5000Content element".into(),
        ));
    }

    project.entry_point = main_routine;
    if hardware.modules.is_empty() {
        hardware.notes.push(
            "This export carries no module list. A routine or program export does not include \
             the hardware configuration; only a full controller export does. No address in the \
             program has been checked against a card."
                .into(),
        );
    }

    Ok(L5xImport { project, report, hardware })
}

/// Finish whatever element just ended.
///
/// Shared between a real closing tag and a self-closing one, because an L5X
/// writes most of its tags as `<Tag .../>` and only gives them a body when
/// they carry a description. Handling those in two places is how one of them
/// ends up forgetting to commit the tag.
fn close_element(
    name: &str,
    ctx: &mut Ctx,
    project: &mut IrProject,
    report: &mut ConversionReport,
    hardware: &mut ladx_ir::hardware::Hardware,
) {
    match name {
        "Module" => {
            if let Some(m) = ctx.module.take() {
                hardware.modules.push(m);
            }
        }

        "Text" | "Comment" | "Line" | "Description" => ctx.expect = None,

        "Rung" => finish_rung(ctx, report),

        "Routine" => finish_routine(ctx, project, report),

        "Tag" => {
            if let Some(mut t) = ctx.open_tag.take() {
                t.comment = ctx.tag_description.take();
                // Program tags are qualified so two programs with a tag of the
                // same name do not collide in a flat list.
                if let Some(p) = &ctx.program {
                    t.name = format!("{p}/{}", t.name);
                }
                project.tags.push(t);
            }
        }

        "DataType" => {
            if let Some(dt) = ctx.data_type.take() {
                project.data_types.push(dt);
            }
        }

        "AddOnInstructionDefinition" => {
            if let Some(mut aoi) = ctx.aoi.take() {
                aoi.body = PouBody::Ladder { rungs: std::mem::take(&mut ctx.rungs) };
                report.add(
                    Fidelity::Preserved,
                    format!("AOI {}", aoi.name),
                    "Carried across as a function block with its interface intact.",
                );
                project.pous.push(aoi);
            }
        }

        "Program" => ctx.program = None,

        _ => {}
    }
}

fn stash(ctx: &mut Ctx, raw: String) {
    match ctx.expect {
        Some(Expect::RungText) => {
            ctx.rung_text.get_or_insert_with(String::new).push_str(&raw);
        }
        Some(Expect::RungComment) => {
            ctx.rung_comment.get_or_insert_with(String::new).push_str(&raw);
        }
        Some(Expect::StLine) => ctx.st_lines.push(raw),
        Some(Expect::TagDescription) => {
            ctx.tag_description.get_or_insert_with(String::new).push_str(&raw);
        }
        None => {}
    }
}

fn finish_rung(ctx: &mut Ctx, report: &mut ConversionReport) {
    let Some(text) = ctx.rung_text.take() else { return };
    let number = ctx.rung_number.take().unwrap_or_else(|| "?".into());
    let where_ = format!(
        "{}/{} rung {number}",
        ctx.program.as_deref().unwrap_or("?"),
        ctx.routine.as_deref().unwrap_or("?")
    );

    match neutral_text::parse_rung(&text, format!("r{number}")) {
        Ok(mut rung) => {
            rung.comment = ctx.rung_comment.take();

            // A rung can parse perfectly and still contain an instruction the
            // IR does not model. That is not a parse failure and must not be
            // reported as success either.
            let unknown: Vec<String> = rung
                .logic
                .instructions()
                .into_iter()
                .chain(rung.outputs.iter())
                .filter(|i| i.op == OpCode::Unsupported)
                .filter_map(|i| i.vendor.as_ref().map(|v| v.original_mnemonic.clone()))
                .collect();

            if unknown.is_empty() {
                report.exact(where_);
            } else {
                report.add(
                    Fidelity::Unsupported,
                    where_,
                    format!(
                        "{} has no LADX equivalent; kept with its operands so nothing is lost.",
                        unknown.join(", ")
                    ),
                );
            }
            ctx.rungs.push(rung);
        }
        Err(e) => {
            // Refused rather than guessed. A rung LADX cannot read is carried
            // nowhere, and the report says exactly which one so somebody can
            // open it in Studio 5000 and look.
            report.add(
                Fidelity::ManualReview,
                where_,
                format!("Could not read the rung text ({e}). It was not imported: {text}"),
            );
        }
    }
    ctx.rung_comment = None;
}

fn finish_routine(ctx: &mut Ctx, project: &mut IrProject, report: &mut ConversionReport) {
    let Some(routine) = ctx.routine.take() else { return };
    // Reported with the program in front so a person can find it, while the
    // POU keeps its own name and records the program separately.
    let qualified = match &ctx.program {
        Some(p) => format!("{p}/{routine}"),
        None => routine.clone(),
    };
    let kind = ctx.routine_kind.take().unwrap_or_else(|| "RLL".into());

    let body = match kind.as_str() {
        "RLL" => PouBody::Ladder { rungs: std::mem::take(&mut ctx.rungs) },
        "ST" => {
            report.add(
                Fidelity::Exact,
                qualified.clone(),
                "Structured text carried through unchanged.",
            );
            PouBody::StructuredText { source: std::mem::take(&mut ctx.st_lines).join("\n") }
        }
        "FBD" => {
            report.add(
                Fidelity::ManualReview,
                qualified.clone(),
                "Function block diagram is carried as source and cannot be transformed yet.",
            );
            PouBody::FunctionBlockDiagram { source: String::new() }
        }
        "SFC" => {
            report.add(
                Fidelity::ManualReview,
                qualified.clone(),
                "Sequential function chart is carried as source and cannot be transformed yet.",
            );
            PouBody::SequentialFunctionChart { source: String::new() }
        }
        other => {
            report.add(
                Fidelity::ManualReview,
                qualified.clone(),
                format!("Routine type {other} is not one LADX reads."),
            );
            PouBody::InstructionList { source: String::new() }
        }
    };

    project.pous.push(Pou {
        name: routine,
        kind: PouKind::Program,
        body,
        local_tags: Vec::new(),
        comment: None,
        container: ctx.program.clone(),
    });
    ctx.rungs.clear();
    ctx.st_lines.clear();
}

/// The sample L5X, shared with the exporter's round-trip tests.
///
/// Exposed rather than duplicated: two copies of a fixture drift, and the
/// round trip is only meaningful if it runs over the same document the import
/// tests assert against.
#[cfg(test)]
pub fn tests_sample() -> &'static str {
    tests::SAMPLE
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A small but realistically shaped L5X: CDATA rung text, descriptions,
    /// controller and program scoped tags, a UDT with a hidden filler member,
    /// and two routine languages.
    pub(crate) const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="32.00">
  <Controller Name="LineFour" ProcessorType="1756-L83E">
    <DataTypes>
      <DataType Name="UDT_Motor">
        <Members>
          <Member Name="Run" DataType="BOOL" Description="Run command"/>
          <Member Name="ZZZZZZZZZZUDT_Motor0" DataType="SINT" Hidden="true"/>
          <Member Name="Speed" DataType="REAL"/>
        </Members>
      </DataType>
    </DataTypes>
    <Tags>
      <Tag Name="Motor" TagType="Base" DataType="BOOL">
        <Description><![CDATA[Motor contactor]]></Description>
      </Tag>
      <Tag Name="Start_PB" TagType="Alias" DataType="BOOL" AliasFor="Local:1:I.Data.0"/>
    </Tags>
    <Programs>
      <Program Name="MainProgram" MainRoutineName="MainRoutine">
        <Tags>
          <Tag Name="Scratch" DataType="DINT"/>
        </Tags>
        <Routines>
          <Routine Name="MainRoutine" Type="RLL">
            <RLLContent>
              <Rung Number="0" Type="N">
                <Comment><![CDATA[Motor seal-in]]></Comment>
                <Text><![CDATA[[XIC(Start_PB),XIC(Motor)]XIO(Stop_PB)OTE(Motor);]]></Text>
              </Rung>
              <Rung Number="1" Type="N">
                <Text><![CDATA[XIC(Motor)TON(Run_Timer,?,?);]]></Text>
              </Rung>
              <Rung Number="2" Type="N">
                <Text><![CDATA[XIC(Enable)PID(Loop,PV,CV);]]></Text>
              </Rung>
            </RLLContent>
          </Routine>
          <Routine Name="Calc" Type="ST">
            <STContent>
              <Line Number="0"><![CDATA[Scratch := Scratch + 1;]]></Line>
              <Line Number="1"><![CDATA[IF Scratch > 10 THEN Scratch := 0; END_IF;]]></Line>
            </STContent>
          </Routine>
        </Routines>
      </Program>
    </Programs>
    <AddOnInstructionDefinitions>
      <AddOnInstructionDefinition Name="MotorAOI" Description="Standard DOL motor">
        <Parameters>
          <Parameter Name="Start" TagType="Base" DataType="BOOL" Usage="Input"/>
          <Parameter Name="Running" TagType="Base" DataType="BOOL" Usage="Output"/>
        </Parameters>
        <LocalTags>
          <LocalTag Name="Seal" DataType="BOOL"/>
        </LocalTags>
      </AddOnInstructionDefinition>
    </AddOnInstructionDefinitions>
  </Controller>
</RSLogix5000Content>"#;

    fn parsed() -> L5xImport {
        parse_to_ir(SAMPLE.as_bytes()).expect("sample should parse")
    }

    #[test]
    fn it_reads_the_controller_and_its_entry_point() {
        let p = parsed().project;
        assert_eq!(p.name, "LineFour");
        assert_eq!(p.source_vendor, Some(Vendor::Rockwell));
        // Qualified, because two programs may each have a MainRoutine.
        assert_eq!(p.entry_point.as_deref(), Some("MainRoutine"));
    }

    /// The whole point of the module: rung logic, not rung names.
    #[test]
    fn it_reads_rung_logic_rather_than_just_counting_rungs() {
        let p = parsed().project;
        let main = p.pous.iter().find(|x| x.name == "MainRoutine").unwrap();
        // The program is recorded beside the name rather than folded into it,
        // so the POU keeps one identity across a write and a read.
        assert_eq!(main.container.as_deref(), Some("MainProgram"));
        let PouBody::Ladder { rungs } = &main.body else { panic!("expected ladder") };
        assert_eq!(rungs.len(), 3);

        // The seal-in survived as a real parallel branch, not a flat list.
        let seal = &rungs[0];
        assert_eq!(seal.comment.as_deref(), Some("Motor seal-in"));
        assert_eq!(seal.outputs.len(), 1);
        assert_eq!(seal.outputs[0].op, OpCode::Coil);

        let ops: Vec<OpCode> = seal.logic.instructions().iter().map(|i| i.op.clone()).collect();
        assert!(ops.contains(&OpCode::Contact));
        assert!(ops.contains(&OpCode::ContactNegated));
    }

    #[test]
    fn it_reads_both_tag_scopes_and_keeps_them_apart() {
        let p = parsed().project;
        let names: Vec<&str> = p.tags.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"Motor"), "controller tag");
        // Program tags are qualified so two programs cannot collide.
        assert!(names.contains(&"MainProgram/Scratch"), "program tag, got {names:?}");

        let motor = p.tags.iter().find(|t| t.name == "Motor").unwrap();
        assert_eq!(motor.comment.as_deref(), Some("Motor contactor"));

        let start = p.tags.iter().find(|t| t.name == "Start_PB").unwrap();
        assert_eq!(start.address.as_deref(), Some("Local:1:I.Data.0"));
    }

    /// Rockwell pads UDTs with hidden filler members. Importing them would put
    /// invented fields in front of an engineer.
    #[test]
    fn hidden_udt_padding_is_dropped() {
        let p = parsed().project;
        let udt = p.data_types.iter().find(|d| d.name == "UDT_Motor").unwrap();
        let members: Vec<&str> = udt.members.iter().map(|m| m.name.as_str()).collect();
        assert_eq!(members, vec!["Run", "Speed"], "hidden padding should not appear");
        assert_eq!(udt.members[1].data_type, DataType::Real);
    }

    #[test]
    fn structured_text_is_carried_through() {
        let p = parsed().project;
        let calc = p.pous.iter().find(|x| x.name == "Calc").unwrap();
        let PouBody::StructuredText { source } = &calc.body else { panic!("expected ST") };
        assert!(source.contains("Scratch := Scratch + 1;"));
        assert!(source.contains("END_IF;"));
    }

    /// An instruction LADX does not model must be reported, not silently
    /// accepted as a clean conversion.
    #[test]
    fn an_unmodelled_instruction_is_reported_and_kept() {
        let import = parsed();
        assert!(import.report.needs_human(), "PID should demand a look");

        let review = import.report.for_review();
        assert!(
            review.iter().any(|n| n.detail.contains("PID")),
            "the report should name PID: {:?}",
            review.iter().map(|n| &n.detail).collect::<Vec<_>>()
        );

        // And it is still in the project rather than dropped.
        let main = import
            .project
            .pous
            .iter()
            .find(|x| x.name == "MainRoutine")
            .unwrap();
        let PouBody::Ladder { rungs } = &main.body else { panic!() };
        // Searched across the whole rung rather than just the outputs, and the
        // reason is worth knowing: LADX cannot tell whether an instruction it
        // has never heard of drives the rung or gates it, so an unknown
        // mnemonic stays on the condition side. Guessing it is an output would
        // silently restructure somebody's logic, which is worse than leaving it
        // where it was found and reporting it.
        let pid = rungs[2]
            .logic
            .instructions()
            .into_iter()
            .chain(rungs[2].outputs.iter())
            .find(|i| i.op == OpCode::Unsupported)
            .expect("PID kept as unsupported");
        assert_eq!(pid.vendor.as_ref().unwrap().original_mnemonic, "PID");
        assert_eq!(pid.operands.len(), 3, "its operands are kept too");
    }

    #[test]
    fn clean_rungs_are_reported_exact() {
        let import = parsed();
        let counts = import.report.counts();
        assert!(counts.get(&Fidelity::Exact).copied().unwrap_or(0) >= 2, "{}", import.report.summary());
        assert_eq!(counts.get(&Fidelity::Unsupported).copied().unwrap_or(0), 1);
    }

    /// AOIs are function blocks in everything but name, and the old name-only
    /// reader already listed them. Dropping them here would have been a
    /// regression in what LADX knows about a project.
    #[test]
    fn add_on_instructions_come_across_with_their_interface() {
        let p = parsed().project;
        let aoi = p
            .pous
            .iter()
            .find(|x| x.name == "MotorAOI")
            .expect("the AOI should be imported");

        assert_eq!(aoi.kind, PouKind::FunctionBlock);
        assert_eq!(aoi.comment.as_deref(), Some("Standard DOL motor"));

        let names: Vec<&str> = aoi.local_tags.iter().map(|t| t.name.as_str()).collect();
        assert_eq!(names, vec!["Start", "Running", "Seal"]);

        // Direction is the first thing anybody asks about an AOI parameter.
        assert_eq!(aoi.local_tags[0].comment.as_deref(), Some("Input parameter"));
        assert_eq!(aoi.local_tags[1].comment.as_deref(), Some("Output parameter"));
        assert_eq!(aoi.local_tags[2].comment.as_deref(), Some("Local parameter"));
    }

    /// The IR reader must never know less about a project than the name
    /// reader it is meant to supersede.
    ///
    /// Both are kept for now, and the old one still backs the project picker,
    /// so the risk is not that the new one breaks. It is that it quietly sees
    /// fewer things, and somebody notices months later when a routine is
    /// missing from an analysis. Asserted on the same bytes, so the two cannot
    /// drift apart without this failing.
    #[test]
    fn it_never_sees_less_than_the_name_only_reader() {
        let names = crate::l5x::parse(SAMPLE.as_bytes(), "sample.L5X").unwrap();
        let ir = parsed().project;

        assert_eq!(
            ir.tags.len(),
            names.manifest.tags.len(),
            "tag counts diverged: IR {:?} vs names {:?}",
            ir.tags.iter().map(|t| &t.name).collect::<Vec<_>>(),
            names.manifest.tags.iter().map(|t| &t.name).collect::<Vec<_>>()
        );

        assert_eq!(ir.data_types.len(), names.manifest.udts.len(), "UDT counts diverged");

        // POUs are routines plus AOIs, since the IR has no separate idea of an
        // Add-On Instruction.
        let expected_pous = names.manifest.routines.len() + names.manifest.aois.len();
        assert_eq!(ir.pous.len(), expected_pous, "POU count should be routines + AOIs");

        for aoi in &names.manifest.aois {
            assert!(ir.pous.iter().any(|p| &p.name == aoi), "AOI {aoi} missing from the IR");
        }
    }

    /// A guessed data type must be visible in the report, because a tag called
    /// Speed read as BOOL is the kind of wrong that is only noticed later.
    #[test]
    fn a_tag_with_no_declared_type_is_reported_as_a_guess() {
        let xml = r#"<?xml version="1.0"?>
<RSLogix5000Content>
  <Controller Name="C">
    <Tags>
      <Tag Name="Conveyor_Speed"/>
      <Tag Name="Motor" DataType="BOOL"/>
    </Tags>
  </Controller>
</RSLogix5000Content>"#;
        let import = parse_to_ir(xml.as_bytes()).unwrap();
        let guesses: Vec<&str> = import
            .report
            .notes
            .iter()
            .filter(|n| n.fidelity == Fidelity::Approximate)
            .map(|n| n.subject.as_str())
            .collect();
        assert_eq!(guesses, vec!["Tag Conveyor_Speed"], "only the undeclared one is a guess");
    }

    #[test]
    fn something_that_is_not_an_l5x_is_refused() {
        let err = parse_to_ir(b"<Project><Nope/></Project>");
        assert!(err.is_err(), "a non-L5X document must not parse as one");
    }

    /// A rung LADX cannot read is refused rather than half-imported, and the
    /// report names it so somebody can go and look at it.
    #[test]
    fn an_unreadable_rung_is_refused_and_named() {
        let broken = SAMPLE.replace(
            "XIC(Motor)TON(Run_Timer,?,?);",
            "XIC(Motor]]]OTE(Nope);",
        );
        let import = parse_to_ir(broken.as_bytes()).unwrap();
        let review = import.report.for_review();
        assert!(
            review.iter().any(|n| n.fidelity == Fidelity::ManualReview && n.subject.contains("rung 1")),
            "the unreadable rung should be named: {review:?}"
        );
    }
}
