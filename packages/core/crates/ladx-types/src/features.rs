//! What can be switched on before it is finished.
//!
//! The rule this exists to serve is that existing behaviour stays the default.
//! Everything here is off until somebody deliberately turns it on, so a build
//! that ships mid-way through a phase behaves exactly like the build before it
//! for anyone who does not opt in.
//!
//! The list lives in Rust because both sides need it and they must not drift:
//! the vendor bridges gate on it, and so does the UI that decides whether to
//! show a tool at all.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// How finished something is, said out loud.
///
/// The product rule is that LADX never misrepresents capability, and the way
/// that rule usually breaks is not a lie but an omission: a feature ships, it
/// works on the developer's fixtures, and nothing on screen distinguishes that
/// from working against real vendor software. So maturity is a property of the
/// flag rather than a note in a changelog, and the UI is expected to show it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum Maturity {
    /// Written down, no implementation.
    Planned,
    /// Implemented and tested against LADX's own fixtures only. Mock tests
    /// prove architecture; they prove nothing about vendor compatibility.
    Experimental,
    /// Works, and is expected to keep working.
    Available,
    /// Verified against the real thing: actual vendor software, a named
    /// version, a recorded import and compile result.
    Validated,
}

/// A capability that can be turned on independently.
///
/// The wire names are the dotted ones from the product plan, kept literally so
/// that a flag discussed in writing and a flag in a settings file are
/// obviously the same thing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub enum FeatureFlag {
    #[serde(rename = "vendor.siemens")]
    VendorSiemens,
    #[serde(rename = "vendor.rockwell")]
    VendorRockwell,
    #[serde(rename = "engineering.io")]
    EngineeringIo,
    #[serde(rename = "engineering.hardware")]
    EngineeringHardware,
    #[serde(rename = "engineering.alarms")]
    EngineeringAlarms,
    #[serde(rename = "engineering.analysis")]
    EngineeringAnalysis,
    #[serde(rename = "engineering.diff")]
    EngineeringDiff,
    #[serde(rename = "memory.project")]
    MemoryProject,
    #[serde(rename = "memory.company")]
    MemoryCompany,
    #[serde(rename = "documents.autogenerate")]
    DocumentsAutogenerate,
    #[serde(rename = "hmi.vendorExport")]
    HmiVendorExport,
}

impl FeatureFlag {
    pub const ALL: [FeatureFlag; 11] = [
        FeatureFlag::VendorSiemens,
        FeatureFlag::VendorRockwell,
        FeatureFlag::EngineeringIo,
        FeatureFlag::EngineeringHardware,
        FeatureFlag::EngineeringAlarms,
        FeatureFlag::EngineeringAnalysis,
        FeatureFlag::EngineeringDiff,
        FeatureFlag::MemoryProject,
        FeatureFlag::MemoryCompany,
        FeatureFlag::DocumentsAutogenerate,
        FeatureFlag::HmiVendorExport,
    ];

    /// The dotted name, as stored and as written about.
    pub fn id(self) -> &'static str {
        match self {
            FeatureFlag::VendorSiemens => "vendor.siemens",
            FeatureFlag::VendorRockwell => "vendor.rockwell",
            FeatureFlag::EngineeringIo => "engineering.io",
            FeatureFlag::EngineeringHardware => "engineering.hardware",
            FeatureFlag::EngineeringAlarms => "engineering.alarms",
            FeatureFlag::EngineeringAnalysis => "engineering.analysis",
            FeatureFlag::EngineeringDiff => "engineering.diff",
            FeatureFlag::MemoryProject => "memory.project",
            FeatureFlag::MemoryCompany => "memory.company",
            FeatureFlag::DocumentsAutogenerate => "documents.autogenerate",
            FeatureFlag::HmiVendorExport => "hmi.vendorExport",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            FeatureFlag::VendorSiemens => "Siemens TIA Portal",
            FeatureFlag::VendorRockwell => "Studio 5000 and L5X",
            FeatureFlag::EngineeringIo => "I/O engineering",
            FeatureFlag::EngineeringHardware => "Hardware configuration",
            FeatureFlag::EngineeringAlarms => "Alarm engineering",
            FeatureFlag::EngineeringAnalysis => "Analyse project",
            FeatureFlag::EngineeringDiff => "Compare projects",
            FeatureFlag::MemoryProject => "Project memory",
            FeatureFlag::MemoryCompany => "Company standards",
            FeatureFlag::DocumentsAutogenerate => "Generate documents from the project",
            FeatureFlag::HmiVendorExport => "Export HMI to a vendor format",
        }
    }

    /// Where this stands today.
    ///
    /// Every flag starts `Planned`, and moving one is a deliberate edit made
    /// with evidence, not a side effect of writing some code. `Validated` in
    /// particular requires a recorded result against named vendor software.
    pub fn maturity(self) -> Maturity {
        // Deliberately not a match over every variant. A new flag should start
        // Planned without anyone having to remember to say so; claiming more
        // is the edit that needs thought, not claiming less.
        Maturity::Planned
    }
}

/// Which capabilities are on.
///
/// Empty is the default and means the product behaves exactly as it did before
/// any of this existed.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub struct FeatureSet {
    #[serde(default)]
    pub enabled: Vec<FeatureFlag>,
}

impl FeatureSet {
    pub fn is_on(&self, flag: FeatureFlag) -> bool {
        self.enabled.contains(&flag)
    }

    pub fn enable(&mut self, flag: FeatureFlag) {
        if !self.is_on(flag) {
            self.enabled.push(flag);
        }
    }

    pub fn disable(&mut self, flag: FeatureFlag) {
        self.enabled.retain(|f| *f != flag);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nothing_is_on_by_default() {
        let f = FeatureSet::default();
        for flag in FeatureFlag::ALL {
            assert!(!f.is_on(flag), "{} was on by default", flag.id());
        }
    }

    /// The stored name and the name in the plan are the same string.
    ///
    /// Worth asserting: the enum variant and the wire name are written in two
    /// different places, and a rename that touches one and not the other turns
    /// every stored setting into an unrecognised flag that silently reads as
    /// off.
    #[test]
    fn the_wire_name_is_the_documented_name() {
        for flag in FeatureFlag::ALL {
            let json = serde_json::to_string(&flag).unwrap();
            assert_eq!(json, format!("\"{}\"", flag.id()), "{flag:?} disagrees with its id");
        }
    }

    #[test]
    fn a_flag_survives_a_round_trip() {
        let mut f = FeatureSet::default();
        f.enable(FeatureFlag::VendorSiemens);
        f.enable(FeatureFlag::VendorSiemens);
        assert_eq!(f.enabled.len(), 1, "enabling twice should not duplicate");

        let json = serde_json::to_string(&f).unwrap();
        let back: FeatureSet = serde_json::from_str(&json).unwrap();
        assert_eq!(back, f);

        f.disable(FeatureFlag::VendorSiemens);
        assert!(!f.is_on(FeatureFlag::VendorSiemens));
    }

    /// Settings written before flags existed still read.
    #[test]
    fn an_absent_feature_set_is_an_empty_one() {
        let f: FeatureSet = serde_json::from_str("{}").unwrap();
        assert!(f.enabled.is_empty());
    }

    /// Nothing claims to be finished yet, and the test is here so that moving
    /// one is a visible decision rather than a quiet edit.
    #[test]
    fn every_flag_is_still_planned() {
        for flag in FeatureFlag::ALL {
            assert_eq!(
                flag.maturity(),
                Maturity::Planned,
                "{} claims to be further along than it is; if that is true, \
                 change this test deliberately and say what proved it",
                flag.id()
            );
        }
    }

    #[test]
    fn ids_are_unique() {
        let mut ids: Vec<&str> = FeatureFlag::ALL.iter().map(|f| f.id()).collect();
        ids.sort_unstable();
        let before = ids.len();
        ids.dedup();
        assert_eq!(before, ids.len(), "two flags share an id");
    }
}
