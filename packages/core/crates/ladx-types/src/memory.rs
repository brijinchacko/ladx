//! What LADX has been told to remember about how work is done here.
//!
//! Not the assistant's chat history, which is a different thing stored
//! elsewhere. This is engineering knowledge: that motors use `FB_MotorStandard`
//! on this site, that nobody is to write SET/RESET for a motor command, that
//! this customer numbers their conveyors from the discharge end.
//!
//! Three rules shape the model, and each of them is there because the opposite
//! is what makes a memory system untrustworthy.
//!
//! **Nothing is remembered invisibly.** Every entry has an author, a time and a
//! scope, and can be listed, edited and deleted. A tool that quietly accumulates
//! opinions about somebody's work and then acts on them is one they will stop
//! believing the first time it is wrong and they cannot find out why.
//!
//! **Nothing is lost when it is changed.** An edit supersedes rather than
//! overwrites, so "why did it suggest that" can be answered for a suggestion
//! made last month against a rule that has since been reworded.
//!
//! **Forbidden outranks approved.** They are different kinds rather than
//! opposite ends of one scale, because a conflict between them is not a tie to
//! be broken by whichever scored higher. If something is forbidden here, that
//! is the answer.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Who a piece of knowledge applies to.
///
/// Ordered narrowest first: a project rule beats a company one, which beats a
/// personal preference. That order is the whole point of having scopes, because
/// the common real case is a site that does one thing differently from the rest
/// of the company and needs that to win without arguing about it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum MemoryScope {
    /// Everything on this machine, for this engineer.
    User,
    /// Every project this company does.
    Company,
    /// This project only.
    Project,
}

/// What kind of thing is being remembered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
#[serde(rename_all = "camelCase")]
pub enum MemoryKind {
    /// How things are named or arranged. "Conveyors number from the discharge."
    Convention,
    /// Something to use. "Use FB_MotorStandard for all DOL motors."
    Approved,
    /// Something never to do. "Never use SET/RESET for a motor command."
    ///
    /// Not the negative of Approved. A forbidden rule is a veto, and it is
    /// checked separately rather than weighed against anything.
    Forbidden,
    /// A fact worth carrying that is not a rule. "The customer's spare parts
    /// list is maintained by their maintenance team, not by us."
    Note,
}

impl MemoryKind {
    /// Whether this stops something rather than suggesting something.
    pub fn is_veto(self) -> bool {
        matches!(self, MemoryKind::Forbidden)
    }
}

/// One thing LADX has been told.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub struct Memory {
    pub id: String,
    pub scope: MemoryScope,
    pub kind: MemoryKind,
    /// The project this belongs to, when the scope is Project.
    #[serde(default)]
    pub project: Option<String>,
    /// The rule itself, in the words whoever wrote it used.
    pub content: String,
    /// Why, when somebody bothered to say. Worth keeping separately: a rule
    /// with a reason survives the person who wrote it leaving.
    #[serde(default)]
    pub reason: Option<String>,
    /// Who added it. Never blank in practice, and never inferred.
    pub author: String,
    /// When, as an ISO 8601 string. Passed in rather than taken from the clock
    /// so that callers stay testable and so that importing history keeps its
    /// own dates.
    pub created_at: String,
    /// The entry this one replaces, when it is an edit.
    ///
    /// Superseding rather than overwriting is what makes "why did it suggest
    /// that last month" answerable after the rule has been reworded.
    #[serde(default)]
    pub supersedes: Option<String>,
    /// Set when a later entry replaced this one. A superseded entry is kept
    /// and is not used for retrieval.
    #[serde(default)]
    pub superseded_by: Option<String>,
}

impl Memory {
    /// Whether this is the current version of its rule.
    pub fn is_current(&self) -> bool {
        self.superseded_by.is_none()
    }

    /// How specific this is, for ordering. Higher wins.
    pub fn specificity(&self) -> u8 {
        match self.scope {
            MemoryScope::Project => 3,
            MemoryScope::Company => 2,
            MemoryScope::User => 1,
        }
    }
}

/// The older, narrower model.
///
/// Kept because generated bindings and stored documents refer to it. Nothing
/// new should use it; [`Memory`] is what the rest of this is built on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub enum MemoryCollection {
    ProjectContext,
    AcceptedPairs,
    CuratedPatterns,
    ForbiddenPatterns,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub struct MemoryEntry {
    pub id: String,
    pub collection: MemoryCollection,
    pub content: String,
    pub label: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn m(scope: MemoryScope, kind: MemoryKind) -> Memory {
        Memory {
            id: "1".into(),
            scope,
            kind,
            project: None,
            content: "x".into(),
            reason: None,
            author: "someone".into(),
            created_at: "2026-09-01T00:00:00Z".into(),
            supersedes: None,
            superseded_by: None,
        }
    }

    /// A site that does one thing differently from the rest of the company is
    /// the common case, and it has to win without anybody arguing about it.
    #[test]
    fn a_project_rule_outranks_a_company_one() {
        assert!(
            m(MemoryScope::Project, MemoryKind::Approved).specificity()
                > m(MemoryScope::Company, MemoryKind::Approved).specificity()
        );
        assert!(
            m(MemoryScope::Company, MemoryKind::Approved).specificity()
                > m(MemoryScope::User, MemoryKind::Approved).specificity()
        );
    }

    /// Forbidden is a veto rather than a strong preference. If it were scored
    /// against Approved, a sufficiently specific approval would beat a safety
    /// rule, which is the wrong answer every time.
    #[test]
    fn forbidden_is_a_veto_and_approved_is_not() {
        assert!(m(MemoryScope::User, MemoryKind::Forbidden).kind.is_veto());
        assert!(!m(MemoryScope::Project, MemoryKind::Approved).kind.is_veto());
    }

    #[test]
    fn an_entry_is_current_until_something_replaces_it() {
        let mut e = m(MemoryScope::Project, MemoryKind::Convention);
        assert!(e.is_current());
        e.superseded_by = Some("2".into());
        assert!(!e.is_current());
    }

    /// A stored entry written before the optional fields existed still loads.
    #[test]
    fn the_optional_fields_are_optional() {
        let json = r#"{
            "id": "1",
            "scope": "project",
            "kind": "forbidden",
            "content": "Never use SET/RESET for a motor command.",
            "author": "brijin",
            "created_at": "2026-09-01T00:00:00Z"
        }"#;
        let e: Memory = serde_json::from_str(json).expect("should load");
        assert_eq!(e.kind, MemoryKind::Forbidden);
        assert!(e.is_current());
        assert_eq!(e.project, None);
        assert_eq!(e.reason, None);
    }

    #[test]
    fn it_round_trips() {
        let mut e = m(MemoryScope::Company, MemoryKind::Approved);
        e.reason = Some("It handles the overload reset the way the client expects.".into());
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains("company"));
        assert!(json.contains("approved"));
        assert_eq!(serde_json::from_str::<Memory>(&json).unwrap(), e);
    }
}
