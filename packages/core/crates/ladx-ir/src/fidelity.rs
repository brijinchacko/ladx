//! How well something survived a conversion, and how to say so.
//!
//! The rule this exists to enforce is that LADX never claims a conversion was
//! better than it was. The dangerous case is not the instruction that fails to
//! convert, which is obvious and gets fixed. It is the one that converts into
//! something that looks right, compiles, and behaves differently: a Siemens
//! retentive timer becoming a Rockwell TON, an edge instruction whose scan
//! semantics do not match, a comparison whose type promotion differs.
//!
//! So every mapping carries a verdict, and "it worked" and "it worked, but a
//! person needs to look at it" are different verdicts rather than shades of the
//! same one.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use ts_rs::TS;

/// What happened to one thing during a conversion.
///
/// Ordered from best to worst so that a report can be sorted and the worst put
/// in front of somebody first.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub enum Fidelity {
    /// Mapped with no loss of meaning. The target does the same thing.
    Exact,
    /// Mapped, and the target does nearly the same thing. The difference is
    /// known and stated. Never used as a polite word for "we guessed".
    Approximate,
    /// Not mapped, and not representable. The original is kept so nothing is
    /// destroyed, but the target project will not do this until somebody
    /// writes it.
    Unsupported,
    /// Not translated, carried through untouched.
    ///
    /// Different from `Unsupported`: this is content LADX deliberately does not
    /// interpret, such as vendor attributes it has no opinion about, and
    /// passing it along unchanged is the correct outcome rather than a
    /// shortfall.
    Preserved,
    /// Mapped, but a person has to confirm it before it is trusted.
    ///
    /// The worst verdict on purpose. Anything a reviewer must see ranks below
    /// anything they need not.
    ManualReview,
}

impl Fidelity {
    /// Whether this verdict has to reach a human before the result is used.
    pub fn needs_human(self) -> bool {
        matches!(self, Fidelity::Unsupported | Fidelity::ManualReview)
    }

    pub fn label(self) -> &'static str {
        match self {
            Fidelity::Exact => "EXACT",
            Fidelity::Approximate => "APPROXIMATE",
            Fidelity::Unsupported => "UNSUPPORTED",
            Fidelity::Preserved => "PRESERVED",
            Fidelity::ManualReview => "MANUAL REVIEW REQUIRED",
        }
    }
}

/// One line of a conversion report.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct FidelityNote {
    pub fidelity: Fidelity,
    /// What this is about, in the source's own terms: `"MainRoutine rung 12"`,
    /// `"PID"`, `"Tag Motor_101"`. Written so somebody can find the thing.
    pub subject: String,
    /// Why it got this verdict. For anything but `Exact` this must say what
    /// the difference is, not merely that there is one.
    pub detail: String,
}

/// What a whole conversion did.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct ConversionReport {
    pub notes: Vec<FidelityNote>,
}

impl ConversionReport {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add(&mut self, fidelity: Fidelity, subject: impl Into<String>, detail: impl Into<String>) {
        self.notes.push(FidelityNote {
            fidelity,
            subject: subject.into(),
            detail: detail.into(),
        });
    }

    pub fn exact(&mut self, subject: impl Into<String>) {
        self.add(Fidelity::Exact, subject, "");
    }

    /// How many of each, for the summary line.
    ///
    /// The plan's example is "143 instructions exact, 12 approximate, 4
    /// unsupported, 2 require manual review", and this is what produces it.
    pub fn counts(&self) -> BTreeMap<Fidelity, usize> {
        let mut out = BTreeMap::new();
        for n in &self.notes {
            *out.entry(n.fidelity).or_insert(0) += 1;
        }
        out
    }

    /// Whether anything in here has to be looked at before the result is used.
    pub fn needs_human(&self) -> bool {
        self.notes.iter().any(|n| n.fidelity.needs_human())
    }

    /// The notes a reviewer has to see, worst first.
    pub fn for_review(&self) -> Vec<&FidelityNote> {
        let mut out: Vec<&FidelityNote> =
            self.notes.iter().filter(|n| n.fidelity.needs_human()).collect();
        out.sort_by(|a, b| b.fidelity.cmp(&a.fidelity));
        out
    }

    /// One line, in the plan's own shape.
    pub fn summary(&self) -> String {
        let c = self.counts();
        let n = |f: Fidelity| c.get(&f).copied().unwrap_or(0);
        format!(
            "{} exact, {} approximate, {} unsupported, {} preserved, {} require manual review",
            n(Fidelity::Exact),
            n(Fidelity::Approximate),
            n(Fidelity::Unsupported),
            n(Fidelity::Preserved),
            n(Fidelity::ManualReview),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_clean_conversion_needs_nobody() {
        let mut r = ConversionReport::new();
        r.exact("MainRoutine rung 1");
        r.exact("MainRoutine rung 2");
        assert!(!r.needs_human());
        assert!(r.for_review().is_empty());
        assert_eq!(r.counts()[&Fidelity::Exact], 2);
    }

    /// Approximate must not quietly pass as fine, and must not be treated as a
    /// failure either. It is the verdict for a mapping that works with a stated
    /// difference, and the difference is the point.
    #[test]
    fn approximate_is_reported_but_does_not_demand_review() {
        let mut r = ConversionReport::new();
        r.add(
            Fidelity::Approximate,
            "TON Jam_Timer",
            "Rockwell presets are milliseconds and the source used a time literal; \
             rounded to the nearest millisecond.",
        );
        assert!(!r.needs_human());
        assert_eq!(r.counts()[&Fidelity::Approximate], 1);
    }

    #[test]
    fn unsupported_and_manual_review_both_reach_a_person() {
        let mut r = ConversionReport::new();
        r.exact("rung 1");
        r.add(Fidelity::Unsupported, "PID", "No equivalent; original preserved.");
        r.add(Fidelity::ManualReview, "SFC MachineSeq", "Carried as source text.");
        r.add(Fidelity::Preserved, "Vendor attributes", "Kept verbatim.");

        assert!(r.needs_human());
        let review = r.for_review();
        assert_eq!(review.len(), 2);
        // Worst first: manual review outranks unsupported.
        assert_eq!(review[0].fidelity, Fidelity::ManualReview);
        assert_eq!(review[1].fidelity, Fidelity::Unsupported);
    }

    /// Preserved is a success, not a shortfall. Content LADX has no opinion
    /// about and passes through untouched has been handled correctly.
    #[test]
    fn preserved_does_not_demand_review() {
        assert!(!Fidelity::Preserved.needs_human());
        assert!(Fidelity::Unsupported.needs_human());
    }

    #[test]
    fn the_summary_reads_like_the_plan() {
        let mut r = ConversionReport::new();
        for i in 0..143 {
            r.exact(format!("rung {i}"));
        }
        for i in 0..12 {
            r.add(Fidelity::Approximate, format!("t{i}"), "differs");
        }
        for i in 0..4 {
            r.add(Fidelity::Unsupported, format!("u{i}"), "no equivalent");
        }
        for i in 0..2 {
            r.add(Fidelity::ManualReview, format!("m{i}"), "check this");
        }
        assert_eq!(
            r.summary(),
            "143 exact, 12 approximate, 4 unsupported, 0 preserved, 2 require manual review"
        );
    }

    /// The ordering is load-bearing: `for_review` sorts on it.
    #[test]
    fn worse_verdicts_sort_last() {
        assert!(Fidelity::Exact < Fidelity::Approximate);
        assert!(Fidelity::Approximate < Fidelity::Unsupported);
        assert!(Fidelity::Unsupported < Fidelity::ManualReview);
    }

    #[test]
    fn a_report_round_trips() {
        let mut r = ConversionReport::new();
        r.add(Fidelity::Unsupported, "PID", "No equivalent.");
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("unsupported"));
        let back: ConversionReport = serde_json::from_str(&json).unwrap();
        assert_eq!(back, r);
    }
}
