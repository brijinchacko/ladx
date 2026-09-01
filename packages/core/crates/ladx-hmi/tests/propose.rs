//! Screens proposed from the fixtures.

use ladx_hmi::propose::{propose, Control};
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

fn binding<'a>(p: &'a ladx_hmi::propose::Proposal, tag: &str) -> &'a ladx_hmi::propose::ProposedBinding {
    p.screens
        .iter()
        .flat_map(|s| &s.bindings)
        .find(|b| b.tag == tag)
        .unwrap_or_else(|| panic!("{tag} was not proposed"))
}

/// A pushbutton is pressed and a selector is left where it is put. Getting
/// these the same way round is most of what makes a screen usable.
#[test]
fn a_momentary_button_and_a_maintained_selector_are_told_apart() {
    let p = propose(&fixture("04-tank-filling"));
    assert_eq!(binding(&p, "Auto_Sel").control, Control::Maintained);

    let p = propose(&fixture("01-motor-starter"));
    assert_eq!(binding(&p, "Start_PB").control, Control::Momentary);
}

/// A motor is shown, not pressed.
#[test]
fn an_output_is_an_indicator() {
    let p = propose(&fixture("01-motor-starter"));
    assert_eq!(binding(&p, "Motor").control, Control::Indicator);
}

/// A fault belongs on the alarm screen rather than beside the equipment.
#[test]
fn a_latched_fault_goes_to_the_alarm_screen() {
    let p = propose(&fixture("03-conveyor"));
    let alarms = p.screens.iter().find(|s| s.name == "Alarms").expect("an alarm screen");
    assert!(alarms.bindings.iter().any(|b| b.tag == "Jam_Alarm"));

    // And not on the overview, even though it is wired to a lamp.
    let overview = p.screens.iter().find(|s| s.name == "Overview").unwrap();
    assert!(!overview.bindings.iter().any(|b| b.tag == "Jam_Alarm"));
}

/// The label comes from the description when there is one.
#[test]
fn a_description_becomes_the_label() {
    let p = propose(&fixture("03-conveyor"));
    assert_eq!(binding(&p, "PE_Discharge").label, "Photocell at the discharge end");
}

/// And when there is not, the tag name is tidied and nothing is invented.
///
/// An operator screen that says something the tag table does not is worse than
/// one that reads a little technically.
#[test]
fn a_missing_description_is_not_invented() {
    let p = propose(&fixture("03-conveyor"));
    // Jam_Alarm has no description in the fixture.
    assert_eq!(binding(&p, "Jam_Alarm").label, "Jam Alarm");
}

/// Every proposal says why, so a reviewer can disagree with it.
#[test]
fn every_binding_says_why_it_was_proposed() {
    for slug in ["01-motor-starter", "03-conveyor", "04-tank-filling", "06-pid-loop"] {
        for s in propose(&fixture(slug)).screens {
            for b in s.bindings {
                assert!(!b.because.is_empty(), "{slug}/{} has no reason", b.tag);
                assert!(!b.label.is_empty(), "{slug}/{} has no label", b.tag);
            }
        }
    }
}

/// An analogue output is something to set, not something to watch.
#[test]
fn an_analogue_output_is_a_setpoint() {
    let p = propose(&fixture("06-pid-loop"));
    assert_eq!(binding(&p, "CV_Heater").control, Control::Setpoint);
    assert_eq!(binding(&p, "PV_Temp").control, Control::Indicator);
}

/// The limits are stated rather than left for somebody to discover.
#[test]
fn it_says_what_it_cannot_decide() {
    let p = propose(&fixture("01-motor-starter"));
    assert!(
        p.notes.iter().any(|n| n.contains("judgements about the plant")),
        "layout and permissions are not the program's to answer"
    );
}

/// A tag labelled from its name is counted and said, because only the tag
/// table can fix it.
#[test]
fn undescribed_tags_are_counted_in_the_notes() {
    let p = propose(&fixture("03-conveyor"));
    assert!(
        p.notes.iter().any(|n| n.contains("labelled from the tag name")),
        "got {:?}",
        p.notes
    );
}

/// A program with nothing wired proposes nothing and says why, rather than
/// producing an empty screen that looks like a failure.
#[test]
fn a_program_with_no_io_says_so() {
    let mut project = fixture("01-motor-starter");
    for t in &mut project.tags {
        t.field = None;
    }
    let p = propose(&project);
    assert!(p.screens.is_empty());
    assert!(p.notes.iter().any(|n| n.contains("nothing to propose")));
}

/// The most important test in this file.
///
/// An E-stop is hardwired. One that can be pressed from a screen is not an
/// E-stop, and a guard interlock that can be satisfied from a screen is a
/// bypass. The first version of this proposed EStop_OK as a button an operator
/// presses, because it is wired as a normally closed pushbutton and that is
/// what the device says. Being right about the wiring and wrong about the
/// consequence is exactly the failure worth a test.
#[test]
fn a_safety_device_is_never_proposed_as_a_control() {
    let p = propose(&fixture("03-conveyor"));

    let estop = binding(&p, "EStop_OK");
    assert_eq!(estop.control, Control::Indicator, "an E-stop is shown, never pressed");
    assert!(estop.because.contains("not a safety device"));

    // And it is not on the screen of things an operator changes.
    let controls = p.screens.iter().find(|s| s.name == "Controls").unwrap();
    assert!(
        !controls.bindings.iter().any(|b| b.tag == "EStop_OK"),
        "it must not appear among the controls"
    );
}

/// A guard interlock is the same argument.
#[test]
fn a_guard_interlock_is_shown_rather_than_operable() {
    let p = propose(&fixture("07-alarm-handling"));
    // Guard_Closed is wired as a sensor, so it would be an indicator anyway;
    // what matters is that the reason says why, so nobody later "fixes" it
    // into a control.
    let guard = binding(&p, "Guard_Closed");
    assert_eq!(guard.control, Control::Indicator);
    assert!(guard.because.contains("safety circuit"));
}

/// The limit of the check is stated, because it matches on a name and will
/// miss a safety device called something else.
#[test]
fn it_admits_the_safety_check_is_only_a_name_match() {
    let p = propose(&fixture("03-conveyor"));
    let note = p
        .notes
        .iter()
        .find(|n| n.contains("safety circuit"))
        .expect("the limit has to be said");
    assert!(note.contains("will miss one that is named differently"));
}

/// An ordinary stop button is still a control: the check must not sweep in
/// everything that stops something.
#[test]
fn an_ordinary_stop_button_is_still_a_control() {
    let p = propose(&fixture("01-motor-starter"));
    assert_eq!(binding(&p, "Stop_PB").control, Control::Momentary);
}
