//! How far something has been checked, said in one word.
//!
//! The failure this prevents is not a lie. It is an omission: a rung is
//! generated, it passes LADX's own structural checks, and nothing on screen
//! distinguishes that from a rung a vendor compiler has accepted. Somebody
//! downloads it to a controller on the strength of a green tick that meant
//! something much smaller than they read it as.
//!
//! So a level is attached to the artefact and travels with it, and each level
//! names what was actually done rather than how confident anybody feels.
//!
//! The levels are not a score. Level 4 is not "better" than level 2; it is a
//! different and stronger claim, made by a different party. LADX can award
//! itself up to level 2. Levels 3 and 4 require vendor software to have said
//! something, and LADX cannot grant them however well its own checks went.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub enum Level {
    /// A model wrote it and nothing has looked at it.
    Generated,
    /// LADX's own structural checks passed: the rungs parse, the references
    /// resolve, nothing is malformed.
    Structural,
    /// Generic IEC validation passed. Still nobody's compiler.
    Iec,
    /// A vendor tool imported it without rejecting it. It is a real file for
    /// that platform; whether it compiles is a further question.
    VendorImported,
    /// A vendor compiler accepted it. The strongest thing a file can be
    /// without running.
    VendorCompiled,
    /// It ran, against tests, and they passed.
    Simulated,
}

impl Level {
    /// What was actually done, for putting on screen.
    pub fn label(self) -> &'static str {
        match self {
            Level::Generated => "Written, not checked",
            Level::Structural => "LADX checks passed",
            Level::Iec => "IEC validation passed",
            Level::VendorImported => "Imported by vendor software",
            Level::VendorCompiled => "Compiled by vendor software",
            Level::Simulated => "Tested in simulation",
        }
    }

    /// The sentence that stops somebody reading more into it than is there.
    pub fn caveat(self) -> &'static str {
        match self {
            Level::Generated => {
                "Nothing has examined this yet. Read every rung before it goes anywhere."
            }
            Level::Structural => {
                "LADX checked its own structure. No compiler has seen it, and structure being \
                 right says nothing about the logic being right."
            }
            Level::Iec => {
                "Valid IEC 61131-3. Vendors differ from the standard and from each other, so this \
                 is not a statement about any particular platform."
            }
            Level::VendorImported => {
                "The vendor tool read it. It has not compiled it, so type and reference errors \
                 are still ahead."
            }
            Level::VendorCompiled => {
                "The vendor compiler accepted it. It has never run, and compiling says nothing \
                 about whether the machine does the right thing."
            }
            Level::Simulated => {
                "Passed the tests written for it, in LADX simulation. That is not a factory \
                 acceptance test and does not replace one."
            }
        }
    }

    /// Whether LADX is allowed to award this level to its own work.
    ///
    /// The rule the whole thing turns on. Levels above IEC are claims about
    /// what somebody else's software did, and no amount of internal checking
    /// can produce one.
    pub fn is_self_awardable(self) -> bool {
        matches!(self, Level::Generated | Level::Structural | Level::Iec)
    }

    /// Whether this is safe to describe as ready for a controller.
    ///
    /// Nothing is. The method exists so that the answer is written down once
    /// rather than assumed differently in each place that asks.
    pub fn is_production_ready(self) -> bool {
        false
    }
}

/// A level, with the evidence for it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Validation {
    pub level: Level,
    /// What was run, named. "LADX structural checks", "TIA Portal V21 compile".
    pub evidence: Vec<String>,
    /// Vendor software, where a level above IEC is claimed. Required for those
    /// levels and refused without it.
    pub vendor: Option<String>,
    pub vendor_version: Option<String>,
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum ClaimError {
    #[error(
        "{level:?} is a claim about vendor software and needs the vendor and version named; \
         LADX cannot award it from its own checks"
    )]
    NeedsVendor { level: Level },
    #[error("a level has to say what was run to earn it")]
    NoEvidence,
}

impl Validation {
    /// Claim a level, with what earned it.
    ///
    /// Refuses rather than downgrades. A caller asking for level 4 without a
    /// compiler result has made a mistake, and quietly recording level 2
    /// instead would hide it in exactly the place where hiding it is worst.
    pub fn claim(
        level: Level,
        evidence: Vec<String>,
        vendor: Option<(String, String)>,
    ) -> Result<Self, ClaimError> {
        if evidence.is_empty() {
            return Err(ClaimError::NoEvidence);
        }
        if !level.is_self_awardable() && vendor.is_none() {
            return Err(ClaimError::NeedsVendor { level });
        }
        let (v, ver) = match vendor {
            Some((a, b)) => (Some(a), Some(b)),
            None => (None, None),
        };
        Ok(Validation { level, evidence, vendor: v, vendor_version: ver })
    }

    /// What LADX can say about its own output, and no more.
    pub fn ladx_structural(evidence: Vec<String>) -> Self {
        Validation {
            level: Level::Structural,
            evidence,
            vendor: None,
            vendor_version: None,
        }
    }

    /// One line, for a badge.
    pub fn summary(&self) -> String {
        match (&self.vendor, &self.vendor_version) {
            (Some(v), Some(ver)) => format!("{} ({v} {ver})", self.level.label()),
            _ => self.level.label().to_string(),
        }
    }
}
