//! Documents written from the project rather than about it.
//!
//! The document nobody trusts is the one written once and never opened again:
//! an FDS describing a machine as it was specified, beside a machine as it was
//! built. So these are generated from the program every time they are asked
//! for, and every statement in them names the rung or tag it came from.
//!
//! The rule that shapes all of it: **nothing is invented**. Where the program
//! does not say something, the document says it does not, in those words, and
//! marks it for an engineer. A document with a plausible invented sentence in
//! it is worse than one with a gap, because a gap is obviously a gap and an
//! invention is only obvious to somebody who already knows the answer.

use crate::alarms::alarm_list;
use crate::graph::ProjectGraph;
use crate::io::{io_list, SignalType};
use crate::{IrProject, PouBody};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A statement in a document, and where it came from.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Sourced {
    pub text: String,
    /// Rungs, tags or routines. Empty means the statement is structural rather
    /// than a claim about the program.
    pub from: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Section {
    pub heading: String,
    pub paragraphs: Vec<Sourced>,
    /// What the program could not answer. Written into the document rather
    /// than left out, so a gap is visible to whoever has to fill it.
    pub needs_engineer: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Document {
    pub title: String,
    pub sections: Vec<Section>,
}

impl Document {
    /// How many statements in this document are unanswered.
    pub fn gaps(&self) -> usize {
        self.sections.iter().map(|s| s.needs_engineer.len()).sum()
    }

    /// The document as Markdown, provenance included.
    ///
    /// Provenance is in the text rather than in a separate column because a
    /// document gets copied into other documents, and a citation that survives
    /// copying is the only kind worth having.
    pub fn to_markdown(&self) -> String {
        let mut s = format!("# {}\n\n", self.title);
        for section in &self.sections {
            s.push_str(&format!("## {}\n\n", section.heading));
            for p in &section.paragraphs {
                s.push_str(&p.text);
                if !p.from.is_empty() {
                    s.push_str(&format!("  \n*Source: {}*", p.from.join(", ")));
                }
                s.push_str("\n\n");
            }
            for gap in &section.needs_engineer {
                s.push_str(&format!("> **REQUIRES ENGINEER INPUT.** {gap}\n\n"));
            }
        }
        s
    }
}

/// A control narrative: what the machine does, in sentences, from the logic.
pub fn control_narrative(project: &IrProject) -> Document {
    let g = ProjectGraph::build(project);
    let io = io_list(project);
    let alarms = alarm_list(project);

    let mut sections = Vec::new();

    // ── what it is made of ──────────────────────────────────────────────
    let mut overview = Section {
        heading: "Scope".into(),
        paragraphs: vec![Sourced {
            text: format!(
                "{} contains {} routine{} and {} tag{}, of which {} are wired to the plant: \
                 {} input{} and {} output{}.",
                project.name,
                project.pous.len(),
                plural(project.pous.len()),
                project.tags.len(),
                plural(project.tags.len()),
                io.points.len(),
                io.inputs(),
                plural(io.inputs()),
                io.outputs(),
                plural(io.outputs()),
            ),
            from: vec![],
        }],
        needs_engineer: vec![],
    };

    let unreadable: Vec<&str> = project
        .pous
        .iter()
        .filter(|p| !matches!(p.body, PouBody::Ladder { .. }))
        .map(|p| p.name.as_str())
        .collect();
    if !unreadable.is_empty() {
        overview.needs_engineer.push(format!(
            "{} is not ladder. LADX carries it but does not read it, so nothing in this document \
             describes what it does.",
            unreadable.join(", ")
        ));
    }
    sections.push(overview);

    // ── what each output does ───────────────────────────────────────────
    let mut operation = Section {
        heading: "Operation".into(),
        paragraphs: vec![],
        needs_engineer: vec![],
    };

    for point in io.points.iter().filter(|p| {
        matches!(p.signal, SignalType::DigitalOutput | SignalType::AnalogOutput)
    }) {
        let writers = g.writers_of(&point.tag);
        if writers.is_empty() {
            operation.needs_engineer.push(format!(
                "{} is wired as an output and nothing in the program drives it. Either it is not \
                 used, or the logic that should drive it is missing.",
                point.tag
            ));
            continue;
        }

        // The conditions on the rung that drives it, which is the sentence
        // somebody actually wants: what has to be true.
        let trace = crate::trace::why(project, &point.tag);
        let Some(step) = trace.steps.iter().find(|s| s.depth == 0 && !s.already_seen) else {
            continue;
        };

        let required: Vec<String> = step
            .conditions
            .iter()
            .filter(|c| !c.one_of_several)
            .map(|c| match c.sense {
                crate::trace::Sense::MustBeOn => format!("{} is on", c.tag),
                crate::trace::Sense::MustBeOff => format!("{} is off", c.tag),
                crate::trace::Sense::Other => format!("{} compares true", c.tag),
            })
            .collect();

        let alternatives: Vec<&str> = step
            .conditions
            .iter()
            .filter(|c| c.one_of_several)
            .map(|c| c.tag.as_str())
            .collect();

        // The tag in brackets only when it adds something. With no
        // description the two are the same string, and "Conveyor (Conveyor)"
        // reads as a mistake in a document somebody is handing over.
        let mut text = match point.description.as_deref().map(str::trim).filter(|d| !d.is_empty()) {
            Some(d) => format!("**{d}** ({}). ", point.tag),
            None => format!("**{}**. ", point.tag),
        };

        if required.is_empty() && alternatives.is_empty() {
            text.push_str("Driven unconditionally.");
        } else {
            text.push_str("Comes on when ");
            if !alternatives.is_empty() {
                text.push_str(&format!("any of {} is on", alternatives.join(" or ")));
                if !required.is_empty() {
                    text.push_str(" and ");
                }
            }
            if !required.is_empty() {
                text.push_str(&required.join(", and "));
            }
            text.push('.');
        }

        operation.paragraphs.push(Sourced {
            text,
            from: vec![format!("{}/{}", step.pou, step.rung)],
        });
    }

    if operation.paragraphs.is_empty() && operation.needs_engineer.is_empty() {
        operation.needs_engineer.push(
            "No tag in this program is recorded as an output, so there is nothing to describe. \
             Marking tags as wired is what makes this section possible."
                .into(),
        );
    }
    sections.push(operation);

    // ── alarms ──────────────────────────────────────────────────────────
    let mut alarm_section =
        Section { heading: "Alarms".into(), paragraphs: vec![], needs_engineer: vec![] };

    for a in alarms.alarms.iter().filter(|a| !a.follows_other_alarms) {
        let named = match a.description.as_deref().map(str::trim).filter(|d| !d.is_empty()) {
            Some(d) => format!("**{d}** ({})", a.tag),
            None => format!("**{}**", a.tag),
        };
        let cleared = if a.cleared_by.is_empty() {
            "Nothing in this program clears it, so it stays on until the controller restarts."
                .to_string()
        } else {
            format!("Cleared at {}.", a.cleared_by.join(", "))
        };
        alarm_section.paragraphs.push(Sourced {
            text: format!("{named}. Raised at {}. {cleared}", a.raised_by.join(", ")),
            from: a.raised_by.iter().chain(a.cleared_by.iter()).cloned().collect(),
        });

        if a.description.as_deref().unwrap_or("").trim().is_empty() {
            alarm_section.needs_engineer.push(format!(
                "{} has no message. An operator sees the tag name and nothing else.",
                a.tag
            ));
        }
    }

    if alarm_section.paragraphs.is_empty() {
        alarm_section.paragraphs.push(Sourced {
            text: "Nothing in this program raises an alarm.".into(),
            from: vec![],
        });
    }
    sections.push(alarm_section);

    // ── what a program cannot say about itself ──────────────────────────
    sections.push(Section {
        heading: "Not covered".into(),
        paragraphs: vec![Sourced {
            text: "This document is written from the program. It describes what the logic does \
                   and cannot describe why, what the machine is for, what the customer specified, \
                   or anything decided outside the code."
                .into(),
            from: vec![],
        }],
        needs_engineer: vec![
            "The purpose of the machine and its operating context.".into(),
            "Safety requirements, and how the safety system is arranged.".into(),
            "Anything agreed with the customer that the program does not record.".into(),
        ],
    });

    Document { title: format!("{}: control narrative", project.name), sections }
}

fn plural(n: usize) -> &'static str {
    if n == 1 {
        ""
    } else {
        "s"
    }
}
