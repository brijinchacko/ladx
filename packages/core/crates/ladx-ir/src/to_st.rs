//! Ladder to Structured Text.
//!
//! The direction that is mostly mechanical: a rung's condition side is a
//! boolean expression, and its outputs are assignments guarded by it. Where it
//! stops being mechanical, this module says so in the report rather than
//! guessing, because a conversion that quietly invents behaviour is worse than
//! one that refuses.
//!
//! Three things are genuinely not one-to-one, and each produces a note:
//!
//! - **Timers and counters** are function blocks in ST, with instance data. A
//!   `TON` rung becomes a call plus a `.Q` read, and the instance has to be
//!   declared somewhere this module cannot see.
//! - **One-shots** need a remembered previous state. There is no expression for
//!   "was false last scan"; it needs a variable.
//! - **Anything unsupported** is emitted as a comment holding the original, so
//!   the output still compiles and the reader can see exactly what was lost.

use crate::{Instruction, Logic, OpCode, Operand, Pou, PouBody, Rung};

/// What happened to one element during a conversion.
#[derive(Debug, Clone, PartialEq)]
pub struct Note {
    /// Which rung it came from.
    pub rung_id: String,
    pub severity: Severity,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    /// Converted, but the reader should know something about it.
    Info,
    /// Converted with a difference in meaning that may matter.
    Semantic,
    /// Could not be converted; a human has to decide.
    NeedsDecision,
}

#[derive(Debug, Clone, Default)]
pub struct Conversion {
    pub source: String,
    pub notes: Vec<Note>,
}

impl Conversion {
    pub fn clean(&self) -> bool {
        self.notes.iter().all(|n| n.severity == Severity::Info)
    }

    pub fn needing_decision(&self) -> usize {
        self.notes
            .iter()
            .filter(|n| n.severity == Severity::NeedsDecision)
            .count()
    }
}

/// Convert a whole POU's ladder into a Structured Text body.
pub fn pou_to_st(pou: &Pou) -> Conversion {
    let PouBody::Ladder { rungs } = &pou.body else {
        return Conversion {
            source: match &pou.body {
                PouBody::StructuredText { source } => source.clone(),
                other => format!("(* {} body not convertible to ST *)", other.language_name()),
            },
            notes: Vec::new(),
        };
    };

    let mut out = String::new();
    let mut notes = Vec::new();

    for rung in rungs {
        let mut conv = rung_to_st(rung);
        if let Some(comment) = &rung.comment {
            for line in comment.lines() {
                out.push_str(&format!("(* {} *)\n", line.trim()));
            }
        }
        out.push_str(&conv.source);
        out.push('\n');
        notes.append(&mut conv.notes);
    }

    Conversion { source: out, notes }
}

/// Convert one rung.
pub fn rung_to_st(rung: &Rung) -> Conversion {
    let mut notes = Vec::new();
    let condition = expression(&rung.logic, &rung.id, &mut notes);

    let mut body = String::new();
    for output in &rung.outputs {
        body.push_str(&output_statement(output, &condition, &rung.id, &mut notes));
    }

    if body.is_empty() {
        // A rung with conditions and no output does nothing in ST. Dropping it
        // would lose a line the engineer wrote on purpose, and worse, it would
        // lose whatever the condition contained: an unrecognised AOI sits on
        // the condition side, so the earlier version of this branch silently
        // deleted exactly the thing the conversion report exists to surface.
        // The condition goes into the comment so nothing disappears.
        notes.push(Note {
            rung_id: rung.id.clone(),
            severity: Severity::NeedsDecision,
            message: format!(
                "rung has no output; its condition ({condition}) is preserved as a comment \
                 and does nothing until somebody gives it one"
            ),
        });
        return Conversion {
            source: format!("(* {}: {} -> no output *)\n", rung.id, condition),
            notes,
        };
    }

    Conversion { source: body, notes }
}

/// The condition side as a boolean expression.
fn expression(logic: &Logic, rung_id: &str, notes: &mut Vec<Note>) -> String {
    match logic {
        Logic::Element { instruction } => term(instruction, rung_id, notes),

        Logic::Series { children } => {
            if children.is_empty() {
                // An empty rung conducts, so its condition is TRUE.
                return "TRUE".into();
            }
            join(children, " AND ", rung_id, notes)
        }

        Logic::Parallel { children } => {
            if children.is_empty() {
                // A parallel with no legs conducts nothing.
                return "FALSE".into();
            }
            let inner = join(children, " OR ", rung_id, notes);
            // Parenthesised because OR binds looser than AND, and a seal-in
            // dropped into a series without brackets silently changes the
            // circuit.
            format!("({inner})")
        }
    }
}

fn join(children: &[Logic], sep: &str, rung_id: &str, notes: &mut Vec<Note>) -> String {
    children
        .iter()
        .map(|c| expression(c, rung_id, notes))
        .collect::<Vec<_>>()
        .join(sep)
}

/// One condition-side instruction as an expression.
fn term(instruction: &Instruction, rung_id: &str, notes: &mut Vec<Note>) -> String {
    let first = operand_name(instruction.operands.first());

    match instruction.op {
        OpCode::Contact => first,
        OpCode::ContactNegated => format!("NOT {first}"),

        OpCode::RisingEdge | OpCode::FallingEdge => {
            // No expression means "was false last scan". It needs an R_TRIG or
            // an explicit previous-state variable, and either way a declaration
            // this module cannot make.
            notes.push(Note {
                rung_id: rung_id.into(),
                severity: Severity::NeedsDecision,
                message: format!(
                    "one-shot on {first} needs an edge-detect block and its own instance variable; \
                     emitted as a call that must be declared"
                ),
            });
            let kind = if instruction.op == OpCode::RisingEdge { "R_TRIG" } else { "F_TRIG" };
            format!("{kind}_{}.Q", sanitise(&first))
        }

        OpCode::Equal => binary(instruction, "="),
        OpCode::NotEqual => binary(instruction, "<>"),
        OpCode::Greater => binary(instruction, ">"),
        OpCode::Less => binary(instruction, "<"),
        OpCode::GreaterOrEqual => binary(instruction, ">="),
        OpCode::LessOrEqual => binary(instruction, "<="),

        OpCode::Unsupported => {
            let name = instruction
                .vendor
                .as_ref()
                .map(|v| v.original_mnemonic.clone())
                .unwrap_or_else(|| "unknown".into());
            notes.push(Note {
                rung_id: rung_id.into(),
                severity: Severity::NeedsDecision,
                message: format!("{name} has no Structured Text equivalent; left as TRUE with a comment"),
            });
            format!("TRUE (* {name} was here *)")
        }

        // An output instruction appearing on the condition side is unusual but
        // legal in some dialects; treat it as its own tag rather than crashing.
        _ => {
            notes.push(Note {
                rung_id: rung_id.into(),
                severity: Severity::Semantic,
                message: format!(
                    "{:?} appeared on the condition side; read as a plain reference",
                    instruction.op
                ),
            });
            first
        }
    }
}

fn binary(instruction: &Instruction, op: &str) -> String {
    let a = operand_name(instruction.operands.first());
    let b = operand_name(instruction.operands.get(1));
    format!("{a} {op} {b}")
}

/// One output instruction as a statement.
fn output_statement(
    instruction: &Instruction,
    condition: &str,
    rung_id: &str,
    notes: &mut Vec<Note>,
) -> String {
    let first = operand_name(instruction.operands.first());

    match instruction.op {
        OpCode::Coil => format!("{first} := {condition};\n"),
        OpCode::CoilNegated => format!("{first} := NOT ({condition});\n"),

        // Set and reset are conditional, not assignments: a latch that is not
        // energised must leave the bit alone rather than clear it.
        OpCode::SetCoil => format!("IF {condition} THEN\n  {first} := TRUE;\nEND_IF;\n"),
        OpCode::ResetCoil => format!("IF {condition} THEN\n  {first} := FALSE;\nEND_IF;\n"),

        OpCode::TimerOn | OpCode::TimerOff | OpCode::TimerRetentive => {
            let block = match instruction.op {
                OpCode::TimerOn => "TON",
                OpCode::TimerOff => "TOF",
                _ => "TP",
            };
            let preset = instruction
                .operands
                .get(1)
                .map(operand_literal)
                .unwrap_or_else(|| "T#0ms".into());

            if instruction.op == OpCode::TimerRetentive {
                notes.push(Note {
                    rung_id: rung_id.into(),
                    severity: Severity::Semantic,
                    message: format!(
                        "{first} is retentive (RTO): IEC has no direct equivalent, so the \
                         accumulator will reset where the original kept it. Check every reset path."
                    ),
                });
            } else {
                notes.push(Note {
                    rung_id: rung_id.into(),
                    severity: Severity::Info,
                    message: format!("{first} becomes a {block} instance and must be declared"),
                });
            }

            format!("{first}(IN := {condition}, PT := {preset});\n")
        }

        OpCode::CountUp | OpCode::CountDown => {
            let block = if instruction.op == OpCode::CountUp { "CTU" } else { "CTD" };
            let preset = instruction
                .operands
                .get(1)
                .map(operand_literal)
                .unwrap_or_else(|| "0".into());
            notes.push(Note {
                rung_id: rung_id.into(),
                severity: Severity::Info,
                message: format!("{first} becomes a {block} instance and must be declared"),
            });
            format!("{first}(CU := {condition}, PV := {preset});\n")
        }

        OpCode::Reset => {
            notes.push(Note {
                rung_id: rung_id.into(),
                severity: Severity::Semantic,
                message: format!(
                    "RES on {first} resets a timer or counter instance; in IEC that is the \
                     block's own reset input, so this line may need moving into the call"
                ),
            });
            format!("IF {condition} THEN\n  {first}.RESET := TRUE;\nEND_IF;\n")
        }

        OpCode::Move => {
            let dest = operand_name(instruction.operands.get(1));
            format!("IF {condition} THEN\n  {dest} := {first};\nEND_IF;\n")
        }

        OpCode::Add | OpCode::Subtract | OpCode::Multiply | OpCode::Divide => {
            let a = operand_name(instruction.operands.first());
            let b = operand_name(instruction.operands.get(1));
            let dest = operand_name(instruction.operands.get(2));
            let op = match instruction.op {
                OpCode::Add => "+",
                OpCode::Subtract => "-",
                OpCode::Multiply => "*",
                _ => "/",
            };
            format!("IF {condition} THEN\n  {dest} := {a} {op} {b};\nEND_IF;\n")
        }

        OpCode::Call => format!("IF {condition} THEN\n  {first}();\nEND_IF;\n"),

        OpCode::Jump | OpCode::Label | OpCode::Return => {
            notes.push(Note {
                rung_id: rung_id.into(),
                severity: Severity::NeedsDecision,
                message: format!(
                    "{:?} is control flow that does not translate directly; \
                     the surrounding structure needs restructuring by hand",
                    instruction.op
                ),
            });
            format!("(* {:?} {first} needs restructuring *)\n", instruction.op)
        }

        OpCode::Unsupported => {
            let name = instruction
                .vendor
                .as_ref()
                .map(|v| v.original_mnemonic.clone())
                .unwrap_or_else(|| "unknown".into());
            let args = instruction
                .operands
                .iter()
                .map(operand_literal)
                .collect::<Vec<_>>()
                .join(", ");
            notes.push(Note {
                rung_id: rung_id.into(),
                severity: Severity::NeedsDecision,
                message: format!("{name} has no Structured Text equivalent; preserved as a comment"),
            });
            format!("(* {name}({args}) under: {condition} *)\n")
        }

        // Condition-side instructions do not belong here.
        _ => {
            notes.push(Note {
                rung_id: rung_id.into(),
                severity: Severity::Semantic,
                message: format!("{:?} found on the output side", instruction.op),
            });
            format!("(* {:?} {first} *)\n", instruction.op)
        }
    }
}

fn operand_name(operand: Option<&Operand>) -> String {
    match operand {
        Some(Operand::Tag { name }) => name.clone(),
        Some(Operand::Number { value }) => format_number(*value),
        Some(Operand::Text { value }) => format!("'{value}'"),
        None => "(* missing operand *)".into(),
    }
}

fn operand_literal(operand: &Operand) -> String {
    operand_name(Some(operand))
}

fn format_number(value: f64) -> String {
    if value.fract() == 0.0 && value.abs() < 1e15 {
        format!("{}", value as i64)
    } else {
        format!("{value}")
    }
}

/// Make a tag name usable as part of an identifier.
fn sanitise(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::neutral_text::parse_rung;

    fn st(text: &str) -> Conversion {
        rung_to_st(&parse_rung(text, "r1").unwrap())
    }

    #[test]
    fn simple_rung() {
        let c = st("XIC(Start)XIO(Stop)OTE(Motor);");
        assert_eq!(c.source.trim(), "Motor := Start AND NOT Stop;");
        assert!(c.clean());
    }

    #[test]
    fn seal_in_keeps_its_brackets() {
        // Without the parentheses this becomes Start OR (Motor AND NOT Stop),
        // which latches on and never releases. The brackets are the circuit.
        let c = st("[XIC(Start),XIC(Motor)]XIO(Stop)OTE(Motor);");
        assert_eq!(c.source.trim(), "Motor := (Start OR Motor) AND NOT Stop;");
        assert!(c.clean());
    }

    #[test]
    fn latch_is_conditional_not_an_assignment() {
        // OTL must leave the bit alone when the rung is false.
        let c = st("XIC(Start)OTL(Motor);");
        assert!(c.source.contains("IF Start THEN"));
        assert!(c.source.contains("Motor := TRUE;"));
        assert!(!c.source.contains("Motor := Start"));
    }

    #[test]
    fn two_coils_both_get_the_condition() {
        let c = st("XIC(A)[OTE(B),OTE(C)];");
        assert!(c.source.contains("B := A;"));
        assert!(c.source.contains("C := A;"));
    }

    #[test]
    fn timer_becomes_a_call_and_says_so() {
        let c = st("XIC(Run)TON(T1,1000);");
        assert!(c.source.contains("T1(IN := Run, PT := 1000);"));
        assert!(
            c.notes.iter().any(|n| n.message.contains("must be declared")),
            "the instance declaration is the reader's job and must be flagged"
        );
    }

    #[test]
    fn retentive_timer_is_a_semantic_difference() {
        let c = st("XIC(Run)RTO(T1,1000);");
        let note = c.notes.iter().find(|n| n.severity == Severity::Semantic);
        assert!(note.is_some(), "RTO has no IEC equivalent and must be flagged");
        assert!(note.unwrap().message.contains("accumulator"));
    }

    #[test]
    fn one_shot_needs_a_decision() {
        let c = st("XIC(A)ONS(os1)OTE(B);");
        assert_eq!(c.needing_decision(), 1);
    }

    #[test]
    fn unknown_instruction_is_preserved_not_dropped() {
        // MyAOI is not an output, so it stays on the condition side and this
        // rung ends up driving nothing. Both facts are real and both are
        // reported: the unrecognised instruction, and the rung with no output.
        let c = st("XIC(A)MyAOI(x,y);");
        assert!(c.source.contains("MyAOI"), "the original must survive");
        assert_eq!(c.needing_decision(), 2);
        assert!(c.notes.iter().any(|n| n.message.contains("MyAOI")));
        assert!(c.notes.iter().any(|n| n.message.contains("no output")));
    }

    #[test]
    fn a_rung_with_no_output_keeps_its_condition() {
        // The regression this guards: the no-output branch used to emit a bare
        // placeholder, throwing away the condition and with it any unrecognised
        // instruction the report existed to surface.
        let c = st("XIC(Interlock)XIC(Ready);");
        assert!(c.source.contains("Interlock AND Ready"), "got: {}", c.source);
    }

    #[test]
    fn comparison_reads_as_a_comparison() {
        let c = st("GRT(Level,80)OTE(HighAlarm);");
        assert_eq!(c.source.trim(), "HighAlarm := Level > 80;");
    }

    #[test]
    fn move_only_happens_when_the_rung_is_true() {
        let c = st("XIC(Load)MOV(Setpoint,Target);");
        assert!(c.source.contains("IF Load THEN"));
        assert!(c.source.contains("Target := Setpoint;"));
    }

    #[test]
    fn empty_rung_is_true() {
        let c = st("OTE(Always);");
        assert_eq!(c.source.trim(), "Always := TRUE;");
    }

    #[test]
    fn nested_parallel_nests_its_parentheses() {
        let c = st("XIC(A)[XIC(B),[XIC(C),XIC(D)]]OTE(E);");
        // C OR D must stay grouped inside B OR (...), or the logic changes.
        assert!(c.source.contains("(B OR (C OR D))"), "got: {}", c.source);
    }
}
