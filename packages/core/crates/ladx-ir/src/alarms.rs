//! The alarms a program already has, found rather than declared.
//!
//! Nobody writes an alarm list first. They write the logic, and the alarm list
//! is reconstructed later from it, usually by reading every rung and typing the
//! result into a spreadsheet. That is slow, it is done once, and it is wrong
//! within a month.
//!
//! The shape is recognisable: something latches a bit when a condition goes
//! bad, something else clears it, and an operator screen shows it. So this
//! looks for that shape and reports what it found, along with what it could not
//! work out.
//!
//! It is deliberately cautious about calling something an alarm. A latch is not
//! necessarily an alarm, a sequence step is latched too, so the evidence for
//! each one is carried with it and a caller can disagree. An alarm list nobody
//! trusts gets rewritten by hand, which is the situation this is trying to
//! replace.

use crate::graph::{Access, ProjectGraph};
use crate::{IrProject, OpCode, PouBody};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// How sure LADX is that this is an alarm.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub enum Confidence {
    /// The tag is named like an alarm and behaves like one.
    Clear,
    /// It behaves like one. The name says nothing either way.
    Likely,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Alarm {
    pub tag: String,
    pub description: Option<String>,
    pub confidence: Confidence,
    /// What sets it, in the source's own terms.
    pub raised_by: Vec<String>,
    /// What clears it. Empty means nothing in this program does.
    pub cleared_by: Vec<String>,
    /// Whether it latches. A momentary alarm and a latched one need different
    /// operator handling, and the difference is in the logic rather than in
    /// anybody's intention.
    pub latched: bool,
    /// Why LADX thinks this is an alarm, so somebody can disagree with it.
    pub evidence: String,
    /// True when this follows other alarms rather than a process condition.
    ///
    /// A summary bit and an annunciator horn both look exactly like an alarm:
    /// they are named like one and driven like one. They are not conditions
    /// though, and an alarm schedule listing "Any_Alarm" and "Alarm_Horn"
    /// beside the three real faults is one somebody has to prune before it can
    /// be used. Marked rather than dropped, because they belong on the list,
    /// just not as causes.
    pub follows_other_alarms: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct AlarmIssue {
    pub check: String,
    pub tag: String,
    pub detail: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct AlarmList {
    pub alarms: Vec<Alarm>,
    pub issues: Vec<AlarmIssue>,
}

/// Whether a name says "alarm" in the words engineers actually use.
///
/// Deliberately a small list. Matching loosely would sweep in every tag with
/// "trip" in a longer word and produce an alarm list somebody has to prune,
/// which is the work this is meant to remove.
fn named_like_an_alarm(tag: &str) -> bool {
    let lower = tag.to_lowercase();
    const MARKERS: [&str; 8] =
        ["alarm", "alm_", "_alm", "fault", "flt_", "_flt", "trip", "warning"];
    MARKERS.iter().any(|m| lower.contains(m))
}

/// Read the alarms out of a program.
pub fn alarm_list(project: &IrProject) -> AlarmList {
    let g = ProjectGraph::build(project);
    let mut alarms: Vec<Alarm> = Vec::new();

    // Every tag something writes is a candidate; the shape decides.
    let mut candidates: Vec<&str> = g
        .uses
        .iter()
        .filter(|u| u.access == Access::Write)
        .map(|u| u.tag.as_str())
        .collect();
    candidates.sort_unstable();
    candidates.dedup();

    for tag in candidates {
        let writers = g.writers_of(tag);
        let set: Vec<_> = writers
            .iter()
            .filter(|w| w.via == format!("{:?}", OpCode::SetCoil))
            .collect();
        let reset: Vec<_> = writers
            .iter()
            .filter(|w| w.via == format!("{:?}", OpCode::ResetCoil))
            .collect();
        let coil: Vec<_> =
            writers.iter().filter(|w| w.via == format!("{:?}", OpCode::Coil)).collect();

        let named = named_like_an_alarm(tag);
        let latched = !set.is_empty();

        // Two shapes count. A latch, which is the usual way an alarm is
        // written, and a plain coil on a tag that is named like an alarm.
        //
        // A plain coil on a tag that is *not* named like one is not enough:
        // that is every output in the program, and reporting them all would
        // produce a list nobody reads.
        let (confidence, evidence) = if latched && named {
            (Confidence::Clear, "Latched, and named like an alarm.")
        } else if latched {
            (Confidence::Likely, "Latched by a set with a separate reset, which is how an alarm is usually written. It could also be a sequence step.")
        } else if named && !coil.is_empty() {
            (Confidence::Clear, "Named like an alarm and driven by a coil, so it follows its condition rather than latching.")
        } else {
            continue;
        };

        let description = project
            .tags
            .iter()
            .find(|t| t.name == tag)
            .and_then(|t| t.comment.clone());

        alarms.push(Alarm {
            tag: tag.to_string(),
            description,
            confidence,
            raised_by: set
                .iter()
                .chain(coil.iter())
                .map(|w| format!("{}/{}", w.pou, w.rung))
                .collect(),
            cleared_by: reset.iter().map(|w| format!("{}/{}", w.pou, w.rung)).collect(),
            latched,
            evidence: evidence.to_string(),
            // Filled in on the second pass, which needs every candidate.
            follows_other_alarms: false,
        });
    }

    // Second pass, because it needs the whole candidate set: a bit is a
    // summary when everything that raises it is itself one of these.
    let names: std::collections::BTreeSet<String> =
        alarms.iter().map(|a| a.tag.clone()).collect();
    for alarm in &mut alarms {
        let sources: Vec<&str> = g
            .writers_of(&alarm.tag)
            .iter()
            .flat_map(|w| condition_tags(project, &w.pou, &w.rung))
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect();

        // Timers and counters are left out of the judgement. A horn that
        // sounds for thirty seconds is gated by a timer, and that timer is a
        // timing element rather than a separate thing going wrong. Counting it
        // as a condition is what kept the horn off the summary list.
        let conditions: Vec<&&str> = sources
            .iter()
            .filter(|t| {
                !project.tags.iter().any(|tag| {
                    tag.name == ***t
                        && matches!(tag.data_type, crate::DataType::Timer | crate::DataType::Counter)
                })
            })
            .collect();

        alarm.follows_other_alarms =
            !conditions.is_empty() && conditions.iter().all(|t| names.contains(**t));

        if alarm.follows_other_alarms {
            alarm.evidence = format!(
                "{} Everything that raises it is itself an alarm, so it summarises them rather \
                 than being a separate fault.",
                alarm.evidence
            );
        }
    }

    alarms.sort_by(|a, b| {
        // Real conditions first: somebody reading the top of an alarm schedule
        // wants the faults, not the horn that sounds for them.
        a.follows_other_alarms
            .cmp(&b.follows_other_alarms)
            .then(b.confidence.cmp(&a.confidence))
            .then(a.tag.cmp(&b.tag))
    });
    let issues = check(&alarms, project, &g);
    AlarmList { alarms, issues }
}

fn check(alarms: &[Alarm], project: &IrProject, g: &ProjectGraph) -> Vec<AlarmIssue> {
    let mut issues = Vec::new();

    for a in alarms {
        // An alarm that latches with nothing to clear it needs a power cycle,
        // and nobody finds that out until the first time it trips.
        if a.latched && a.cleared_by.is_empty() {
            issues.push(AlarmIssue {
                check: "no-reset".into(),
                tag: a.tag.clone(),
                detail: "Latches and nothing in this program clears it, so once it is on it stays \
                         on until the controller restarts."
                    .into(),
            });
        }

        // An alarm nothing reads is an alarm nobody sees.
        if g.readers_of(&a.tag).is_empty() {
            issues.push(AlarmIssue {
                check: "not-displayed".into(),
                tag: a.tag.clone(),
                detail: "Nothing in this program reads it. If an operator screen is meant to show \
                         it, that binding is somewhere LADX cannot see."
                    .into(),
            });
        }

        // A message is what an operator gets at three in the morning.
        if a.description.as_deref().unwrap_or("").trim().is_empty() {
            issues.push(AlarmIssue {
                check: "no-message".into(),
                tag: a.tag.clone(),
                detail: "No description, so the operator sees the tag name and nothing else."
                    .into(),
            });
        }
    }

    // Two alarms with the same wording are two alarms nobody can tell apart on
    // a screen at three in the morning.
    for (i, a) in alarms.iter().enumerate() {
        let Some(text) = a.description.as_deref().map(str::trim).filter(|t| !t.is_empty()) else {
            continue;
        };
        for b in alarms.iter().skip(i + 1) {
            if b.description.as_deref().map(str::trim) == Some(text) {
                issues.push(AlarmIssue {
                    check: "duplicate-message".into(),
                    tag: a.tag.clone(),
                    detail: format!(
                        "{} has the same message. On a screen they are indistinguishable.",
                        b.tag
                    ),
                });
            }
        }
    }

    // Said out loud rather than left as silence.
    let unreadable: Vec<&str> = project
        .pous
        .iter()
        .filter(|p| !matches!(p.body, PouBody::Ladder { .. }))
        .map(|p| p.name.as_str())
        .collect();
    if !unreadable.is_empty() {
        issues.push(AlarmIssue {
            check: "not-examined".into(),
            tag: String::new(),
            detail: format!(
                "{} is not ladder and was not read, so any alarm it raises is not in this list.",
                unreadable.join(", ")
            ),
        });
    }

    issues.sort_by(|a, b| a.check.cmp(&b.check).then(a.tag.cmp(&b.tag)));
    issues
}

/// The list as CSV, columns in the order an alarm schedule is read.
pub fn to_csv(list: &AlarmList) -> String {
    let mut s = String::from("Tag,Message,Latched,Raised by,Cleared by,Confidence,Kind\n");
    for a in &list.alarms {
        let field = |v: &str| {
            if v.contains(',') || v.contains('"') {
                format!("\"{}\"", v.replace('"', "\"\""))
            } else {
                v.to_string()
            }
        };
        s.push_str(&format!(
            "{},{},{},{},{},{},{}\n",
            field(&a.tag),
            field(a.description.as_deref().unwrap_or("")),
            if a.latched { "yes" } else { "no" },
            field(&a.raised_by.join(" ")),
            field(&a.cleared_by.join(" ")),
            match a.confidence {
                Confidence::Clear => "clear",
                Confidence::Likely => "likely",
            },
            if a.follows_other_alarms { "summary" } else { "condition" },
        ));
    }
    s
}

/// The tags on the condition side of one rung.
fn condition_tags<'a>(project: &'a IrProject, pou: &str, rung: &str) -> Vec<&'a str> {
    for p in &project.pous {
        if p.name != pou {
            continue;
        }
        let PouBody::Ladder { rungs } = &p.body else { continue };
        for r in rungs {
            if r.id != rung {
                continue;
            }
            return r
                .logic
                .instructions()
                .into_iter()
                .filter_map(|i| match i.operands.first() {
                    Some(crate::Operand::Tag { name }) => {
                        Some(name.split(['.', '[']).next().unwrap_or(name))
                    }
                    _ => None,
                })
                .collect();
        }
    }
    Vec::new()
}
