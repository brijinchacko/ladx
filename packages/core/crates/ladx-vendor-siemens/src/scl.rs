//! Ladder as SCL that S7 will accept.
//!
//! LADX already turns a rung into IEC structured text. That is not the same
//! thing as SCL, and the differences are not cosmetic:
//!
//!   A duration is a TIME. `PT := 3000` is a type error; it has to be `T#3s`.
//!
//!   A timer is a block instance with its own storage. In S7 that means an
//!   instance data block, and generated code that calls `TON` without one does
//!   not compile. The declaration is emitted alongside so the block is
//!   complete rather than nearly complete.
//!
//!   A one-shot has no operator. It is `R_TRIG`, again with an instance.
//!
//! Everything this cannot express is reported rather than approximated. The
//! rule the whole conversion story rests on is that a difference is stated, not
//! smoothed over, because a block that compiles and behaves differently is
//! worse than one that does not compile.

use crate::time::{from_operand_ms, time_literal};
use ladx_ir::fidelity::{ConversionReport, Fidelity};
use ladx_ir::{Instruction, Logic, OpCode, Operand, Pou, PouBody};
use std::collections::BTreeMap;

pub struct Scl {
    pub source: String,
    /// Instances the block needs: name to S7 type. A caller writing a real
    /// project turns these into the block's static declarations.
    pub instances: BTreeMap<String, String>,
    pub report: ConversionReport,
}

/// A member of a timer or counter instance, as S7 names it.
///
/// Rockwell and Siemens both give a timer sub-elements and neither uses the
/// other's names. `Jam_Timer.DN` is Rockwell for "the timer has finished"; the
/// S7 equivalent is `"Jam_Timer".Q`, and writing the Rockwell spelling produces
/// a block that does not compile.
///
/// The quoting matters as much as the name. S7 quotes the symbol, not the
/// whole path: `"Jam_Timer".Q`, never `"Jam_Timer.Q"`, which is a different
/// symbol that does not exist.
///
/// Returns None for a member with no S7 equivalent, so the caller reports it
/// rather than inventing one.
fn member_for_s7(member: &str) -> Option<&'static str> {
    match member.to_ascii_uppercase().as_str() {
        // Done. The one that appears on nearly every rung that reads a timer.
        "DN" => Some("Q"),
        // Accumulated time. S7 calls it elapsed.
        "ACC" => Some("ET"),
        // Preset.
        "PRE" => Some("PT"),
        // Enable and timer-timing have no S7 member: an IEC timer exposes only
        // Q and ET, and the rest are Rockwell's own.
        _ => None,
    }
}

fn operand(o: &Operand) -> String {
    match o {
        Operand::Tag { name } => match name.split_once('.') {
            Some((base, member)) => match member_for_s7(member) {
                Some(s7) => format!("\"{base}\".{s7}"),
                // Left as the source had it, quoted as one symbol so it is
                // obviously wrong to a reader rather than subtly wrong to a
                // compiler. The caller reports it.
                None => format!("\"{name}\""),
            },
            None => format!("\"{name}\""),
        },
        Operand::Text { value } => format!("'{value}'"),
        Operand::Number { value } => {
            if value.fract() == 0.0 {
                format!("{}", *value as i64)
            } else {
                format!("{value}")
            }
        }
    }
}

/// A tag as a bare identifier, for naming an instance after it.
fn ident(o: Option<&Operand>) -> String {
    match o {
        Some(Operand::Tag { name }) => name
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
            .collect(),
        _ => "unnamed".into(),
    }
}

/// Say so when a member reference has no S7 equivalent.
fn report_member(o: Option<&Operand>, report: &mut ConversionReport, where_: &str) {
    let Some(Operand::Tag { name }) = o else { return };
    let Some((base, member)) = name.split_once('.') else { return };
    if member_for_s7(member).is_none() {
        report.add(
            Fidelity::ManualReview,
            where_.to_string(),
            format!(
                "{name} reads .{member} on {base}. An IEC timer in S7 exposes only Q and ET, so \
                 this has no equivalent and was left as written. It will not compile until \
                 somebody decides what it should be."
            ),
        );
    }
}

fn condition(logic: &Logic, out: &mut String, report: &mut ConversionReport, where_: &str) {
    match logic {
        Logic::Element { instruction } => term(instruction, out, report, where_),
        Logic::Series { children } => {
            if children.is_empty() {
                out.push_str("TRUE");
                return;
            }
            for (i, c) in children.iter().enumerate() {
                if i > 0 {
                    out.push_str(" AND ");
                }
                let nested = matches!(c, Logic::Parallel { .. });
                if nested {
                    out.push('(');
                }
                condition(c, out, report, where_);
                if nested {
                    out.push(')');
                }
            }
        }
        Logic::Parallel { children } => {
            for (i, c) in children.iter().enumerate() {
                if i > 0 {
                    out.push_str(" OR ");
                }
                condition(c, out, report, where_);
            }
        }
    }
}

fn term(i: &Instruction, out: &mut String, report: &mut ConversionReport, where_: &str) {
    let first = i.operands.first();
    match i.op {
        OpCode::Contact => {
            report_member(first, report, where_);
            out.push_str(&operand(first.unwrap_or(&Operand::Text { value: "TRUE".into() })));
        }
        OpCode::ContactNegated => {
            report_member(first, report, where_);
            out.push_str("NOT ");
            out.push_str(&operand(first.unwrap_or(&Operand::Text { value: "FALSE".into() })));
        }
        OpCode::Equal | OpCode::NotEqual | OpCode::Greater | OpCode::Less
        | OpCode::GreaterOrEqual | OpCode::LessOrEqual => {
            let op = match i.op {
                OpCode::Equal => "=",
                OpCode::NotEqual => "<>",
                OpCode::Greater => ">",
                OpCode::Less => "<",
                OpCode::GreaterOrEqual => ">=",
                _ => "<=",
            };
            let a = i.operands.first().map(operand).unwrap_or_default();
            let b = i.operands.get(1).map(operand).unwrap_or_default();
            out.push_str(&format!("{a} {op} {b}"));
        }
        OpCode::RisingEdge => {
            // No operator in SCL; it needs an R_TRIG instance, and the caller
            // is told to declare it.
            out.push_str(&format!("\"R_TRIG_{}\".Q", ident(first)));
        }
        _ => {
            out.push_str("FALSE");
            report.add(
                Fidelity::ManualReview,
                where_,
                format!(
                    "{:?} cannot be written as an SCL condition and was replaced with FALSE so \
                     the block still compiles. The rung will not behave as it did.",
                    i.op
                ),
            );
        }
    }
}

/// One POU as SCL.
pub fn pou_to_scl(pou: &Pou) -> Scl {
    let mut source = String::new();
    let mut instances: BTreeMap<String, String> = BTreeMap::new();
    let mut report = ConversionReport::new();

    let PouBody::Ladder { rungs } = &pou.body else {
        report.add(
            Fidelity::ManualReview,
            pou.name.clone(),
            format!(
                "{} is {} and is carried as source rather than converted.",
                pou.name,
                pou.body.language_name()
            ),
        );
        return Scl { source, instances, report };
    };

    for rung in rungs {
        let where_ = format!("{} rung {}", pou.name, rung.id);
        if let Some(c) = &rung.comment {
            source.push_str(&format!("// {c}\n"));
        }

        // Edge instances are named after the tag so two one-shots on different
        // bits do not share storage, which would make each cancel the other.
        //
        // The call matters as much as the declaration. An R_TRIG instance that
        // is declared and read but never called compiles cleanly and holds Q
        // false for ever, so the one-shot silently never fires. That is the
        // worst kind of conversion fault: the block builds, downloads, and runs
        // the machine wrongly. So the call is written immediately above the
        // statement that reads it, which is also the only place it is correct:
        // an R_TRIG must be called once per scan, before its Q is used.
        for i in rung.logic.instructions() {
            if i.op == OpCode::RisingEdge {
                let tag = ident(i.operands.first());
                let name = format!("R_TRIG_{tag}");
                instances.insert(name.clone(), "R_TRIG".into());
                source.push_str(&format!("\"{name}\"(CLK := \"{tag}\");\n"));
                report.add(
                    Fidelity::Approximate,
                    where_.clone(),
                    "A one-shot has no SCL operator. It is an R_TRIG instance, declared with the \
                     block and called once per scan before its Q is read, and it holds state \
                     between scans.",
                );
            }
        }

        // A rung with nothing on its output side produces no SCL, and that is
        // how a converted file ends up quietly shorter than the project it came
        // from. It happens for real: an instruction LADX does not recognise
        // cannot be classified as an output, so it stays on the condition side,
        // and a rung whose only content is one of those has an empty output
        // list. The report says so either way, but a file that looks complete
        // and is not is the harder thing to catch.
        if rung.outputs.is_empty() {
            let carried: Vec<String> = rung
                .logic
                .instructions()
                .into_iter()
                .map(|i| {
                    let name = if i.op == OpCode::Unsupported {
                        i.vendor
                            .as_ref()
                            .map(|v| v.original_mnemonic.clone())
                            .unwrap_or_else(|| "unknown".into())
                    } else {
                        format!("{:?}", i.op)
                    };
                    let args: Vec<String> = i.operands.iter().map(operand).collect();
                    format!("{name}({})", args.join(", "))
                })
                .collect();

            if !carried.is_empty() {
                source.push_str(&format!("// not converted: {}\n", carried.join(" ")));
                report.add(
                    Fidelity::Unsupported,
                    where_.clone(),
                    format!(
                        "This rung drives nothing LADX could write, so it is carried as a comment \
                         rather than left out. What it contained: {}",
                        carried.join(" ")
                    ),
                );
            }
            source.push('\n');
            continue;
        }

        // Evaluated here rather than earlier, so a rung that is never written
        // does not also report what its condition "was replaced with". Nothing
        // is written for it, so nothing was replaced.
        let mut cond = String::new();
        condition(&rung.logic, &mut cond, &mut report, &where_);

        for output in &rung.outputs {
            let first = output.operands.first();
            match &output.op {
                OpCode::Coil => {
                    source.push_str(&format!("{} := {cond};\n", operand(first.unwrap())));
                    report.exact(where_.clone());
                }
                OpCode::CoilNegated => {
                    source.push_str(&format!("{} := NOT ({cond});\n", operand(first.unwrap())));
                    report.exact(where_.clone());
                }
                OpCode::SetCoil => {
                    source.push_str(&format!(
                        "IF {cond} THEN\n  {} := TRUE;\nEND_IF;\n",
                        operand(first.unwrap())
                    ));
                    report.exact(where_.clone());
                }
                OpCode::ResetCoil => {
                    source.push_str(&format!(
                        "IF {cond} THEN\n  {} := FALSE;\nEND_IF;\n",
                        operand(first.unwrap())
                    ));
                    report.exact(where_.clone());
                }
                OpCode::TimerOn | OpCode::TimerOff => {
                    let block = if output.op == OpCode::TimerOn { "TON_TIME" } else { "TOF_TIME" };
                    let name = ident(first);
                    instances.insert(name.clone(), block.into());

                    let (ms, lost) = match output.operands.get(1) {
                        Some(Operand::Number { value }) => from_operand_ms(*value),
                        _ => (0, false),
                    };
                    if lost {
                        report.add(
                            Fidelity::Approximate,
                            where_.clone(),
                            "The preset was not a whole number of milliseconds. S7 TIME cannot \
                             hold anything finer, so it was rounded.",

                        );
                    }
                    source.push_str(&format!(
                        "\"{name}\"(IN := {cond}, PT := {});\n",
                        time_literal(ms)
                    ));
                    report.add(
                        Fidelity::Approximate,
                        where_.clone(),
                        format!(
                            "The timer is an instance of {block} and needs its own storage. \
                             Declared with the block; it is not interchangeable with a Rockwell \
                             timer, whose done bit and accumulator are addressed differently."
                        ),
                    );
                }
                OpCode::Move => {
                    let src = operand(first.unwrap());
                    let dst = output.operands.get(1).map(operand).unwrap_or_default();
                    source.push_str(&format!("IF {cond} THEN\n  {dst} := {src};\nEND_IF;\n"));
                    report.exact(where_.clone());
                }
                OpCode::Call => {
                    source.push_str(&format!(
                        "IF {cond} THEN\n  \"{}\"();\nEND_IF;\n",
                        ident(first)
                    ));
                    report.add(
                        Fidelity::ManualReview,
                        where_.clone(),
                        "A call needs the target block to exist in the same project, and S7 \
                         calls an FC and an FB differently. Check which this is.",

                    );
                }
                OpCode::Unsupported => {
                    let name = output
                        .vendor
                        .as_ref()
                        .map(|v| v.original_mnemonic.clone())
                        .unwrap_or_else(|| "an unrecognised instruction".into());
                    // The operands go in the comment too. Without them the
                    // comment says an unknown instruction was here and not
                    // what it worked on, which is the part somebody rewriting
                    // it by hand actually needs.
                    let args: Vec<String> = output.operands.iter().map(operand).collect();
                    source.push_str(&format!("// {name}({}) under: {cond}\n", args.join(", ")));
                    report.add(
                        Fidelity::Unsupported,
                        where_.clone(),
                        format!(
                            "{name} has no S7 equivalent LADX knows of. It is written as a \
                             comment, with its operands and its conditions, so nothing is lost \
                             and nothing is invented. It does nothing until somebody writes it."
                        ),
                    );
                }
                other => {
                    report.add(
                        Fidelity::ManualReview,
                        where_.clone(),
                        format!("{other:?} was not written; LADX has no S7 form for it."),
                    );
                }
            }
        }
        source.push('\n');
    }

    Scl { source, instances, report }
}

/// The static declarations the generated code needs.
pub fn declarations(instances: &BTreeMap<String, String>) -> String {
    if instances.is_empty() {
        return String::new();
    }
    let mut s = String::from("VAR\n");
    for (name, ty) in instances {
        s.push_str(&format!("  {name} : {ty};\n"));
    }
    s.push_str("END_VAR\n");
    s
}
