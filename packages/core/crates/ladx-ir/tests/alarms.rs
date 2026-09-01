//! Alarm discovery, and the restraint that decides whether the list is used.

use ladx_ir::alarms::{alarm_list, to_csv, Confidence};
use ladx_ir::IrProject;
use std::path::PathBuf;

fn fixture(slug: &str) -> IrProject {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../..")
        .join("tests/fixtures/projects")
        .join(slug)
        .join("project.ir.json");
    serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap()
}

/// The fixture built out of latched alarms with a shared reset.
#[test]
fn it_finds_the_alarms() {
    let l = alarm_list(&fixture("07-alarm-handling"));
    let tags: Vec<&str> = l.alarms.iter().map(|a| a.tag.as_str()).collect();

    for expected in ["Alm_EStop", "Alm_Guard", "Alm_Motor"] {
        assert!(tags.contains(&expected), "missing {expected}, got {tags:?}");
    }
}

/// Named like an alarm and latched is the clearest case there is.
#[test]
fn a_named_latch_is_reported_as_clear() {
    let l = alarm_list(&fixture("07-alarm-handling"));
    let a = l.alarms.iter().find(|a| a.tag == "Alm_EStop").unwrap();
    assert_eq!(a.confidence, Confidence::Clear);
    assert!(a.latched);
    assert!(!a.raised_by.is_empty());
    assert!(!a.cleared_by.is_empty(), "the fixture resets all three on one rung");
}

/// The restraint that decides whether anybody uses the list.
///
/// A plain coil on a tag not named like an alarm is every output in the
/// program. Reporting them all produces a list somebody has to prune, which is
/// the work this is supposed to remove.
#[test]
fn ordinary_outputs_are_not_called_alarms() {
    let l = alarm_list(&fixture("01-motor-starter"));
    assert!(l.alarms.is_empty(), "a motor is not an alarm: {:?}", l.alarms);

    let l = alarm_list(&fixture("02-reversing-motor"));
    assert!(l.alarms.is_empty(), "nor are two contactors: {:?}", l.alarms);
}

/// A latch that is not named like an alarm is reported, but honestly: a
/// sequence step latches too.
#[test]
fn an_unnamed_latch_is_likely_rather_than_clear() {
    let l = alarm_list(&fixture("04-tank-filling"));
    let filling = l.alarms.iter().find(|a| a.tag == "Filling").expect("a latch is a candidate");
    assert_eq!(filling.confidence, Confidence::Likely);
    assert!(
        filling.evidence.contains("could also be a sequence step"),
        "the doubt has to travel with it: {}",
        filling.evidence
    );
}

/// The conveyor latches its jam alarm and never clears it.
#[test]
fn an_alarm_with_no_reset_is_reported() {
    let l = alarm_list(&fixture("03-conveyor"));
    let a = l.alarms.iter().find(|a| a.tag == "Jam_Alarm").expect("found");
    assert!(a.cleared_by.is_empty());

    let issue = l
        .issues
        .iter()
        .find(|i| i.check == "no-reset" && i.tag == "Jam_Alarm")
        .expect("reported");
    assert!(issue.detail.contains("until the controller restarts"));
}

/// An alarm with no message leaves the operator reading a tag name.
#[test]
fn an_alarm_with_no_message_is_reported() {
    let l = alarm_list(&fixture("03-conveyor"));
    assert!(l.issues.iter().any(|i| i.check == "no-message" && i.tag == "Jam_Alarm"));
}

/// Two alarms worded the same are indistinguishable on a screen.
#[test]
fn two_alarms_with_the_same_message_are_reported() {
    let mut p = fixture("07-alarm-handling");
    for t in &mut p.tags {
        if t.name == "Alm_Guard" || t.name == "Alm_Motor" {
            t.comment = Some("Machine fault".into());
        }
    }
    let l = alarm_list(&p);
    assert!(
        l.issues.iter().any(|i| i.check == "duplicate-message"),
        "got {:?}",
        l.issues.iter().map(|i| &i.check).collect::<Vec<_>>()
    );
}

/// Silence about a routine nobody read reads as "no alarms there".
#[test]
fn it_says_which_routines_it_could_not_read() {
    let mut p = fixture("07-alarm-handling");
    p.pous.push(ladx_ir::Pou {
        name: "Faults".into(),
        kind: ladx_ir::PouKind::Program,
        body: ladx_ir::PouBody::StructuredText { source: "// alarms here".into() },
        local_tags: vec![],
        comment: None,
        container: None,
    });
    let l = alarm_list(&p);
    assert!(l.issues.iter().any(|i| i.check == "not-examined" && i.detail.contains("Faults")));
}

/// Every alarm carries why it was called one, so somebody can disagree.
#[test]
fn every_alarm_says_why_it_is_one() {
    for slug in ["03-conveyor", "04-tank-filling", "07-alarm-handling"] {
        for a in alarm_list(&fixture(slug)).alarms {
            assert!(!a.evidence.is_empty(), "{slug}/{} has no evidence", a.tag);
            assert!(!a.raised_by.is_empty(), "{slug}/{} names nowhere", a.tag);
        }
    }
}

#[test]
fn the_csv_reads_as_an_alarm_schedule() {
    let l = alarm_list(&fixture("07-alarm-handling"));
    let csv = to_csv(&l);
    assert!(csv.starts_with("Tag,Message,Latched,Raised by,Cleared by,Confidence"));
    assert!(csv.contains("Alm_EStop"));
    assert!(csv.contains(",yes,"), "latched alarms are marked");
}

/// Found by reading the schedule rather than the assertions.
///
/// A summary bit and an annunciator horn look exactly like alarms: named like
/// one, driven like one. They are not conditions, and an alarm schedule that
/// lists "Any_Alarm" and "Alarm_Horn" beside the three real faults is one
/// somebody has to prune before it can be used.
#[test]
fn a_summary_bit_is_marked_as_one_rather_than_listed_as_a_fault() {
    let l = alarm_list(&fixture("07-alarm-handling"));

    let summary = l.alarms.iter().find(|a| a.tag == "Any_Alarm").expect("still listed");
    assert!(summary.follows_other_alarms);
    assert!(summary.evidence.contains("summarises them"));

    // And the real faults are not.
    for tag in ["Alm_EStop", "Alm_Guard", "Alm_Motor"] {
        let a = l.alarms.iter().find(|a| a.tag == tag).unwrap();
        assert!(!a.follows_other_alarms, "{tag} is a fault, not a summary");
    }
}

/// The horn is gated by a timer as well as by the summary bit, and a timer is
/// a timing element rather than a separate thing going wrong. Counting it as a
/// condition kept the horn off the summary list.
#[test]
fn a_timer_does_not_make_an_annunciator_look_like_a_fault() {
    let l = alarm_list(&fixture("07-alarm-handling"));
    let horn = l.alarms.iter().find(|a| a.tag == "Alarm_Horn").expect("listed");
    assert!(horn.follows_other_alarms, "the horn sounds for alarms, it is not one");
}

/// Conditions come first, because somebody reading the top of a schedule wants
/// the faults rather than the horn that sounds for them.
#[test]
fn conditions_are_listed_before_summaries() {
    let l = alarm_list(&fixture("07-alarm-handling"));
    let first_summary = l.alarms.iter().position(|a| a.follows_other_alarms).unwrap();
    let last_condition = l.alarms.iter().rposition(|a| !a.follows_other_alarms).unwrap();
    assert!(last_condition < first_summary);
}

#[test]
fn the_csv_says_which_is_which() {
    let csv = to_csv(&alarm_list(&fixture("07-alarm-handling")));
    assert!(csv.contains(",condition\n"));
    assert!(csv.contains(",summary\n"));
}
