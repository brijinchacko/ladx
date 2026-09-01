//! What goes to a model, and mostly what does not.

use ladx_ir::context::context_for;
use ladx_ir::IrProject;
use std::path::PathBuf;

fn fixture(slug: &str) -> IrProject {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../..")
        .join("tests/fixtures/projects")
        .join(slug)
        .join("project.ir.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

/// Only the rungs the question is about.
#[test]
fn it_sends_the_relevant_rungs_and_not_the_rest() {
    let p = fixture("07-alarm-handling");
    let c = context_for(&p, "why is Alm_Guard latching?");

    assert_eq!(c.matched, vec!["Alm_Guard"]);
    assert!(!c.rungs.is_empty());

    // Seven rungs in the fixture; only the three that touch Alm_Guard go: the
    // one that latches it, the shared reset, and the summary.
    assert_eq!(c.rungs.len(), 3, "sent {} rungs of 7", c.rungs.len());

    let text = c.to_prompt();
    assert!(text.contains("Alm_Guard"));

    // Alm_Motor does appear, and correctly: one rung resets all three alarms
    // together, so it genuinely mentions it. What must not appear is the rung
    // that only concerns Alm_Motor.
    assert!(
        !c.rungs.iter().any(|r| r.comment.as_deref() == Some("Latch Alm_Motor")),
        "the other alarm's own rung is not part of this question"
    );
    assert!(
        !c.rungs.iter().any(|r| r.text.contains("Horn_Timer")),
        "the horn has nothing to do with it"
    );
}

/// The whole project is never sent, even for a question about a busy tag.
#[test]
fn a_question_about_one_tag_does_not_pull_in_the_project() {
    let p = fixture("08-multi-step-sequence");
    let c = context_for(&p, "what sets Clamp?");
    assert_eq!(c.matched, vec!["Clamp"]);
    assert!(c.rungs.len() <= 2, "Clamp appears on at most two rungs");
}

/// The trap: answering confidently about the wrong thing.
///
/// A question naming a tag that is not in the project must not be quietly
/// answered from whatever else was to hand.
#[test]
fn a_tag_that_is_not_there_is_said_rather_than_substituted() {
    let p = fixture("01-motor-starter");
    let c = context_for(&p, "why won't Conveyor_17 start?");

    assert!(c.empty, "nothing matched");
    assert!(c.rungs.is_empty(), "and nothing was sent anyway");
    assert!(c.unmatched.contains(&"Conveyor_17".to_string()));

    let prompt = c.to_prompt();
    assert!(prompt.contains("Do not guess"), "the model is told not to guess");
    assert!(prompt.contains("Conveyor_17"));
}

/// Ordinary words are not reported as missing tags.
#[test]
fn ordinary_words_are_not_mistaken_for_tags() {
    let p = fixture("01-motor-starter");
    let c = context_for(&p, "why will the motor not start when i press the button");
    // "motor" matches Motor case-insensitively; the rest is prose and must not
    // come back as a list of tags that do not exist.
    assert_eq!(c.matched, vec!["Motor"]);
    assert!(c.unmatched.is_empty(), "got {:?}", c.unmatched);
}

/// Nobody types a tag name exactly.
#[test]
fn matching_is_case_insensitive() {
    let p = fixture("01-motor-starter");
    let c = context_for(&p, "what drives motor");
    assert_eq!(c.matched, vec!["Motor"], "and comes back spelled as the project spells it");
}

/// A member reference is a reference to its tag.
#[test]
fn a_done_bit_finds_its_timer() {
    let p = fixture("03-conveyor");
    let c = context_for(&p, "when does Jam_Timer.DN come on?");
    assert!(c.matched.contains(&"Jam_Timer".to_string()));
    assert!(!c.rungs.is_empty());
}

/// Everything sent is something in the program, and can be found again.
#[test]
fn every_line_sent_names_where_it_came_from() {
    let p = fixture("03-conveyor");
    let c = context_for(&p, "explain Conveyor and Jam_Alarm");
    for r in &c.rungs {
        assert!(!r.pou.is_empty());
        assert!(!r.rung.is_empty());
        assert!(!r.text.is_empty());
        assert!(c.to_prompt().contains(&format!("{}/{}", r.pou, r.rung)));
    }
}

/// The project's shape is small and always worth sending.
#[test]
fn the_summary_says_what_the_project_is() {
    let c = context_for(&fixture("08-multi-step-sequence"), "explain Step");
    assert!(c.summary.contains("Drill station"));
    assert!(c.summary.contains("2 routines"));
    assert!(c.summary.contains("entry point Main"));
}

/// An instruction LADX cannot write out still names its rung rather than
/// silently going missing.
#[test]
fn a_rung_that_cannot_be_written_is_still_accounted_for() {
    let c = context_for(&fixture("06-pid-loop"), "explain CV_Heater");
    assert!(!c.rungs.is_empty());
    assert!(c.rungs.iter().all(|r| !r.text.is_empty()));
}
