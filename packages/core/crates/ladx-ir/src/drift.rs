//! Where the tag lists stopped agreeing with each other.
//!
//! A project carries the same tag in four places: the PLC program, the HMI tag
//! list, the I/O schedule, and the functional spec. Nothing keeps them in step.
//! Somebody renames `Mtr1_Run` to `Motor_1_Run` in the PLC, the HMI keeps
//! pointing at the old name, and the button goes dead in a way that looks like
//! a comms fault for two days.
//!
//! The interesting finding is not "this name is missing". It is "this name is
//! missing and something one character away from it is present", because that
//! is a rename nobody carried through, and it is the case a set difference
//! reports as two unrelated problems.

use crate::IrProject;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use ts_rs::TS;

/// One of the places a tag name is written down.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub struct Source {
    /// What to call it in the report: "HMI", "I/O schedule", "P&ID".
    pub name: String,
    pub tags: Vec<ExternalTag>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub struct ExternalTag {
    pub name: String,
    pub description: Option<String>,
    /// The hardware address, where the source carries one.
    pub address: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub enum DriftKind {
    /// Present in one place, and something very close is present in the other.
    /// A rename that was not carried through.
    ProbableRename,
    /// The HMI or schedule points at a tag the PLC does not have. This one
    /// breaks at runtime.
    MissingFromPlc,
    /// The PLC has it and nothing else mentions it.
    MissingFromSource,
    /// Same name, different address.
    AddressDisagrees,
    /// Same name, different description. Cosmetic, but it is how a wrong
    /// description spreads.
    DescriptionDisagrees,
}

impl DriftKind {
    /// Whether this one stops the plant.
    pub fn breaks_at_runtime(self) -> bool {
        matches!(self, DriftKind::MissingFromPlc | DriftKind::AddressDisagrees)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub struct Drift {
    pub kind: DriftKind,
    pub tag: String,
    /// The name it probably became, for a rename.
    pub counterpart: Option<String>,
    pub source: String,
    pub detail: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub struct DriftReport {
    pub drifts: Vec<Drift>,
    pub notes: Vec<String>,
}

/// Edit distance, capped: past two edits it is a different tag, not a typo.
fn close_enough(a: &str, b: &str) -> bool {
    let (a, b) = (a.to_lowercase(), b.to_lowercase());
    if a == b {
        return true;
    }
    // Punctuation is the commonest drift of all: Motor1_Run vs Motor_1_Run.
    let strip = |s: &str| s.chars().filter(|c| c.is_alphanumeric()).collect::<String>();
    if strip(&a) == strip(&b) {
        return true;
    }
    if a.len().abs_diff(b.len()) > 2 {
        return false;
    }
    let (av, bv): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    let mut prev: Vec<usize> = (0..=bv.len()).collect();
    let mut cur = vec![0usize; bv.len() + 1];
    for i in 1..=av.len() {
        cur[0] = i;
        for j in 1..=bv.len() {
            let sub = prev[j - 1] + usize::from(av[i - 1] != bv[j - 1]);
            cur[j] = sub.min(prev[j] + 1).min(cur[j - 1] + 1);
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[bv.len()] <= 2
}

/// Compare the program's tags against every other list that names them.
pub fn drift(project: &IrProject, sources: &[Source]) -> DriftReport {
    let mut drifts = Vec::new();
    let mut notes = Vec::new();

    let plc: BTreeMap<String, &crate::Tag> =
        project.tags.iter().map(|t| (t.name.to_lowercase(), t)).collect();

    // A tag the program declares but never uses is a different complaint, and
    // io.rs already makes it. Here only names matter.
    let mut mentioned_by_someone: BTreeSet<String> = BTreeSet::new();

    for source in sources {
        for ext in &source.tags {
            let key = ext.name.to_lowercase();
            mentioned_by_someone.insert(key.clone());

            let Some(tag) = plc.get(&key) else {
                // Before calling it missing, look for what it became.
                let near = plc
                    .values()
                    .find(|t| close_enough(&t.name, &ext.name) && !t.name.eq_ignore_ascii_case(&ext.name));
                if let Some(t) = near {
                    mentioned_by_someone.insert(t.name.to_lowercase());
                    drifts.push(Drift {
                        kind: DriftKind::ProbableRename,
                        tag: ext.name.clone(),
                        counterpart: Some(t.name.clone()),
                        source: source.name.clone(),
                        detail: format!(
                            "{} has {}, the PLC has {}. One character apart, so this is most \
                             likely a rename that was not carried across.",
                            source.name, ext.name, t.name
                        ),
                    });
                } else {
                    drifts.push(Drift {
                        kind: DriftKind::MissingFromPlc,
                        tag: ext.name.clone(),
                        counterpart: None,
                        source: source.name.clone(),
                        detail: format!(
                            "{} refers to {}, which the PLC does not have. This fails when the \
                             {} tries to read it, not at build time.",
                            source.name, ext.name, source.name
                        ),
                    });
                }
                continue;
            };

            if let (Some(a), Some(b)) = (&ext.address, &tag.address) {
                if a.trim() != b.trim() {
                    drifts.push(Drift {
                        kind: DriftKind::AddressDisagrees,
                        tag: tag.name.clone(),
                        counterpart: None,
                        source: source.name.clone(),
                        detail: format!(
                            "{} says {a}, the PLC says {b}. One of them is wired to the wrong \
                             terminal.",
                            source.name
                        ),
                    });
                }
            }

            if let (Some(a), Some(b)) = (&ext.description, &tag.comment) {
                if a.trim() != b.trim() && !a.trim().is_empty() && !b.trim().is_empty() {
                    drifts.push(Drift {
                        kind: DriftKind::DescriptionDisagrees,
                        tag: tag.name.clone(),
                        counterpart: None,
                        source: source.name.clone(),
                        detail: format!("{}: \"{a}\". PLC: \"{b}\".", source.name),
                    });
                }
            }
        }
    }

    // Only worth reporting for the tags that reach the outside world. An
    // internal working bit is not expected on the HMI, and listing every one
    // would bury the real findings.
    if !sources.is_empty() {
        let io = crate::io::io_list(project);
        for point in &io.points {
            if !mentioned_by_someone.contains(&point.tag.to_lowercase()) {
                drifts.push(Drift {
                    kind: DriftKind::MissingFromSource,
                    tag: point.tag.clone(),
                    counterpart: None,
                    source: sources.iter().map(|s| s.name.as_str()).collect::<Vec<_>>().join(" or "),
                    detail: format!(
                        "{} is wired to hardware but no other list mentions it.",
                        point.tag
                    ),
                });
            }
        }
    }

    drifts.sort_by(|a, b| a.kind.cmp(&b.kind).then(a.tag.cmp(&b.tag)));

    if sources.is_empty() {
        notes.push(
            "Nothing to compare against. Drift needs at least one other list: an HMI tag export, \
             an I/O schedule, or a spec."
                .into(),
        );
    }
    notes.push(
        "Only names, addresses and descriptions are compared. Whether the tag means the same \
         thing in both places is not something LADX can check."
            .into(),
    );

    DriftReport { drifts, notes }
}

impl DriftReport {
    /// The ones that stop the plant, first.
    pub fn breaking(&self) -> Vec<&Drift> {
        self.drifts.iter().filter(|d| d.kind.breaks_at_runtime()).collect()
    }

    pub fn to_text(&self) -> String {
        if self.drifts.is_empty() {
            return format!(
                "The lists agree.\n\n{}\n",
                self.notes.iter().map(|n| format!("  {n}")).collect::<Vec<_>>().join("\n")
            );
        }
        let mut s = String::new();
        let breaking = self.breaking().len();
        s.push_str(&format!(
            "{} disagreement{} between the tag lists",
            self.drifts.len(),
            if self.drifts.len() == 1 { "" } else { "s" }
        ));
        if breaking > 0 {
            s.push_str(&format!(", {breaking} of which break at runtime"));
        }
        s.push_str(".\n\n");
        for d in &self.drifts {
            s.push_str(&format!("  {}\n", d.detail));
        }
        s.push('\n');
        for n in &self.notes {
            s.push_str(&format!("  {n}\n"));
        }
        s
    }
}
