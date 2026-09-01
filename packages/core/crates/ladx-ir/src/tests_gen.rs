//! Acceptance tests written from the logic.
//!
//! A FAT document is normally written by reading the program and turning each
//! output into a paragraph: press this, check that. It is slow, it is done
//! once, and it goes stale the first time a rung changes. The program already
//! contains every one of those paragraphs.
//!
//! Two kinds of test come out of a rung, and the second is the one people
//! forget. "The motor starts when the conditions are met" is the obvious one.
//! "The motor does not start when the E-stop is out" is the one that finds
//! wiring faults, and it exists for every condition on the rung.
//!
//! These are steps for a person to carry out, not a simulation. LADX cannot
//! press a button or pull a guard, and a document that implied otherwise would
//! be claiming to have done the acceptance rather than to have written it.

use crate::io::{io_list, SignalType};
use crate::trace::{why, Sense};
use crate::IrProject;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// What a step is checking.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    /// It does what it should when everything is right.
    Positive,
    /// It does not do it when a condition is not met. The one that finds
    /// wiring faults.
    Negative,
    /// A safety function. Never skipped, and marked so it cannot be.
    Safety,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct TestStep {
    pub kind: Kind,
    /// What to do, in the imperative.
    pub action: String,
    /// What should happen.
    pub expect: String,
    /// The rung this came from, so a failing test leads somewhere.
    pub from: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct TestGroup {
    pub subject: String,
    pub steps: Vec<TestStep>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct TestPlan {
    pub groups: Vec<TestGroup>,
    /// What the program cannot tell anybody to test.
    pub not_covered: Vec<String>,
}

/// A comparison, spelled out.
///
/// The trace flattens `Step = 20` to "Step", because for the question "why is
/// this off" the tag is what matters. For a test step it is not: "put Step not
/// satisfied" is not something a person can carry out, and a test sheet full of
/// steps nobody can follow gets signed without being done. So the value is read
/// back off the rung.
fn comparison(project: &IrProject, pou: &str, rung: &str, tag: &str) -> Option<(String, String)> {
    let p = project.pous.iter().find(|p| p.name == pou)?;
    let crate::PouBody::Ladder { rungs } = &p.body else { return None };
    let r = rungs.iter().find(|r| r.id == rung)?;
    for i in r.logic.instructions() {
        let names_tag = i
            .operands
            .iter()
            .any(|o| matches!(o, crate::Operand::Tag { name } if name == tag));
        if !names_tag {
            continue;
        }
        let other = i.operands.iter().find_map(|o| match o {
            crate::Operand::Number { value } => Some(if value.fract() == 0.0 {
                format!("{}", *value as i64)
            } else {
                value.to_string()
            }),
            crate::Operand::Tag { name } if name != tag => Some(name.clone()),
            _ => None,
        })?;
        let (is, is_not) = match i.op {
            crate::OpCode::Equal => ("at", "at anything other than"),
            crate::OpCode::NotEqual => ("at anything other than", "at"),
            crate::OpCode::Greater => ("above", "at or below"),
            crate::OpCode::Less => ("below", "at or above"),
            crate::OpCode::GreaterOrEqual => ("at or above", "below"),
            crate::OpCode::LessOrEqual => ("at or below", "above"),
            _ => continue,
        };
        return Some((format!("{tag} {is} {other}"), format!("{tag} {is_not} {other}")));
    }
    None
}

/// Whether a tag reads as safety related. Names, because that is all a PLC
/// program carries; a safety input is not marked as one anywhere in the file.
pub fn is_safety_tag(tag: &str) -> bool {
    is_safety(tag)
}

fn is_safety(tag: &str) -> bool {
    let lower = tag.to_lowercase();
    ["estop", "e_stop", "emergency", "guard", "safety", "interlock"]
        .iter()
        .any(|m| lower.contains(m))
}

/// Write an acceptance plan for a project.
pub fn test_plan(project: &IrProject) -> TestPlan {
    let io = io_list(project);
    let mut groups = Vec::new();

    for point in io.points.iter().filter(|p| {
        matches!(p.signal, SignalType::DigitalOutput | SignalType::AnalogOutput)
    }) {
        let trace = why(project, &point.tag);
        let Some(step) = trace.steps.iter().find(|s| s.depth == 0 && !s.already_seen) else {
            continue;
        };

        let name = point.description.as_deref().unwrap_or(&point.tag);
        let from = format!("{}/{}", step.pou, step.rung);
        let mut steps = Vec::new();

        // Everything that has to be true, as one positive step.
        let required: Vec<&crate::trace::Condition> =
            step.conditions.iter().filter(|c| !c.one_of_several).collect();
        let alternatives: Vec<&crate::trace::Condition> =
            step.conditions.iter().filter(|c| c.one_of_several).collect();

        let phrase = |c: &crate::trace::Condition| -> (String, String) {
            match c.sense {
                Sense::MustBeOn => (format!("{} on", c.tag), format!("{} off", c.tag)),
                Sense::MustBeOff => (format!("{} off", c.tag), format!("{} on", c.tag)),
                Sense::Other => comparison(project, &step.pou, &step.rung, &c.tag)
                    .unwrap_or_else(|| {
                        (format!("{} satisfied", c.tag), format!("{} not satisfied", c.tag))
                    }),
            }
        };

        let set_up = |cs: &[&crate::trace::Condition]| -> String {
            cs.iter().map(|c| phrase(c).0).collect::<Vec<_>>().join(", ")
        };

        if !required.is_empty() || !alternatives.is_empty() {
            let mut action = String::from("With ");
            if !required.is_empty() {
                action.push_str(&set_up(&required));
            }
            if !alternatives.is_empty() {
                if !required.is_empty() {
                    action.push_str(", ");
                }
                action.push_str(&format!(
                    "and any of {} on",
                    alternatives.iter().map(|c| c.tag.as_str()).collect::<Vec<_>>().join(" or ")
                ));
            }
            steps.push(TestStep {
                kind: Kind::Positive,
                action,
                expect: format!("{name} comes on."),
                from: from.clone(),
            });
        }

        // And one negative step per condition. This is the half that finds
        // wiring faults: a permissive wired to the wrong terminal passes every
        // positive test and fails only when somebody breaks it deliberately.
        for c in &required {
            let opposite = phrase(c).1;
            steps.push(TestStep {
                kind: if is_safety(&c.tag) { Kind::Safety } else { Kind::Negative },
                action: format!("With everything else set to start it, put {opposite}"),
                expect: format!("{name} does not come on."),
                from: from.clone(),
            });
        }

        if !steps.is_empty() {
            groups.push(TestGroup { subject: format!("{name} ({})", point.tag), steps });
        }
    }

    let mut not_covered = vec![
        "These are steps for a person. LADX cannot press a button or open a guard, so nothing \
         here has been carried out."
            .to_string(),
        "Timing, and anything that depends on how long something takes, is not covered: the \
         program says a preset, not what the machine physically does in that time."
            .to_string(),
    ];

    if groups.is_empty() {
        not_covered.push(
            "No output in this program has conditions LADX could read, so there is nothing to \
             write steps for."
                .into(),
        );
    }

    let unread: Vec<&str> = project
        .pous
        .iter()
        .filter(|p| !matches!(p.body, crate::PouBody::Ladder { .. }))
        .map(|p| p.name.as_str())
        .collect();
    if !unread.is_empty() {
        not_covered.push(format!("{} is not ladder and was not read.", unread.join(", ")));
    }

    TestPlan { groups, not_covered }
}

impl TestPlan {
    pub fn safety_steps(&self) -> usize {
        self.groups
            .iter()
            .flat_map(|g| &g.steps)
            .filter(|s| s.kind == Kind::Safety)
            .count()
    }

    /// The plan as a document somebody signs off.
    pub fn to_markdown(&self, title: &str) -> String {
        let mut s = format!("# {title}\n\n");
        for note in &self.not_covered {
            s.push_str(&format!("> {note}\n\n"));
        }
        for g in &self.groups {
            s.push_str(&format!("## {}\n\n", g.subject));
            s.push_str("| | Do | Expect | Pass | From |\n|---|---|---|---|---|\n");
            for (n, step) in g.steps.iter().enumerate() {
                let mark = match step.kind {
                    Kind::Positive => "",
                    Kind::Negative => "negative",
                    Kind::Safety => "**SAFETY**",
                };
                s.push_str(&format!(
                    "| {}{} | {} | {} | ☐ | {} |\n",
                    n + 1,
                    if mark.is_empty() { String::new() } else { format!(" {mark}") },
                    step.action,
                    step.expect,
                    step.from
                ));
            }
            s.push('\n');
        }
        s
    }
}
