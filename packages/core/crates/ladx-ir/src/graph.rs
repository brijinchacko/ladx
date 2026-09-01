//! What a project is made of, and what refers to what.
//!
//! The question this exists to answer is "what controls Motor_101", and the
//! reason it exists at all is that the answer must not come from asking a model
//! to read the whole project. A project is tens of thousands of tags; sending
//! it wholesale is slow, expensive, and produces confident answers assembled
//! from whichever part happened to fit in the window.
//!
//! So the relationships are computed here, exactly, from the IR. A tag is
//! written by a rung or it is not, and that is a fact about the program rather
//! than an inference. What a model is later given is the handful of rungs the
//! graph says are relevant.
//!
//! The distinction that does most of the work is read versus write. "Which
//! blocks write this output" and "where is this interlock used" are different
//! questions with different answers, and an index that only knows "mentioned
//! here" cannot tell them apart. On a ladder rung the split is unambiguous: the
//! condition side reads, and an output instruction writes its destination.

use crate::{Instruction, IrProject, OpCode, Operand, PouBody};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use ts_rs::TS;

/// How a POU refers to a tag.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub enum Access {
    /// Examined. A contact, a comparison, the source of a move.
    Read,
    /// Driven. A coil, a set or reset, a timer, the destination of a move.
    Write,
}

/// One place a tag is referred to.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct TagUse {
    pub tag: String,
    pub access: Access,
    /// The POU it happens in.
    pub pou: String,
    /// The rung, so somebody can be taken to it.
    pub rung: String,
    /// What refers to it, as the neutral opcode or the vendor's own mnemonic
    /// when LADX did not recognise it.
    pub via: String,
}

/// One POU calling another.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Call {
    pub from: String,
    pub to: String,
    pub rung: String,
}

/// Everything the project refers to, and from where.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct ProjectGraph {
    pub uses: Vec<TagUse>,
    pub calls: Vec<Call>,
    /// Tags the project declares. Kept so a reference to something undeclared
    /// can be spotted, which is one of the checks a health report wants.
    pub declared: Vec<String>,
}

/// Which operand positions a write lands on.
///
/// Derived from the opcode rather than hardcoded per instruction, so an opcode
/// added to the IR gets classified rather than silently treated as a read.
fn written_positions(op: &OpCode) -> &'static [usize] {
    match op {
        // Drives the bit it names.
        OpCode::Coil
        | OpCode::CoilNegated
        | OpCode::SetCoil
        | OpCode::ResetCoil
        | OpCode::Reset => &[0],
        // The instance is updated; the preset is read.
        OpCode::TimerOn
        | OpCode::TimerOff
        | OpCode::TimerRetentive
        | OpCode::CountUp
        | OpCode::CountDown => &[0],
        // MOV(source, destination).
        OpCode::Move => &[1],
        // ADD(a, b, destination) and the rest of the arithmetic.
        OpCode::Add | OpCode::Subtract | OpCode::Multiply | OpCode::Divide => &[2],
        // Everything else only examines: contacts, comparisons, edges, and
        // anything LADX does not model, where guessing that it writes would
        // put a false answer into "what drives this output".
        _ => &[],
    }
}

fn mnemonic(i: &Instruction) -> String {
    if i.op == OpCode::Unsupported {
        i.vendor
            .as_ref()
            .map(|v| v.original_mnemonic.clone())
            .unwrap_or_else(|| "unknown".into())
    } else {
        format!("{:?}", i.op)
    }
}

fn tag_of(o: &Operand) -> Option<&str> {
    match o {
        // An empty name is not a reference to a tag called "". It is an
        // instruction somebody has placed and not yet filled in, which is the
        // normal state of a rung halfway through being drawn. Treating it as a
        // reference produces a finding with a blank name in it, which is both
        // wrong and unreadable.
        Operand::Tag { name } if !name.trim().is_empty() => Some(name.as_str()),
        _ => None,
    }
}

/// An instruction that has been placed but not given a tag.
///
/// Worth knowing about separately: the rung will not run, but it is also the
/// ordinary state of something being edited, so it is a different thing from a
/// reference to a tag that does not exist.
pub fn unassigned(project: &IrProject) -> Vec<TagUse> {
    let mut out = Vec::new();
    for pou in &project.pous {
        let PouBody::Ladder { rungs } = &pou.body else { continue };
        for rung in rungs {
            let all = rung.logic.instructions().into_iter().chain(rung.outputs.iter());
            for i in all {
                // Only the first operand, which is the tag position for every
                // instruction that names one. A missing preset is a different
                // question and defaults sensibly.
                let blank = match i.operands.first() {
                    Some(Operand::Tag { name }) => name.trim().is_empty(),
                    None => !matches!(i.op, OpCode::Return),
                    _ => false,
                };
                if blank {
                    out.push(TagUse {
                        tag: String::new(),
                        access: Access::Read,
                        pou: pou.name.clone(),
                        rung: rung.id.clone(),
                        via: mnemonic(i),
                    });
                }
            }
        }
    }
    out
}

/// The bare tag a member reference belongs to.
///
/// `Jam_Timer.DN` is a reference to `Jam_Timer`. Without this, asking what
/// drives a timer would miss every rung that reads its done bit, which is most
/// of the rungs that matter.
fn base_tag(name: &str) -> &str {
    name.split(['.', '[']).next().unwrap_or(name)
}

impl ProjectGraph {
    pub fn build(project: &IrProject) -> Self {
        let mut g = ProjectGraph {
            declared: project.tags.iter().map(|t| t.name.clone()).collect(),
            ..Default::default()
        };

        for pou in &project.pous {
            let PouBody::Ladder { rungs } = &pou.body else {
                // Structured text and the rest are carried as source. Reading
                // them would mean a second parser, and a half-right one would
                // put wrong answers into the graph, which is worse than an
                // absent one that can be reported.
                continue;
            };

            for rung in rungs {
                // The condition side only ever examines.
                for i in rung.logic.instructions() {
                    g.record(pou, rung, i, true);
                }
                for i in &rung.outputs {
                    g.record(pou, rung, i, false);
                }
            }
        }

        g.uses.sort();
        g.uses.dedup();
        g.calls.sort();
        g.calls.dedup();
        g
    }

    fn record(&mut self, pou: &crate::Pou, rung: &crate::Rung, i: &Instruction, condition: bool) {
        if i.op == OpCode::Call {
            if let Some(target) = i.operands.first().and_then(tag_of) {
                self.calls.push(Call {
                    from: pou.name.clone(),
                    to: target.to_string(),
                    rung: rung.id.clone(),
                });
            }
            return;
        }

        // Nothing on the condition side writes, whatever the opcode usually
        // does. A comparison gating a rung examines both its operands.
        let writes: &[usize] = if condition { &[] } else { written_positions(&i.op) };

        for (n, operand) in i.operands.iter().enumerate() {
            let Some(name) = tag_of(operand) else { continue };
            self.uses.push(TagUse {
                tag: base_tag(name).to_string(),
                access: if writes.contains(&n) { Access::Write } else { Access::Read },
                pou: pou.name.clone(),
                rung: rung.id.clone(),
                via: mnemonic(i),
            });
        }
    }

    /// Everywhere this tag is driven. "Which blocks write this output?"
    pub fn writers_of(&self, tag: &str) -> Vec<&TagUse> {
        self.uses.iter().filter(|u| u.tag == tag && u.access == Access::Write).collect()
    }

    /// Everywhere this tag is examined. "Where is EStop_OK used?"
    pub fn readers_of(&self, tag: &str) -> Vec<&TagUse> {
        self.uses.iter().filter(|u| u.tag == tag && u.access == Access::Read).collect()
    }

    /// Everywhere it appears at all.
    pub fn uses_of(&self, tag: &str) -> Vec<&TagUse> {
        self.uses.iter().filter(|u| u.tag == tag).collect()
    }

    pub fn calls_from(&self, pou: &str) -> Vec<&Call> {
        self.calls.iter().filter(|c| c.from == pou).collect()
    }

    pub fn callers_of(&self, pou: &str) -> Vec<&Call> {
        self.calls.iter().filter(|c| c.to == pou).collect()
    }

    /// Tags the logic refers to that nothing declares.
    ///
    /// Either an import missed a scope or the program is genuinely broken, and
    /// both are worth saying out loud rather than discovering at download time.
    pub fn undeclared(&self) -> Vec<&str> {
        let declared: BTreeSet<&str> =
            self.declared.iter().map(|d| base_tag(d.as_str())).collect();
        let mut out: Vec<&str> = self
            .uses
            .iter()
            .map(|u| u.tag.as_str())
            .filter(|t| !declared.contains(t))
            .collect();
        out.sort_unstable();
        out.dedup();
        out
    }

    /// Declared tags nothing refers to.
    pub fn unused(&self) -> Vec<&str> {
        let used: BTreeSet<&str> = self.uses.iter().map(|u| u.tag.as_str()).collect();
        let mut out: Vec<&str> = self
            .declared
            .iter()
            .map(|d| d.as_str())
            .filter(|d| !used.contains(base_tag(d)))
            .collect();
        out.sort_unstable();
        out
    }

    /// Tags driven from more than one place.
    ///
    /// Not an error on its own: a state machine legitimately sets a step
    /// register from several rungs, and set/reset pairs are the normal way to
    /// hold a latch. It is the first thing to look at when an output is doing
    /// something nobody expects, which is why it is a query rather than a
    /// verdict.
    pub fn written_from_several_places(&self) -> BTreeMap<&str, Vec<&TagUse>> {
        let mut by_tag: BTreeMap<&str, Vec<&TagUse>> = BTreeMap::new();
        for u in self.uses.iter().filter(|u| u.access == Access::Write) {
            by_tag.entry(u.tag.as_str()).or_default().push(u);
        }
        by_tag.retain(|_, v| {
            let places: BTreeSet<(&str, &str)> =
                v.iter().map(|u| (u.pou.as_str(), u.rung.as_str())).collect();
            places.len() > 1
        });
        by_tag
    }
}
