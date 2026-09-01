//! "Why won't conveyor 2 start?"
//!
//! The question an engineer actually asks, and the one a chat window answers
//! badly. Asked of a model with the project pasted in, the answer is a
//! plausible-sounding paragraph assembled from whatever fitted in the window.
//! Asked here, it is the rungs that drive the output and the conditions on
//! them, taken from the program.
//!
//! What this deliberately does not do is tell somebody why the machine is
//! stopped. That depends on live values, and nothing here has any. It says
//! what *would* have to be true, which is the part that can be answered from
//! the program alone and is most of what somebody needs: the list of things to
//! go and look at, in the order the logic depends on them.
//!
//! Seal-ins make this a graph rather than a tree. A motor's own contact is in
//! its start condition, so following conditions backwards without care walks in
//! a circle forever. Revisiting is stopped and recorded rather than hidden,
//! because "it holds itself in" is a fact worth telling somebody.

use crate::graph::ProjectGraph;
use crate::{Instruction, IrProject, Logic, OpCode, Operand, PouBody};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use ts_rs::TS;

/// How a condition is examined.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub enum Sense {
    /// Must be on. A normally-open contact.
    MustBeOn,
    /// Must be off. A normally-closed contact.
    MustBeOff,
    /// A comparison or something else that is not a simple bit test.
    Other,
}

/// One thing that has to be true.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Condition {
    pub tag: String,
    pub sense: Sense,
    /// The instruction, as the neutral opcode or a vendor mnemonic.
    pub via: String,
    /// Whether it is one of several alternatives rather than a requirement.
    ///
    /// A start button in parallel with a seal-in contact is not something that
    /// has to be true; either will do. Presenting both as requirements is how a
    /// trace tells somebody a running motor cannot start.
    pub one_of_several: bool,
    /// Whether something in this program drives it, so the trail continues.
    pub driven_in_program: bool,
}

/// One rung that drives the thing being asked about.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Step {
    pub tag: String,
    pub pou: String,
    pub rung: String,
    pub comment: Option<String>,
    /// The instruction driving it: a coil, a set, a move.
    pub via: String,
    pub conditions: Vec<Condition>,
    /// How far back from the original question this is.
    pub depth: u32,
    /// Set when this tag was already explained further up the trail. A motor
    /// holding itself in through its own contact lands here, and it is a fact
    /// worth saying rather than a loop to hide.
    pub already_seen: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Trace {
    pub tag: String,
    pub steps: Vec<Step>,
    /// Said when nothing in the program drives the tag at all.
    pub note: Option<String>,
}

/// How deep to follow the trail.
///
/// Not a performance limit. Past a handful of steps a trace stops being an
/// answer and becomes a second program to read, and the useful part, the
/// permissives immediately behind the output, is at the top.
const MAX_DEPTH: u32 = 4;

fn sense_of(op: &OpCode) -> Sense {
    match op {
        OpCode::Contact | OpCode::RisingEdge => Sense::MustBeOn,
        OpCode::ContactNegated | OpCode::FallingEdge => Sense::MustBeOff,
        _ => Sense::Other,
    }
}

fn mnemonic(i: &Instruction) -> String {
    if i.op == OpCode::Unsupported {
        i.vendor.as_ref().map(|v| v.original_mnemonic.clone()).unwrap_or_else(|| "unknown".into())
    } else {
        format!("{:?}", i.op)
    }
}

fn base(name: &str) -> &str {
    name.split(['.', '[']).next().unwrap_or(name)
}

/// Flatten a condition tree into the things that have to be true.
///
/// `in_parallel` carries down: anything inside a parallel branch is one of
/// several ways for power to reach the output, not a requirement.
fn conditions_of(logic: &Logic, in_parallel: bool, out: &mut Vec<Condition>) {
    match logic {
        Logic::Element { instruction } => {
            let Some(Operand::Tag { name }) = instruction.operands.first() else { return };
            if name.trim().is_empty() {
                return;
            }
            out.push(Condition {
                tag: base(name).to_string(),
                sense: sense_of(&instruction.op),
                via: mnemonic(instruction),
                one_of_several: in_parallel,
                driven_in_program: false,
            });
        }
        Logic::Series { children } => {
            for c in children {
                conditions_of(c, in_parallel, out);
            }
        }
        Logic::Parallel { children } => {
            for c in children {
                conditions_of(c, true, out);
            }
        }
    }
}

/// Work backwards from a tag to what would have to be true for it to come on.
pub fn why(project: &IrProject, tag: &str) -> Trace {
    let g = ProjectGraph::build(project);
    let mut trace = Trace { tag: tag.to_string(), ..Default::default() };

    if g.uses_of(tag).is_empty() {
        trace.note = Some(format!(
            "Nothing in this program mentions {tag}. Check the spelling, or it may live in a \
             routine LADX did not read."
        ));
        return trace;
    }

    let mut seen: BTreeSet<String> = BTreeSet::new();
    // Cycles already reported, so a seal-in is stated once rather than once
    // per rung that mentions it.
    let mut noted_cycle: BTreeSet<String> = BTreeSet::new();
    let mut queue: Vec<(String, u32)> = vec![(tag.to_string(), 0)];

    while let Some((current, depth)) = queue.pop() {
        if depth > MAX_DEPTH {
            continue;
        }
        let first_time = seen.insert(current.clone());

        let writers = g.writers_of(&current);
        if writers.is_empty() {
            if depth == 0 {
                trace.note = Some(format!(
                    "Nothing in this program drives {current}. It is an input, or it comes from \
                     somewhere LADX cannot read."
                ));
            }
            continue;
        }
        if !first_time {
            // Already explained further up. Recorded once and not followed,
            // which is what stops a seal-in going round in circles: this branch
            // never expands, so reaching it always terminates.
            if noted_cycle.insert(current.clone()) {
                for w in writers {
                    trace.steps.push(Step {
                        tag: current.clone(),
                        pou: w.pou.clone(),
                        rung: w.rung.clone(),
                        comment: None,
                        via: w.via.clone(),
                        conditions: Vec::new(),
                        depth,
                        already_seen: true,
                    });
                }
            }
            continue;
        }

        for pou in &project.pous {
            let PouBody::Ladder { rungs } = &pou.body else { continue };
            for rung in rungs {
                let drives = rung.outputs.iter().find(|o| {
                    matches!(o.operands.first(), Some(Operand::Tag { name }) if base(name) == current)
                        && !matches!(o.op, OpCode::Unsupported)
                });
                let Some(driver) = drives else { continue };

                let mut conditions = Vec::new();
                conditions_of(&rung.logic, false, &mut conditions);
                for c in &mut conditions {
                    c.driven_in_program = !g.writers_of(&c.tag).is_empty();
                }

                for c in &conditions {
                    if !c.driven_in_program {
                        continue;
                    }
                    // A tag already explained is still queued, so the branch
                    // above can say "this holds itself in" rather than the
                    // trail simply stopping with no reason given. That branch
                    // does not expand, so this cannot run away.
                    queue.push((c.tag.clone(), depth + 1));
                }

                trace.steps.push(Step {
                    tag: current.clone(),
                    pou: pou.name.clone(),
                    rung: rung.id.clone(),
                    comment: rung.comment.clone(),
                    via: mnemonic(driver),
                    conditions,
                    depth,
                    already_seen: false,
                });
            }
        }
    }

    trace.steps.sort_by_key(|s| (s.depth, s.pou.clone(), s.rung.clone()));
    trace
}

impl Trace {
    /// The requirements read directly off the rung that drives it.
    ///
    /// Deliberately only the first step, and the reason is worth stating
    /// because the obvious version of this function is wrong.
    ///
    /// Following the trail through a negated condition inverts everything
    /// beneath it. The conveyor needs `Jam_Alarm` OFF, so the conditions that
    /// *set* the jam alarm need to be false, so the photocell needs to be
    /// clear, not blocked. A flat list built by walking the whole trace and
    /// keeping each condition's own sense says "check PE_Discharge is on",
    /// which is the exact opposite of the truth and would send somebody to
    /// look at the wrong end of the machine.
    ///
    /// It gets worse with a latch: `Jam_Alarm` being off does not mean the set
    /// condition is false now, only that it has not been true since the last
    /// reset. There is no sound flat answer to derive.
    ///
    /// So this returns what can be stated without qualification, and the tree
    /// in `steps` carries the rest with its structure intact, where the
    /// inversion is visible rather than lost.
    pub fn things_to_check(&self) -> Vec<&Condition> {
        let mut seen = BTreeSet::new();
        let mut out = Vec::new();
        for step in self.steps.iter().filter(|s| s.depth == 0 && !s.already_seen) {
            for c in &step.conditions {
                if c.one_of_several || c.sense == Sense::Other {
                    continue;
                }
                if seen.insert(c.tag.as_str()) {
                    out.push(c);
                }
            }
        }
        out
    }
}
