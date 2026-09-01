//! Which rules come back, and which must never be filtered away.

use ladx_rag::{applicable, orphaned, supersede};
use ladx_types::{Memory, MemoryKind, MemoryScope};

fn mem(id: &str, scope: MemoryScope, kind: MemoryKind, content: &str) -> Memory {
    Memory {
        id: id.into(),
        scope,
        kind,
        project: None,
        content: content.into(),
        reason: None,
        author: "brijin".into(),
        created_at: "2026-09-01T00:00:00Z".into(),
        supersedes: None,
        superseded_by: None,
    }
}

fn in_project(mut m: Memory, project: &str) -> Memory {
    m.project = Some(project.into());
    m
}

/// The rule the whole model turns on.
///
/// A forbidden rule is returned whether or not its words match the request. A
/// safety rule that goes missing because somebody phrased their question
/// differently is the failure this design exists to prevent, and there are few
/// enough of them that showing one that turns out not to apply costs almost
/// nothing.
#[test]
fn a_forbidden_rule_is_never_filtered_away_by_wording() {
    let memories = vec![mem(
        "1",
        MemoryScope::Company,
        MemoryKind::Forbidden,
        "Never use SET/RESET for a motor command.",
    )];

    // A request with no overlapping words at all.
    let out = applicable(&memories, "add a conveyor jam detector", None);
    assert_eq!(out.forbidden.len(), 1, "it must come back regardless");
    assert!(out.guidance.is_empty());
}

/// And it is never weighed against an approval.
#[test]
fn forbidden_and_approved_come_back_separately() {
    let memories = vec![
        mem("1", MemoryScope::User, MemoryKind::Forbidden, "Never bypass an interlock."),
        in_project(
            mem(
                "2",
                MemoryScope::Project,
                MemoryKind::Approved,
                "Use FB_MotorStandard for every motor.",
            ),
            "Line 4",
        ),
    ];
    let out = applicable(&memories, "add a motor", Some("Line 4"));

    assert_eq!(out.forbidden.len(), 1);
    assert_eq!(out.guidance.len(), 1);

    // The prompt puts the veto first and labels it as one.
    let p = out.to_prompt();
    let veto_at = p.find("must not be broken").unwrap();
    let guide_at = p.find("How this is done here").unwrap();
    assert!(veto_at < guide_at);
}

/// A site that does one thing differently is the common case.
#[test]
fn a_project_rule_outranks_the_company_one() {
    let memories = vec![
        mem("1", MemoryScope::Company, MemoryKind::Approved, "Motors use FB_MotorStandard."),
        in_project(
            mem("2", MemoryScope::Project, MemoryKind::Approved, "Motors use FB_MotorLine4."),
            "Line 4",
        ),
    ];
    let out = applicable(&memories, "add a motor to the line", Some("Line 4"));
    assert_eq!(out.guidance[0].id, "2", "the project rule comes first");
    assert_eq!(out.guidance.len(), 2, "and the company one is still offered");
}

/// A rule about another site's conveyors is noise here, however well it
/// matches.
#[test]
fn another_projects_rule_is_not_considered_at_all() {
    let memories = vec![in_project(
        mem("1", MemoryScope::Project, MemoryKind::Approved, "Conveyors run at 30 metres."),
        "Line 7",
    )];

    assert!(applicable(&memories, "conveyors", Some("Line 4")).is_empty());
    assert!(applicable(&memories, "conveyors", None).is_empty());
    assert_eq!(applicable(&memories, "conveyors", Some("Line 7")).guidance.len(), 1);
}

/// Even a forbidden rule stays inside its project.
#[test]
fn a_project_scoped_veto_does_not_leak_to_other_projects() {
    let memories = vec![in_project(
        mem("1", MemoryScope::Project, MemoryKind::Forbidden, "No soft starters on this line."),
        "Line 7",
    )];
    assert!(applicable(&memories, "add a motor", Some("Line 4")).forbidden.is_empty());
    assert_eq!(applicable(&memories, "add a motor", Some("Line 7")).forbidden.len(), 1);
}

/// Guidance that has nothing to do with the request stays out of it.
#[test]
fn irrelevant_guidance_is_not_offered() {
    let memories = vec![mem(
        "1",
        MemoryScope::Company,
        MemoryKind::Convention,
        "Instrument tags follow the ISA numbering.",
    )];
    assert!(applicable(&memories, "add a motor starter", None).guidance.is_empty());
}

/// An edit keeps the original, so an old suggestion can still be explained.
#[test]
fn editing_a_rule_supersedes_rather_than_overwrites() {
    let original = mem(
        "1",
        MemoryScope::Project,
        MemoryKind::Approved,
        "Motors use FB_MotorStandard.",
    );
    let original = in_project(original, "Line 4");

    let replacement = mem(
        "2",
        MemoryScope::User,
        MemoryKind::Approved,
        "Motors use FB_MotorStandard rev 3.",
    );

    let (old, new) = supersede(&original, replacement);

    assert_eq!(old.superseded_by.as_deref(), Some("2"));
    assert_eq!(new.supersedes.as_deref(), Some("1"));
    // The replacement inherits where the original applied, so an edit cannot
    // silently widen a project rule into a company one.
    assert_eq!(new.scope, MemoryScope::Project);
    assert_eq!(new.project.as_deref(), Some("Line 4"));

    // And the superseded one stops being used.
    let memories = vec![old, new];
    let out = applicable(&memories, "motors", Some("Line 4"));
    assert_eq!(out.guidance.len(), 1);
    assert_eq!(out.guidance[0].id, "2");
}

/// Offered for removal, never removed.
#[test]
fn rules_for_a_deleted_project_are_offered_rather_than_dropped() {
    let memories = vec![
        in_project(mem("1", MemoryScope::Project, MemoryKind::Note, "x"), "Gone"),
        in_project(mem("2", MemoryScope::Project, MemoryKind::Note, "y"), "Line 4"),
        mem("3", MemoryScope::Company, MemoryKind::Note, "z"),
    ];
    let orphans = orphaned(&memories, &["Line 4".to_string()]);
    assert_eq!(orphans.len(), 1);
    assert_eq!(orphans[0].id, "1");
}

/// The reason travels with the rule, because a rule with a reason survives the
/// person who wrote it leaving.
#[test]
fn the_reason_reaches_the_prompt() {
    let mut m = mem(
        "1",
        MemoryScope::Company,
        MemoryKind::Forbidden,
        "Never use SET/RESET for a motor command.",
    );
    m.reason = Some("A latched output survives a fault reset and restarts the motor.".into());

    let memories = vec![m];
    let out = applicable(&memories, "anything", None);
    assert!(out.to_prompt().contains("survives a fault reset"));
}

#[test]
fn nothing_remembered_produces_nothing() {
    assert!(applicable(&[], "add a motor", Some("Line 4")).is_empty());
    assert_eq!(applicable(&[], "x", None).to_prompt(), "");
}


/// Found by a failing test rather than by design.
///
/// Rules get written in the plural and requests in the singular. Matching them
/// exactly means the rule that exists for precisely this request never
/// surfaces, and nobody would ever diagnose it: the memory is right there on
/// the screen and silently never applies.
#[test]
fn a_plural_rule_matches_a_singular_request() {
    let memories = vec![mem(
        "1",
        MemoryScope::Company,
        MemoryKind::Approved,
        "Motors use FB_MotorStandard.",
    )];
    let out = applicable(&memories, "add a motor", None);
    assert_eq!(out.guidance.len(), 1, "the rule is about exactly this");
}

#[test]
fn and_the_other_way_round() {
    let memories = vec![mem(
        "1",
        MemoryScope::Company,
        MemoryKind::Convention,
        "A conveyor is numbered from the discharge.",
    )];
    assert_eq!(applicable(&memories, "renumber the conveyors", None).guidance.len(), 1);
}

/// Stemming must not turn short words into stubs that match everything.
#[test]
fn a_short_word_is_not_stemmed_into_noise() {
    let memories = vec![mem("1", MemoryScope::Company, MemoryKind::Note, "Gas detection is separate.")];
    // "gas" is under the length cut anyway; the point is that nothing matches
    // on a two-letter stem.
    assert!(applicable(&memories, "add a gate", None).guidance.is_empty());
}
