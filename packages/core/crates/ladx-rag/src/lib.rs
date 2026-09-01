//! Which of the remembered rules apply to what somebody is doing now.
//!
//! The failure this is built to avoid is a memory system that is technically
//! correct and practically useless: it surfaces forty entries, most of them
//! true and irrelevant, and the engineer stops reading them. So retrieval is
//! deliberately conservative. It would rather return three rules that certainly
//! apply than twelve that might.
//!
//! Two things are not negotiable in the ordering.
//!
//! **A forbidden rule is never scored against an approved one.** They come back
//! in separate lists. Weighing them would mean a sufficiently specific approval
//! could outrank a safety rule, and there is no scoring scheme where that is
//! the right answer.
//!
//! **Narrower beats broader.** A rule written for this project beats the
//! company's, which beats a personal preference. A site that does one thing
//! differently is the common case and it has to win without argument.
//!
//! There is no embedding model here and that is a choice rather than a gap. The
//! desktop has no network and the matching this needs is over short engineering
//! rules against a short request, where word overlap is transparent, fast and
//! explainable. A retrieval somebody cannot second-guess is one they cannot
//! trust when it is wrong.

use ladx_types::{Memory, MemoryKind, MemoryScope};

pub fn ladx_rag_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// What applies, split so a veto cannot be traded against a preference.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Applicable<'a> {
    /// Rules that stop something. Always shown, never ranked away.
    pub forbidden: Vec<&'a Memory>,
    /// Everything else that applies, most specific first.
    pub guidance: Vec<&'a Memory>,
}

impl Applicable<'_> {
    pub fn is_empty(&self) -> bool {
        self.forbidden.is_empty() && self.guidance.is_empty()
    }

    /// The rules as text for a prompt, forbidden first and labelled as such.
    pub fn to_prompt(&self) -> String {
        if self.is_empty() {
            return String::new();
        }
        let mut s = String::new();

        if !self.forbidden.is_empty() {
            s.push_str("Rules that must not be broken:\n");
            for m in &self.forbidden {
                s.push_str(&format!("  - {}", m.content));
                if let Some(r) = &m.reason {
                    s.push_str(&format!("  ({r})"));
                }
                s.push('\n');
            }
            s.push('\n');
        }

        if !self.guidance.is_empty() {
            s.push_str("How this is done here:\n");
            for m in &self.guidance {
                s.push_str(&format!("  - {}", m.content));
                if let Some(r) = &m.reason {
                    s.push_str(&format!("  ({r})"));
                }
                s.push('\n');
            }
        }
        s
    }
}

/// Words worth matching on.
///
/// Short words are dropped because they match everything: a rule about motors
/// and a request about valves both contain "the".
///
/// A trailing "s" is dropped too, and that one is not a nicety. Engineering
/// rules are written in the plural, "Motors use FB_MotorStandard", and requests
/// are written in the singular, "add a motor". Matching them exactly means the
/// rule that exists for precisely this request never surfaces, which was the
/// behaviour before this line and is the kind of miss nobody would ever
/// diagnose: the memory is there, it looks right on the screen, and it silently
/// never applies.
fn terms(text: &str) -> Vec<String> {
    text.split(|c: char| !(c.is_alphanumeric() || c == '_'))
        .filter(|w| w.len() > 3)
        .map(|w| {
            let lower = w.to_lowercase();
            match lower.strip_suffix('s') {
                // Only when what is left is still a word rather than a stub,
                // so "gas" does not become "ga".
                Some(stem) if stem.len() > 3 => stem.to_string(),
                _ => lower,
            }
        })
        .collect()
}

/// How well one rule matches a request.
///
/// Overlap of distinctive words, weighted by how specific the rule's scope is.
/// Deliberately simple: the whole value of this is that somebody can look at a
/// surfaced rule and see why it was surfaced.
fn score(memory: &Memory, request_terms: &[String]) -> u32 {
    let rule_terms = terms(&memory.content);
    let overlap = rule_terms.iter().filter(|t| request_terms.contains(t)).count() as u32;
    if overlap == 0 {
        return 0;
    }
    overlap * 10 + u32::from(memory.specificity())
}

/// Which remembered rules apply to this request.
///
/// `project` narrows it: rules scoped to a different project are not
/// considered at all, because a rule about another site's conveyors is noise
/// here however well its words match.
pub fn applicable<'a>(
    memories: &'a [Memory],
    request: &str,
    project: Option<&str>,
) -> Applicable<'a> {
    let request_terms = terms(request);
    let mut forbidden: Vec<&Memory> = Vec::new();
    let mut scored: Vec<(u32, &Memory)> = Vec::new();

    for m in memories {
        // A superseded entry is history, not guidance.
        if !m.is_current() {
            continue;
        }
        // A project rule belongs to its project and nowhere else.
        if m.scope == MemoryScope::Project {
            match (&m.project, project) {
                (Some(p), Some(here)) if p == here => {}
                _ => continue,
            }
        }

        if m.kind.is_veto() {
            // Every forbidden rule in scope is returned, matching or not.
            //
            // Filtering these by word overlap is how a safety rule goes
            // missing because somebody phrased the request differently. There
            // are not many of them, and the cost of showing one that turns out
            // not to apply is far below the cost of hiding one that did.
            forbidden.push(m);
            continue;
        }

        let s = score(m, &request_terms);
        if s > 0 {
            scored.push((s, m));
        }
    }

    scored.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.id.cmp(&b.1.id)));
    forbidden.sort_by(|a, b| b.specificity().cmp(&a.specificity()).then(a.id.cmp(&b.id)));

    Applicable { forbidden, guidance: scored.into_iter().map(|(_, m)| m).collect() }
}

/// Replace a rule, keeping the old one.
///
/// Returns the edited original and the replacement, so a caller writes both.
/// Overwriting instead would make "why did it suggest that last month"
/// unanswerable the moment somebody rewords a rule.
pub fn supersede(previous: &Memory, mut replacement: Memory) -> (Memory, Memory) {
    let mut old = previous.clone();
    old.superseded_by = Some(replacement.id.clone());
    replacement.supersedes = Some(previous.id.clone());
    replacement.scope = previous.scope;
    replacement.project = previous.project.clone();
    (old, replacement)
}

/// Rules that only ever applied to a project that no longer exists.
///
/// Offered for removal rather than removed: deleting somebody's written
/// knowledge without asking is exactly the behaviour that makes a memory
/// system untrustworthy.
pub fn orphaned<'a>(memories: &'a [Memory], known_projects: &[String]) -> Vec<&'a Memory> {
    memories
        .iter()
        .filter(|m| m.is_current() && m.scope == MemoryScope::Project)
        .filter(|m| match &m.project {
            Some(p) => !known_projects.contains(p),
            None => true,
        })
        .collect()
}

/// Whether a rule mentions something, for showing where it came from.
pub fn mentions(memory: &Memory, term: &str) -> bool {
    terms(&memory.content).iter().any(|t| t == &term.to_lowercase())
}

/// Kinds, for a caller building a form.
pub const KINDS: [MemoryKind; 4] = [
    MemoryKind::Forbidden,
    MemoryKind::Approved,
    MemoryKind::Convention,
    MemoryKind::Note,
];
