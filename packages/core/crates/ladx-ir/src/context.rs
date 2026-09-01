//! The slice of a project a question is actually about.
//!
//! The rule this serves is that a whole project never goes to a model. A real
//! one is tens of thousands of tags; sending it is slow, expensive, and worst
//! of all it produces confident answers assembled from whichever part happened
//! to fit in the window, with no way to tell which part that was.
//!
//! So the question is read for the names it mentions, the graph says which
//! rungs touch those names, and only those rungs go. What comes back is
//! traceable: every line handed over can be pointed at in the program.
//!
//! It is deliberately literal about matching. Guessing that "the conveyor"
//! means `Conveyor1_Run` is the kind of helpfulness that answers confidently
//! about the wrong motor, so an unmatched question returns nothing found and
//! says so, and the caller can ask the person which tag they meant.

use crate::graph::ProjectGraph;
use crate::{IrProject, PouBody, neutral_text};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use ts_rs::TS;

/// One rung, as text a model can read and a person can find again.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct RungExcerpt {
    pub pou: String,
    pub rung: String,
    pub comment: Option<String>,
    /// The rung in Rockwell neutral text, which is compact and unambiguous.
    pub text: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct Context {
    /// Tags from the question that exist in this project.
    pub matched: Vec<String>,
    /// Words that looked like tag names and are not in this project.
    ///
    /// Returned rather than ignored so the caller can say "there is no tag
    /// called that" instead of answering about something else.
    pub unmatched: Vec<String>,
    pub rungs: Vec<RungExcerpt>,
    /// The shape of the project, which is small and always worth sending.
    pub summary: String,
    /// True when the question matched nothing and the caller should ask rather
    /// than answer.
    pub empty: bool,
}

/// How many rungs are worth sending before the answer stops improving.
const MAX_RUNGS: usize = 40;

/// Words in a question that could be a tag name.
///
/// Deliberately loose on what it collects and strict on what it keeps: a
/// candidate only survives if the project actually declares or uses it.
fn candidates(question: &str) -> Vec<String> {
    question
        .split(|c: char| !(c.is_alphanumeric() || c == '_' || c == '.'))
        .filter(|w| w.len() > 2)
        .map(|w| w.trim_matches('.').to_string())
        .filter(|w| !w.is_empty())
        .collect()
}

fn base(name: &str) -> &str {
    name.split(['.', '[']).next().unwrap_or(name)
}

pub fn context_for(project: &IrProject, question: &str) -> Context {
    let g = ProjectGraph::build(project);

    let known: BTreeSet<String> = project
        .tags
        .iter()
        .map(|t| base(&t.name).to_string())
        .chain(g.uses.iter().map(|u| u.tag.clone()))
        .collect();
    let pous: BTreeSet<&str> = project.pous.iter().map(|p| p.name.as_str()).collect();

    let mut matched: Vec<String> = Vec::new();
    let mut unmatched: Vec<String> = Vec::new();

    for word in candidates(question) {
        // Case insensitive, because nobody types a tag name exactly, and
        // matched against the base as well: somebody asking about
        // `Jam_Timer.DN` is asking about `Jam_Timer`, and the member is how
        // they will have seen it written on the rung.
        let hit = known
            .iter()
            .find(|k| k.eq_ignore_ascii_case(&word))
            .or_else(|| known.iter().find(|k| k.eq_ignore_ascii_case(base(&word))));
        match hit {
            Some(k) if !matched.contains(k) => matched.push(k.clone()),
            Some(_) => {}
            None => {
                // Only worth reporting if it looks like a tag rather than an
                // ordinary word: mixed case, an underscore, or a digit.
                let tagish = word.contains('_')
                    || word.chars().any(|c| c.is_ascii_digit())
                    || word.chars().any(|c| c.is_ascii_uppercase());
                if tagish && !pous.contains(word.as_str()) && !unmatched.contains(&word) {
                    unmatched.push(word);
                }
            }
        }
    }

    let mut wanted: BTreeSet<(&str, &str)> = BTreeSet::new();
    for tag in &matched {
        for u in g.uses_of(tag) {
            wanted.insert((u.pou.as_str(), u.rung.as_str()));
        }
    }

    let mut rungs = Vec::new();
    let mut truncated = false;
    for pou in &project.pous {
        let PouBody::Ladder { rungs: rs } = &pou.body else { continue };
        for rung in rs {
            if !wanted.contains(&(pou.name.as_str(), rung.id.as_str())) {
                continue;
            }
            if rungs.len() >= MAX_RUNGS {
                truncated = true;
                break;
            }
            rungs.push(RungExcerpt {
                pou: pou.name.clone(),
                rung: rung.id.clone(),
                comment: rung.comment.clone(),
                text: neutral_text::rung_to_text(rung).unwrap_or_else(|_| {
                    // A rung that cannot be written is still worth naming, and
                    // saying so beats sending nothing with no explanation.
                    "(this rung uses an instruction LADX cannot write out)".into()
                }),
            });
        }
    }

    let mut summary = format!(
        "{}: {} routine{}, {} tag{}",
        project.name,
        project.pous.len(),
        if project.pous.len() == 1 { "" } else { "s" },
        project.tags.len(),
        if project.tags.len() == 1 { "" } else { "s" },
    );
    if let Some(entry) = &project.entry_point {
        summary.push_str(&format!(", entry point {entry}"));
    }
    if truncated {
        summary.push_str(&format!(
            ". Only the first {MAX_RUNGS} matching rungs are included; there are more."
        ));
    }

    Context {
        empty: matched.is_empty(),
        matched,
        unmatched,
        rungs,
        summary,
    }
}

impl Context {
    /// The context as the text a model is given.
    ///
    /// Every line is something in the program. Nothing here is invented, and a
    /// caller can check any of it by opening the rung it names.
    pub fn to_prompt(&self) -> String {
        let mut s = String::new();
        s.push_str(&self.summary);
        s.push_str("\n\n");

        if self.empty {
            s.push_str(
                "Nothing in the question matches a tag in this project. Do not guess which tag \
                 was meant; ask.\n",
            );
            if !self.unmatched.is_empty() {
                s.push_str(&format!("Not found: {}\n", self.unmatched.join(", ")));
            }
            return s;
        }

        s.push_str(&format!("About: {}\n", self.matched.join(", ")));
        if !self.unmatched.is_empty() {
            s.push_str(&format!(
                "Also mentioned and not in this project: {}\n",
                self.unmatched.join(", ")
            ));
        }
        s.push_str("\nThe rungs that touch them:\n");
        for r in &self.rungs {
            s.push_str(&format!("\n{}/{}", r.pou, r.rung));
            if let Some(c) = &r.comment {
                s.push_str(&format!("  ({c})"));
            }
            s.push_str(&format!("\n  {}\n", r.text));
        }
        s
    }
}

/// Every tag in the project, for a caller that wants to offer a choice after a
/// question matched nothing.
pub fn tag_names(project: &IrProject) -> Vec<String> {
    let mut out: Vec<String> = project.tags.iter().map(|t| t.name.clone()).collect();
    out.sort();
    out.dedup();
    out
}
