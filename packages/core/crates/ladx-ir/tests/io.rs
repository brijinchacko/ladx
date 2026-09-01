//! The I/O list, read out of the fixtures.

use ladx_ir::io::{io_list, to_csv, SignalType};
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

#[test]
fn it_finds_the_points_that_meet_the_plant() {
    let l = io_list(&fixture("01-motor-starter"));
    // Four wired tags: three inputs and the motor.
    assert_eq!(l.points.len(), 4);
    assert_eq!(l.inputs(), 3);
    assert_eq!(l.outputs(), 1);
}

/// Internal tags are not I/O however they are named.
#[test]
fn internal_tags_are_left_out() {
    let l = io_list(&fixture("04-tank-filling"));
    assert!(
        !l.points.iter().any(|p| p.tag == "Filling"),
        "Filling is internal state, not a terminal"
    );
}

/// Analog or digital comes from the declared type, not from what somebody
/// called the device.
#[test]
fn a_real_tag_is_analogue_and_a_bool_is_not() {
    let l = io_list(&fixture("06-pid-loop"));
    let pv = l.points.iter().find(|p| p.tag == "PV_Temp").unwrap();
    assert_eq!(pv.signal, SignalType::AnalogInput);
    assert!(pv.signal.is_analog());

    let enable = l.points.iter().find(|p| p.tag == "Loop_Enable").unwrap();
    assert_eq!(enable.signal, SignalType::DigitalInput);
}

/// Each point knows where the program uses it, so it can be traced back.
#[test]
fn a_point_carries_where_it_is_used() {
    let l = io_list(&fixture("01-motor-starter"));
    let motor = l.points.iter().find(|p| p.tag == "Motor").unwrap();
    assert!(motor.used);
    assert!(!motor.used_in.is_empty());
    assert!(motor.used_in[0].contains("Main"));
}

/// Two tags on one terminal: only one of them is wired to it.
#[test]
fn two_points_on_one_address_are_reported_on_both() {
    let mut p = fixture("01-motor-starter");
    // Give the overload the same address as the stop button.
    for t in &mut p.tags {
        if t.name == "Overload_OK" {
            t.address = Some("I0.1".into());
        }
    }

    let l = io_list(&p);
    let clashes: Vec<&str> = l
        .issues
        .iter()
        .filter(|i| i.check == "duplicate-address")
        .map(|i| i.tag.as_str())
        .collect();

    // Reported against both, because opening either one should show it.
    assert_eq!(clashes.len(), 2);
    assert!(clashes.contains(&"Stop_PB"));
    assert!(clashes.contains(&"Overload_OK"));
}

/// An output nothing drives will sit at zero, which is worth knowing before
/// somebody is standing at the panel wondering why.
#[test]
fn an_output_nothing_drives_is_reported() {
    let mut p = fixture("01-motor-starter");
    p.tags.push(ladx_ir::Tag {
        name: "Spare_Lamp".into(),
        data_type: ladx_ir::DataType::Bool,
        address: Some("Q0.7".into()),
        initial_value: None,
        comment: Some("Spare indicator".into()),
        field: Some(ladx_ir::FieldDevice {
            direction: ladx_ir::IoDirection::Output,
            kind: Some(ladx_ir::DeviceKind::Lamp),
        }),
    });

    let l = io_list(&p);
    assert!(l
        .issues
        .iter()
        .any(|i| i.check == "output-never-driven" && i.tag == "Spare_Lamp"));
}

/// An input the program writes is either mislabelled or being overwritten.
#[test]
fn an_input_the_program_drives_is_reported() {
    let mut p = fixture("01-motor-starter");
    // Mark the motor as an input while the program still drives it.
    for t in &mut p.tags {
        if t.name == "Motor" {
            t.field = Some(ladx_ir::FieldDevice {
                direction: ladx_ir::IoDirection::Input,
                kind: Some(ladx_ir::DeviceKind::Sensor),
            });
        }
    }

    let l = io_list(&p);
    let issue = l
        .issues
        .iter()
        .find(|i| i.check == "input-written" && i.tag == "Motor")
        .expect("should be reported");
    assert!(issue.detail.contains("overwriting the field"));
}

/// A description is what somebody reads at the terminal.
#[test]
fn a_point_with_no_description_is_reported() {
    let mut p = fixture("01-motor-starter");
    for t in &mut p.tags {
        if t.name == "Motor" {
            t.comment = None;
        }
    }
    let l = io_list(&p);
    assert!(l.issues.iter().any(|i| i.check == "no-description" && i.tag == "Motor"));
}

/// A complete fixture is quiet, which is the half that decides whether anybody
/// keeps the check switched on.
#[test]
fn a_properly_described_project_reports_nothing() {
    let l = io_list(&fixture("01-motor-starter"));
    assert!(l.issues.is_empty(), "got {:?}", l.issues);
}

#[test]
fn the_csv_has_a_header_and_a_row_for_each_point() {
    let l = io_list(&fixture("01-motor-starter"));
    let csv = to_csv(&l);
    let lines: Vec<&str> = csv.trim().split('\n').collect();
    assert_eq!(lines[0], "Tag,Type,Device,Address,Description,Used in");
    assert_eq!(lines.len(), l.points.len() + 1);
    assert!(csv.contains("Motor,DO,Motor,Q0.0"));
}

/// A description with a comma must not become two columns.
#[test]
fn a_comma_in_a_description_is_quoted() {
    let l = io_list(&fixture("01-motor-starter"));
    let csv = to_csv(&l);
    // Stop_PB's description contains a comma in the fixture.
    assert!(
        csv.contains("\"Stop pushbutton, wired NC\""),
        "a comma has to be quoted or the columns shift:\n{csv}"
    );
}
