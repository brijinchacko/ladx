//! The machine's sequence, read out of the step register.
//!
//! A sequence is written as a number and a set of rungs that move it: step 0
//! waits for a start, step 10 clamps, step 20 drills. Reading that back means
//! opening every rung and holding the transitions in your head, which is what
//! somebody does on their first morning with an unfamiliar machine and again
//! every time they come back to it.
//!
//! So this reads them. A rung that moves a literal into a register, gated by a
//! comparison on that same register, is a transition from one step to another
//! and the rest of the conditions on it are what has to be true for the machine
//! to move.
//!
//! It only claims what the pattern actually shows. A sequence written some
//! other way, as a chain of latched bits, is not found, and that is reported
//! rather than being met with an empty list that reads like "no sequence here".

use crate::{Instruction, IrProject, Logic, OpCode, Operand, PouBody};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use ts_rs::TS;

/// One move from one step to another.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Transition {
    /// The step it moves from. None when the rung does not test the register,
    /// which is how a fault reset that jumps to idle from anywhere looks.
    pub from: Option<i64>,
    pub to: i64,
    /// What has to be true, other than being on the step it comes from.
    pub when: Vec<String>,
    pub pou: String,
    pub rung: String,
    pub comment: Option<String>,
}

/// A sequence, as a register and the moves between its steps.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Sequence {
    /// The register the step number lives in.
    pub register: String,
    pub steps: Vec<i64>,
    pub transitions: Vec<Transition>,
    /// Steps nothing moves into. Unreachable unless something outside this
    /// program sets the register.
    pub unreachable: Vec<i64>,
    /// Steps nothing moves out of. The machine stops there.
    pub terminal: Vec<i64>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Sequences {
    pub sequences: Vec<Sequence>,
    /// Said when nothing was found, so an empty list is not read as "no
    /// sequence here".
    pub notes: Vec<String>,
}

fn number(o: Option<&Operand>) -> Option<i64> {
    match o {
        Some(Operand::Number { value }) if value.fract() == 0.0 => Some(*value as i64),
        _ => None,
    }
}

fn tag(o: Option<&Operand>) -> Option<&str> {
    match o {
        Some(Operand::Tag { name }) => Some(name.as_str()),
        _ => None,
    }
}

/// Every instruction on the condition side, flattened.
fn conditions(logic: &Logic) -> Vec<&Instruction> {
    logic.instructions()
}

/// Read the sequences out of a project.
pub fn sequences(project: &IrProject) -> Sequences {
    // A register is a tag something moves a literal into. That is the shape,
    // and looking for it by name would find a tag called Step and miss one
    // called Phase.
    let mut moves: BTreeMap<String, Vec<(&str, &crate::Rung, i64)>> = BTreeMap::new();

    for pou in &project.pous {
        let PouBody::Ladder { rungs } = &pou.body else { continue };
        for rung in rungs {
            for out in &rung.outputs {
                if out.op != OpCode::Move {
                    continue;
                }
                let (Some(value), Some(dest)) =
                    (number(out.operands.first()), tag(out.operands.get(1)))
                else {
                    continue;
                };
                moves.entry(dest.to_string()).or_default().push((pou.name.as_str(), rung, value));
            }
        }
    }

    let mut out = Sequences::default();

    for (register, writes) in moves {
        // One move into a register is an initialisation, not a sequence.
        let distinct: BTreeSet<i64> = writes.iter().map(|(_, _, v)| *v).collect();
        if distinct.len() < 2 {
            continue;
        }

        let mut transitions = Vec::new();
        for (pou, rung, to) in &writes {
            let conds = conditions(&rung.logic);

            // The step it comes from: a comparison of this register against a
            // literal on the same rung.
            let from = conds.iter().find_map(|i| {
                (i.op == OpCode::Equal && tag(i.operands.first()) == Some(register.as_str()))
                    .then(|| number(i.operands.get(1)))
                    .flatten()
            });

            // Everything else that has to be true. The register test is left
            // out because it is the step, not a condition of leaving it.
            let when: Vec<String> = conds
                .iter()
                .filter(|i| tag(i.operands.first()) != Some(register.as_str()))
                .filter_map(|i| {
                    let name = tag(i.operands.first())?;
                    Some(match i.op {
                        OpCode::Contact => format!("{name} is on"),
                        OpCode::ContactNegated => format!("{name} is off"),
                        OpCode::RisingEdge => format!("{name} turns on"),
                        _ => name.to_string(),
                    })
                })
                .collect();

            transitions.push(Transition {
                from,
                to: *to,
                when,
                pou: (*pou).to_string(),
                rung: rung.id.clone(),
                comment: rung.comment.clone(),
            });
        }

        transitions.sort_by_key(|t| (t.from.unwrap_or(i64::MIN), t.to));

        let steps: Vec<i64> = distinct.iter().copied().collect();
        let entered: BTreeSet<i64> = transitions.iter().map(|t| t.to).collect();
        let left: BTreeSet<i64> = transitions.iter().filter_map(|t| t.from).collect();

        out.sequences.push(Sequence {
            register: register.clone(),
            unreachable: steps.iter().copied().filter(|s| !entered.contains(s)).collect(),
            terminal: steps.iter().copied().filter(|s| !left.contains(s)).collect(),
            steps,
            transitions,
        });
    }

    if out.sequences.is_empty() {
        out.notes.push(
            "No step register found. LADX looks for a tag that several rungs move different \
             numbers into, which is the usual way a sequence is written. A sequence built some \
             other way, as a chain of latched bits, is not something this recognises."
                .into(),
        );
    }

    let unread: Vec<&str> = project
        .pous
        .iter()
        .filter(|p| !matches!(p.body, PouBody::Ladder { .. }))
        .map(|p| p.name.as_str())
        .collect();
    if !unread.is_empty() {
        out.notes.push(format!(
            "{} is not ladder and was not read, so a sequence in it is not here.",
            unread.join(", ")
        ));
    }

    out
}

impl Sequence {
    /// What has to be true to leave a step. The question somebody asks when a
    /// machine has stopped moving.
    pub fn what_prevents(&self, step: i64) -> Vec<&Transition> {
        self.transitions.iter().filter(|t| t.from == Some(step)).collect()
    }

    /// The sequence as text, in the order it runs.
    pub fn to_text(&self) -> String {
        let mut s = format!("{} steps through {:?}\n", self.register, self.steps);
        for t in &self.transitions {
            let from = match t.from {
                Some(f) => f.to_string(),
                None => "anywhere".into(),
            };
            s.push_str(&format!("  {from} -> {}", t.to));
            if !t.when.is_empty() {
                s.push_str(&format!(" when {}", t.when.join(" and ")));
            }
            s.push_str(&format!("   [{}/{}]\n", t.pou, t.rung));
        }
        if !self.terminal.is_empty() {
            s.push_str(&format!("  nothing leaves {:?}\n", self.terminal));
        }
        if !self.unreachable.is_empty() {
            s.push_str(&format!("  nothing reaches {:?}\n", self.unreachable));
        }
        s
    }
}
