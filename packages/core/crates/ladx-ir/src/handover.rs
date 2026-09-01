//! The pack that gets handed to the customer at the end of a job.
//!
//! Handover is normally the worst week of a project: the engineering is done,
//! everybody has moved on, and somebody spends days assembling documents that
//! all describe a program they can no longer remember. What arrives is usually
//! late, partly stale, and impossible to check.
//!
//! Every document in this pack is generated from the program, so none of it can
//! disagree with the program. What it cannot do is make the pack complete: a
//! real handover contains wiring drawings, panel photographs, a commissioning
//! record and signed test sheets, and none of those exist inside a PLC file.
//! The manifest says so out loud rather than letting the size of the pack imply
//! it is finished.

use crate::docs::control_narrative;
use crate::drift::{drift, DriftReport, Source};
use crate::io::io_list;
use crate::sequence::sequences;
use crate::tests_gen::test_plan;
use crate::validation::{Level, Validation};
use crate::IrProject;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub struct PackFile {
    pub path: String,
    pub content: String,
    /// So the customer can prove the file they hold is the file that was sent.
    pub sha256: String,
    /// Why this file is in the pack.
    pub purpose: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub struct Pack {
    pub project: String,
    pub files: Vec<PackFile>,
    /// The level the program has actually reached, not the one wanted.
    pub level: Level,
    /// What a complete handover needs that is not, and cannot be, in here.
    pub not_included: Vec<String>,
    /// Things found while assembling the pack that somebody should look at
    /// before it is sent.
    pub concerns: Vec<String>,
}

fn hashed(path: &str, purpose: &str, content: String) -> PackFile {
    let sha256 = format!("{:x}", Sha256::digest(content.as_bytes()));
    PackFile { path: path.into(), purpose: purpose.into(), content, sha256 }
}

/// What the caller knows that the program does not: who validated it, and what
/// other tag lists exist to check against.
#[derive(Debug, Clone, Default)]
pub struct PackInputs<'a> {
    pub validation: Option<Validation>,
    pub other_tag_lists: &'a [Source],
    /// The racks, where the export carried them. A pack without a rack list is
    /// a pack nobody can order a spare from.
    pub hardware: Option<crate::hardware::Hardware>,
    /// Stamped into the manifest. Passed in because the IR has no clock.
    pub dated: Option<String>,
    pub prepared_by: Option<String>,
}

/// Assemble the pack.
pub fn pack(project: &IrProject, inputs: &PackInputs<'_>) -> Pack {
    let mut files = Vec::new();
    let mut concerns = Vec::new();

    let narrative = control_narrative(project);
    files.push(hashed(
        "01-control-narrative.md",
        "What the program does, in sentences, so somebody who has not read ladder can follow it.",
        narrative.to_markdown(),
    ));

    let io = io_list(project);
    files.push(hashed(
        "02-io-list.csv",
        "Every point wired to hardware, with its address and description.",
        crate::io::to_csv(&io),
    ));

    let seq = sequences(project);
    if !seq.sequences.is_empty() {
        files.push(hashed(
            "03-sequence-of-operation.md",
            "The steps the machine moves through, and what has to be true to move between them.",
            seq.sequences
                .iter()
                .map(|s| s.to_text())
                .chain(seq.notes.iter().cloned())
                .collect::<Vec<_>>()
                .join("\n"),
        ));
    }

    let plan = test_plan(project);
    files.push(hashed(
        "04-acceptance-tests.md",
        "Test steps to be carried out and signed. Not carried out by LADX.",
        plan.to_markdown(&format!("{}: acceptance tests", project.name)),
    ));
    if plan.safety_steps() == 0 {
        // "No safety tests" and "safety exists but does not reach the outputs"
        // are very different findings, and the second is the one worth acting
        // on: an E-stop that only resets a step register leaves the outputs it
        // was meant to drop energised.
        let safety: Vec<&str> = project
            .tags
            .iter()
            .map(|t| t.name.as_str())
            .filter(|n| crate::tests_gen::is_safety_tag(n))
            .collect();
        if safety.is_empty() {
            concerns.push(
                "No safety-related tag was found in this program at all. Either the safety \
                 functions live somewhere else, or there are none. Confirm which before sending \
                 the pack."
                    .into(),
            );
        } else {
            concerns.push(format!(
                "{} is in this program but does not appear directly on any output, so no output \
                 test depends on it. Check that the safety function actually drops the outputs \
                 rather than only changing state elsewhere.",
                safety.join(", ")
            ));
        }
    }

    if let Some(hw) = &inputs.hardware {
        if !hw.modules.is_empty() {
            let mut doc = format!("# {} hardware\n\n", project.name);
            doc.push_str(&hw.to_text());
            let findings = hw.check(project);
            if findings.is_empty() {
                doc.push_str("\nEvery address in the program lands on a card that is in the racks.\n");
            } else {
                doc.push_str("\n## Addresses that do not match the racks\n\n");
                for f in &findings {
                    doc.push_str(&format!("- {}\n", f.detail));
                }
            }
            files.push(hashed(
                "06-hardware.md",
                "The racks and the cards in them, with catalogue numbers and revisions.",
                doc,
            ));
            let breaking = findings.iter().filter(|f| f.issue.is_wrong_at_runtime()).count();
            if breaking > 0 {
                concerns.push(format!(
                    "{breaking} address{} in the program does not match the racks. Each one \
                     compiles and reads the wrong terminal.",
                    if breaking == 1 { "" } else { "es" }
                ));
            }
        }
    } else {
        concerns.push(
            "No hardware configuration was provided, so no address in the program has been \
             checked against a card. A module moved one slot leaves every address past it \
             compiling and reading the wrong terminal."
                .into(),
        );
    }

    let drift_report: DriftReport = drift(project, inputs.other_tag_lists);
    if !inputs.other_tag_lists.is_empty() {
        files.push(hashed(
            "05-tag-list-comparison.md",
            "Where the PLC, the HMI and the schedules stopped agreeing.",
            drift_report.to_text(),
        ));
        let breaking = drift_report.breaking().len();
        if breaking > 0 {
            concerns.push(format!(
                "{breaking} tag disagreement{} break at runtime. Handing over with these unresolved \
                 means the fault appears on site, not here.",
                if breaking == 1 { "s" } else { "" }
            ));
        }
    } else {
        concerns.push(
            "No HMI tag list or I/O schedule was provided, so nothing was checked against the \
             program. Drift between those lists is the commonest thing a handover hides."
                .into(),
        );
    }

    let level = inputs.validation.as_ref().map(|v| v.level).unwrap_or(Level::Generated);

    files.push(hashed(
        "00-manifest.md",
        "What is in the pack, what is not, and how far this program has been validated.",
        manifest(project, &files, level, inputs, &concerns),
    ));
    // The manifest lists the others, so it goes at the front once written.
    let m = files.pop().unwrap();
    files.insert(0, m);

    Pack {
        project: project.name.clone(),
        files,
        level,
        not_included: vec![
            "Wiring drawings, panel general arrangement and terminal schedules. These are not in \
             the PLC program and cannot be generated from it."
                .into(),
            "The commissioning record: what was actually adjusted on site, and why."
                .into(),
            "Signed test sheets. The acceptance tests in this pack are blank until somebody \
             carries them out."
                .into(),
            "Spare parts, manuals and vendor documentation for the equipment.".into(),
        ],
        concerns,
    }
}

fn manifest(
    project: &IrProject,
    files: &[PackFile],
    level: Level,
    inputs: &PackInputs<'_>,
    concerns: &[String],
) -> String {
    let mut s = format!("# {} handover pack\n\n", project.name);
    if let Some(d) = &inputs.dated {
        s.push_str(&format!("Dated {d}.  \n"));
    }
    if let Some(by) = &inputs.prepared_by {
        s.push_str(&format!("Prepared by {by}.  \n"));
    }
    s.push('\n');

    s.push_str("## How far this has been validated\n\n");
    s.push_str(&format!("**{}** — {}\n\n", level.label(), level.caveat()));
    if !level.is_production_ready() {
        s.push_str(
            "No level reachable by LADX means this program is ready to run a plant. Somebody \
             qualified has to review it, and it has to be tested on the machine.\n\n",
        );
    }
    if let Some(v) = &inputs.validation {
        if !v.evidence.is_empty() {
            s.push_str("What was run to earn it:\n\n");
            for e in &v.evidence {
                s.push_str(&format!("- {e}\n"));
            }
            s.push('\n');
        }
    }

    s.push_str("## Contents\n\n| File | What it is | SHA-256 |\n|---|---|---|\n");
    for f in files {
        s.push_str(&format!("| `{}` | {} | `{}` |\n", f.path, f.purpose, &f.sha256[..16]));
    }
    s.push_str(
        "\nThe checksums are the first 16 characters of the SHA-256 of each file. Recompute them \
         to prove the file you hold is the file that was sent.\n\n",
    );

    if !concerns.is_empty() {
        s.push_str("## Before this is sent\n\n");
        for c in concerns {
            s.push_str(&format!("- {c}\n"));
        }
        s.push('\n');
    }

    s.push_str("## Not in this pack\n\n");
    s.push_str(
        "Everything here was generated from the PLC program, so nothing here disagrees with the \
         program. That is also the limit: a complete handover needs wiring drawings, a \
         commissioning record, signed test sheets and equipment documentation, none of which \
         exist inside a PLC file.\n",
    );
    s
}

impl Pack {
    pub fn file(&self, path: &str) -> Option<&PackFile> {
        self.files.iter().find(|f| f.path == path)
    }
}
