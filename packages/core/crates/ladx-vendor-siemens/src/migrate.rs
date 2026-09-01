//! Rockwell to Siemens, through the IR.
//!
//! Never directly. The rule the whole conversion story rests on is that every
//! pair goes source → parser → IR → exporter, because the alternative is a
//! matrix: six vendors is thirty converters, each with its own bugs, and each
//! needing a fix six times. Through the IR it is six readers and six writers.
//!
//! What this adds over calling the two halves by hand is the joint account.
//! An engineer being handed a converted project does not care which half lost
//! something; they care what is different and where to look. So the reports are
//! merged, the summary counts both, and anything needing a human from either
//! side ends up in one list.
//!
//! **This has never been imported by TIA Portal.** It produces SCL that is
//! correct by construction and by reading. Whether S7 accepts it is a different
//! claim and nobody has tested it.

use ladx_ir::fidelity::{ConversionReport, Fidelity};
use ladx_ir::{IrProject, PouBody};
use std::collections::BTreeMap;

use crate::scl::{declarations, pou_to_scl};

/// One converted routine.
pub struct MigratedPou {
    pub name: String,
    /// The static declarations the block needs: timer and edge instances.
    pub declarations: String,
    pub source: String,
}

/// A project, converted.
pub struct Migration {
    pub project: IrProject,
    pub pous: Vec<MigratedPou>,
    /// Both halves, merged. Reading and writing are one job to whoever gets
    /// the result.
    pub report: ConversionReport,
}

impl Migration {
    /// The line the plan asks for: "143 exact, 12 approximate, 4 unsupported".
    pub fn summary(&self) -> String {
        self.report.summary()
    }

    /// Whether somebody has to look at this before it is used.
    pub fn needs_review(&self) -> bool {
        self.report.needs_human()
    }

    /// Everything as one SCL file, declarations first.
    pub fn to_source(&self) -> String {
        let mut s = String::new();
        for p in &self.pous {
            s.push_str(&format!("// ── {} ──\n", p.name));
            if !p.declarations.is_empty() {
                s.push_str(&p.declarations);
                s.push('\n');
            }
            s.push_str(&p.source);
            s.push('\n');
        }
        s
    }
}

/// Convert an IR project to Siemens SCL.
pub fn ir_to_siemens(project: &IrProject, mut report: ConversionReport) -> Migration {
    let mut pous = Vec::new();

    for pou in &project.pous {
        match &pou.body {
            PouBody::Ladder { .. } => {
                let out = pou_to_scl(pou);
                // Merged rather than kept apart: whoever reads this does not
                // care which half a finding came from.
                report.notes.extend(out.report.notes);
                pous.push(MigratedPou {
                    name: pou.name.clone(),
                    declarations: declarations(&out.instances),
                    source: out.source,
                });
            }
            PouBody::StructuredText { source } => {
                // Structured text is close enough between the two that carrying
                // it is better than refusing it, and far enough apart that
                // saying so matters: S7 has its own types, its own timer calls
                // and its own literals.
                report.add(
                    Fidelity::ManualReview,
                    pou.name.clone(),
                    "Structured text was carried across unchanged. SCL is close to IEC ST but \
                     not identical: types, timer calls and time literals all differ, so this \
                     will not compile until somebody reads it.",
                );
                pous.push(MigratedPou {
                    name: pou.name.clone(),
                    declarations: String::new(),
                    source: source.clone(),
                });
            }
            other => {
                report.add(
                    Fidelity::Unsupported,
                    pou.name.clone(),
                    format!(
                        "{} is {} and LADX cannot convert it. Nothing was written for it, so the \
                         converted project is short this routine.",
                        pou.name,
                        other.language_name()
                    ),
                );
            }
        }
    }

    Migration { project: project.clone(), pous, report }
}

/// Read an L5X and convert it, in one step.
pub fn l5x_to_siemens(bytes: &[u8]) -> Result<Migration, ladx_parsers::ParseError> {
    let import = ladx_parsers::l5x_ir::parse_to_ir(bytes)?;
    // The import's own findings come first: a tag whose type was guessed on
    // the way in is still a guess after it is written out.
    Ok(ir_to_siemens(&import.project, import.report))
}

/// What a conversion did, counted by verdict.
pub fn counts(report: &ConversionReport) -> BTreeMap<Fidelity, usize> {
    report.counts()
}
