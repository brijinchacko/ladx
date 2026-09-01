//! What changed between two versions of a project, in engineering terms.
//!
//! A text diff of an L5X answers "line 485 changed", which is true and useless.
//! The question being asked is "what is different about the machine", and the
//! answer somebody needs is "Motor M102 lost its guard permissive", a sentence
//! about the plant rather than about the file.
//!
//! Risk is reported and never resolved. LADX can see that a permissive was
//! removed; it cannot see whether that was the point of the change. So a
//! removed condition is always raised, and nothing is ever marked safe: a diff
//! that told somebody a change was fine would be making a judgement it has no
//! grounds for, and the one time it was wrong would be the time it mattered.

use crate::graph::{Access, ProjectGraph};
use crate::{IrProject, PouBody};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use ts_rs::TS;

/// How much attention a change needs.
///
/// There is no "safe". The absence is deliberate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub enum Risk {
    /// Worth knowing, and unlikely to change behaviour on its own.
    Low,
    /// Changes what the machine does.
    Medium,
    /// Changes what the machine does when something goes wrong.
    High,
    /// Touches something that stops the machine or protects somebody.
    Safety,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Change {
    pub risk: Risk,
    /// What changed, said about the machine rather than about the file.
    pub summary: String,
    /// Where, so somebody can open it.
    pub at: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Diff {
    pub changes: Vec<Change>,
    /// Said out loud: a diff that examined less than the whole project must
    /// not read as one that found nothing elsewhere.
    pub not_compared: Vec<String>,
}

impl Diff {
    pub fn worst(&self) -> Option<Risk> {
        self.changes.iter().map(|c| c.risk).max()
    }

    pub fn count(&self, risk: Risk) -> usize {
        self.changes.iter().filter(|c| c.risk == risk).count()
    }
}

/// Whether a tag is part of stopping the machine or protecting somebody.
fn is_protective(tag: &str) -> bool {
    let lower = tag.to_lowercase();
    const MARKERS: [&str; 10] = [
        "estop", "e_stop", "emergency", "guard", "safety", "interlock", "permissive", "stop",
        "trip", "overload",
    ];
    MARKERS.iter().any(|m| lower.contains(m))
}

/// Every rung, as the text it would be written as, keyed by where it lives.
fn rung_text(project: &IrProject) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for pou in &project.pous {
        let PouBody::Ladder { rungs } = &pou.body else { continue };
        for r in rungs {
            let text = crate::neutral_text::rung_to_text(r).unwrap_or_else(|_| "?".into());
            out.insert(format!("{}/{}", pou.name, r.id), text);
        }
    }
    out
}

/// Compare two versions of a project.
pub fn diff(before: &IrProject, after: &IrProject) -> Diff {
    let mut changes = Vec::new();

    let before_tags: BTreeMap<&str, &crate::Tag> =
        before.tags.iter().map(|t| (t.name.as_str(), t)).collect();
    let after_tags: BTreeMap<&str, &crate::Tag> =
        after.tags.iter().map(|t| (t.name.as_str(), t)).collect();

    // ── tags ────────────────────────────────────────────────────────────
    for (name, t) in &after_tags {
        if !before_tags.contains_key(name) {
            changes.push(Change {
                risk: Risk::Low,
                summary: format!(
                    "{name} is new{}.",
                    t.comment.as_deref().map(|c| format!(", \"{c}\"")).unwrap_or_default()
                ),
                at: vec![(*name).to_string()],
            });
        }
    }
    for (name, t) in &before_tags {
        if !after_tags.contains_key(name) {
            changes.push(Change {
                // A removed tag that something still refers to will not
                // compile; one nothing refers to is housekeeping. Either way
                // it is worth more than a note when it is protective.
                risk: if is_protective(name) { Risk::Safety } else { Risk::Medium },
                summary: format!(
                    "{name} was removed{}.",
                    t.comment.as_deref().map(|c| format!(" (\"{c}\")")).unwrap_or_default()
                ),
                at: vec![(*name).to_string()],
            });
        }
    }
    for (name, a) in &after_tags {
        let Some(b) = before_tags.get(name) else { continue };
        if a.data_type != b.data_type {
            changes.push(Change {
                risk: Risk::Medium,
                summary: format!("{name} changed type from {:?} to {:?}.", b.data_type, a.data_type),
                at: vec![(*name).to_string()],
            });
        }
        if a.address != b.address {
            changes.push(Change {
                risk: if is_protective(name) { Risk::Safety } else { Risk::High },
                summary: format!(
                    "{name} moved from {} to {}.",
                    b.address.as_deref().unwrap_or("no address"),
                    a.address.as_deref().unwrap_or("no address")
                ),
                at: vec![(*name).to_string()],
            });
        }
    }

    // ── routines ────────────────────────────────────────────────────────
    let before_pous: BTreeSet<&str> = before.pous.iter().map(|p| p.name.as_str()).collect();
    let after_pous: BTreeSet<&str> = after.pous.iter().map(|p| p.name.as_str()).collect();
    for name in after_pous.difference(&before_pous) {
        changes.push(Change {
            risk: Risk::Medium,
            summary: format!("{name} is a new routine."),
            at: vec![(*name).to_string()],
        });
    }
    for name in before_pous.difference(&after_pous) {
        changes.push(Change {
            risk: Risk::High,
            summary: format!("{name} was removed. Anything it did is not happening any more."),
            at: vec![(*name).to_string()],
        });
    }

    // ── rungs, and what changed inside them ─────────────────────────────
    let before_rungs = rung_text(before);
    let after_rungs = rung_text(after);
    let g_before = ProjectGraph::build(before);
    let g_after = ProjectGraph::build(after);

    for (where_, after_text) in &after_rungs {
        match before_rungs.get(where_) {
            None => changes.push(Change {
                risk: Risk::Medium,
                summary: format!("A rung was added at {where_}."),
                at: vec![where_.clone()],
            }),
            Some(before_text) if before_text != after_text => {
                changes.extend(describe_rung_change(where_, &g_before, &g_after));
            }
            _ => {}
        }
    }
    for where_ in before_rungs.keys() {
        if !after_rungs.contains_key(where_) {
            changes.push(Change {
                risk: Risk::High,
                summary: format!("A rung was removed at {where_}."),
                at: vec![where_.clone()],
            });
        }
    }

    changes.sort_by(|a, b| b.risk.cmp(&a.risk).then(a.summary.cmp(&b.summary)));

    let mut not_compared = Vec::new();
    let carried: Vec<&str> = after
        .pous
        .iter()
        .filter(|p| !matches!(p.body, PouBody::Ladder { .. }))
        .map(|p| p.name.as_str())
        .collect();
    if !carried.is_empty() {
        not_compared.push(format!(
            "{} is not ladder. LADX carries it as source and did not compare it, so a change \
             inside it is not in this list.",
            carried.join(", ")
        ));
    }

    Diff { changes, not_compared }
}

/// What changed inside one rung, in terms of the conditions on it.
///
/// This is the sentence worth having: not "the rung changed" but "it lost the
/// guard permissive".
fn describe_rung_change(where_: &str, before: &ProjectGraph, after: &ProjectGraph) -> Vec<Change> {
    let reads = |g: &ProjectGraph| -> BTreeSet<String> {
        g.uses
            .iter()
            .filter(|u| format!("{}/{}", u.pou, u.rung) == where_ && u.access == Access::Read)
            .map(|u| u.tag.clone())
            .collect()
    };

    let was = reads(before);
    let now = reads(after);

    let mut out = Vec::new();
    for gone in was.difference(&now) {
        out.push(Change {
            // A removed condition is always raised. LADX can see that a
            // permissive went; it cannot see whether that was the point of the
            // change, so it never decides.
            risk: if is_protective(gone) { Risk::Safety } else { Risk::High },
            summary: format!("{where_} no longer checks {gone}."),
            at: vec![where_.to_string()],
        });
    }
    for added in now.difference(&was) {
        out.push(Change {
            risk: Risk::Medium,
            summary: format!("{where_} now also checks {added}."),
            at: vec![where_.to_string()],
        });
    }

    if out.is_empty() {
        out.push(Change {
            risk: Risk::Medium,
            summary: format!("{where_} changed, with the same tags on it."),
            at: vec![where_.to_string()],
        });
    }
    out
}
