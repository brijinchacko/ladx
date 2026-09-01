//! What is worth telling an engineer about a project.
//!
//! Built on the dependency graph, so every finding is computed from the program
//! rather than guessed at, and every one names the thing it is about. A report
//! that says "possible issue in the project" is worse than no report: it costs
//! the reading and gives nothing back.
//!
//! The hard part of a checker like this is not finding things. It is not crying
//! wolf. A tool that reports forty items on a working machine gets switched off
//! after the second project, and the forty-first item, the one that mattered,
//! goes with it. So the rule here is that a finding has to be something a
//! competent engineer would want to be told, and severity has to mean what it
//! says:
//!
//!   Critical      the program is wrong, or refers to something that is not there
//!   Warning       very likely a mistake, and worth stopping for
//!   Suggestion    fine as it is, better if changed
//!   Information   true, sometimes useful, not a criticism
//!
//! Anything LADX cannot decide is reported at the level of what it actually
//! knows, or not reported at all. There is no "possibly".

use crate::graph::{Access, ProjectGraph};
use crate::{IrProject, OpCode, PouBody};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub enum Severity {
    Information,
    Suggestion,
    Warning,
    Critical,
}

/// Where a finding is, in terms somebody can navigate to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Where {
    pub pou: Option<String>,
    pub rung: Option<String>,
    pub tag: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Finding {
    pub severity: Severity,
    /// A stable identifier for the kind of check, for filtering and for
    /// suppressing one class without suppressing the report.
    pub check: String,
    /// One line, naming the thing. Not a category.
    pub title: String,
    /// Why it matters, and what it would take to be sure. Written for somebody
    /// deciding whether to act, not to justify the finding.
    pub detail: String,
    pub locations: Vec<Where>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct HealthReport {
    pub findings: Vec<Finding>,
    /// Checks that were not run, and why. Silence about a check nobody ran
    /// reads as a pass.
    pub not_checked: Vec<String>,
}

impl HealthReport {
    pub fn count(&self, severity: Severity) -> usize {
        self.findings.iter().filter(|f| f.severity == severity).count()
    }

    pub fn worst(&self) -> Option<Severity> {
        self.findings.iter().map(|f| f.severity).max()
    }
}

/// Look a project over.
pub fn analyse(project: &IrProject) -> HealthReport {
    let g = ProjectGraph::build(project);
    let mut findings = Vec::new();

    undeclared_references(&g, &mut findings);
    duplicate_coils(&g, &mut findings);
    unused_tags(&g, &mut findings);
    uncalled_routines(project, &g, &mut findings);
    latches_without_a_reset(&g, &mut findings);

    // Worst first: somebody reading three lines should read the three that
    // matter most.
    findings.sort_by(|a, b| b.severity.cmp(&a.severity).then(a.check.cmp(&b.check)));

    let mut not_checked = Vec::new();
    let non_ladder: Vec<&str> = project
        .pous
        .iter()
        .filter(|p| !matches!(p.body, PouBody::Ladder { .. }))
        .map(|p| p.name.as_str())
        .collect();
    if !non_ladder.is_empty() {
        not_checked.push(format!(
            "{} is not ladder and was not examined. LADX reads its logic as text and does not \
             analyse it, so nothing here says anything about what it does.",
            non_ladder.join(", ")
        ));
    }

    HealthReport { findings, not_checked }
}

/// Logic referring to a tag nothing declares.
fn undeclared_references(g: &ProjectGraph, out: &mut Vec<Finding>) {
    for tag in g.undeclared() {
        let uses = g.uses_of(tag);
        out.push(Finding {
            severity: Severity::Critical,
            check: "undeclared-tag".into(),
            title: format!("{tag} is used but never declared"),
            detail: format!(
                "{} place{} refer to {tag}, and no tag table declares it. Either the import \
                 missed a scope or the program will not compile.",
                uses.len(),
                if uses.len() == 1 { "" } else { "s" }
            ),
            locations: uses
                .iter()
                .map(|u| Where {
                    pou: Some(u.pou.clone()),
                    rung: Some(u.rung.clone()),
                    tag: Some(tag.to_string()),
                })
                .collect(),
        });
    }
}

/// The same bit driven by an ordinary coil on more than one rung.
///
/// The classic ladder fault, and worth separating carefully from the things
/// that look like it and are fine. A set and a reset on the same bit is how a
/// latch is written. A step register moved into from several rungs is how a
/// sequence is written. Neither is this.
///
/// Two plain coils on one bit means the later rung wins every scan and the
/// earlier one does nothing, which is almost never what somebody intended and
/// is invisible when reading either rung on its own.
fn duplicate_coils(g: &ProjectGraph, out: &mut Vec<Finding>) {
    let mut by_tag: BTreeMap<&str, Vec<_>> = BTreeMap::new();
    for u in g.uses.iter().filter(|u| u.access == Access::Write) {
        if u.via == format!("{:?}", OpCode::Coil) {
            by_tag.entry(u.tag.as_str()).or_default().push(u);
        }
    }

    for (tag, uses) in by_tag {
        let rungs: BTreeSet<(&str, &str)> =
            uses.iter().map(|u| (u.pou.as_str(), u.rung.as_str())).collect();
        if rungs.len() < 2 {
            continue;
        }
        out.push(Finding {
            severity: Severity::Warning,
            check: "duplicate-coil".into(),
            title: format!("{tag} is driven by a coil on {} rungs", rungs.len()),
            detail: format!(
                "Whichever rung runs last decides {tag} on every scan, so the earlier one has no \
                 effect. This is different from a set and reset pair, which is a latch and is \
                 fine. If both conditions are meant to start it, they belong on one rung in \
                 parallel."
            ),
            locations: uses
                .iter()
                .map(|u| Where {
                    pou: Some(u.pou.clone()),
                    rung: Some(u.rung.clone()),
                    tag: Some(tag.to_string()),
                })
                .collect(),
        });
    }
}

/// Declared and never referred to.
fn unused_tags(g: &ProjectGraph, out: &mut Vec<Finding>) {
    let unused = g.unused();
    if unused.is_empty() {
        return;
    }
    out.push(Finding {
        severity: Severity::Suggestion,
        check: "unused-tag".into(),
        title: format!(
            "{} tag{} declared and never used",
            unused.len(),
            if unused.len() == 1 { "" } else { "s" }
        ),
        detail: format!(
            "Nothing in the ladder refers to {}. That is normal for a spare, and worth a look if \
             one of them was supposed to be wired to something.",
            unused.join(", ")
        ),
        locations: unused
            .iter()
            .map(|t| Where { pou: None, rung: None, tag: Some((*t).to_string()) })
            .collect(),
    });
}

/// A routine nothing calls, which is not the one the controller runs.
fn uncalled_routines(project: &IrProject, g: &ProjectGraph, out: &mut Vec<Finding>) {
    for pou in &project.pous {
        if project.entry_point.as_deref() == Some(pou.name.as_str()) {
            continue;
        }
        // A function block is called by instruction rather than by JSR, and
        // LADX does not model those calls, so it cannot tell whether one is
        // used. Saying nothing beats saying something wrong.
        if pou.kind != crate::PouKind::Program {
            continue;
        }
        if !g.callers_of(&pou.name).is_empty() {
            continue;
        }
        out.push(Finding {
            severity: Severity::Warning,
            check: "uncalled-routine".into(),
            title: format!("Nothing calls {}", pou.name),
            detail: format!(
                "{} is not the entry point and no rung calls it, so none of its logic runs. \
                 Either a call is missing or the routine is left over.",
                pou.name
            ),
            locations: vec![Where { pou: Some(pou.name.clone()), rung: None, tag: None }],
        });
    }
}

/// A bit that is set and never reset.
///
/// Reported because it is usually deliberate and occasionally the whole bug: an
/// alarm that latches with no way to clear it needs a power cycle, and nobody
/// discovers that until the first time it trips.
fn latches_without_a_reset(g: &ProjectGraph, out: &mut Vec<Finding>) {
    let set_name = format!("{:?}", OpCode::SetCoil);
    let reset_name = format!("{:?}", OpCode::ResetCoil);

    let mut set: BTreeMap<&str, Vec<_>> = BTreeMap::new();
    let mut reset: BTreeSet<&str> = BTreeSet::new();
    for u in g.uses.iter().filter(|u| u.access == Access::Write) {
        if u.via == set_name {
            set.entry(u.tag.as_str()).or_default().push(u);
        } else if u.via == reset_name {
            reset.insert(u.tag.as_str());
        }
    }

    for (tag, uses) in set {
        if reset.contains(tag) {
            continue;
        }
        out.push(Finding {
            severity: Severity::Warning,
            check: "latch-without-reset".into(),
            title: format!("{tag} is latched and never unlatched"),
            detail: format!(
                "A rung sets {tag} and nothing in this program resets it, so once it is on it \
                 stays on until the controller is restarted. If something outside this program \
                 clears it, this is fine."
            ),
            locations: uses
                .iter()
                .map(|u| Where {
                    pou: Some(u.pou.clone()),
                    rung: Some(u.rung.clone()),
                    tag: Some(tag.to_string()),
                })
                .collect(),
        });
    }
}
