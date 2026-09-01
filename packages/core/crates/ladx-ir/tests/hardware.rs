//! What the program addresses, against what is in the racks.

use ladx_ir::hardware::*;

fn module(name: &str, slot: u32, catalog: &str) -> Module {
    Module {
        name: name.into(),
        kind: kind_for(catalog),
        points: points_for(catalog),
        catalog: Some(catalog.into()),
        slot: Some(slot),
        parent: Some("Local".into()),
        revision: None,
        inhibited: false,
    }
}

#[test]
fn a_catalogue_number_says_what_the_card_is_and_how_many_points() {
    assert_eq!(kind_for("1756-IB16"), ModuleKind::DigitalInput);
    assert_eq!(points_for("1756-IB16"), Some(16));
    assert_eq!(kind_for("1756-OB16E"), ModuleKind::DigitalOutput);
    assert_eq!(points_for("1756-OB32"), Some(32));
    assert_eq!(kind_for("1756-IF8"), ModuleKind::AnalogInput);
    assert_eq!(kind_for("1756-OF8"), ModuleKind::AnalogOutput);
    assert_eq!(kind_for("1756-L83E"), ModuleKind::Controller);
    assert_eq!(kind_for("1756-EN2T"), ModuleKind::Communications);
}

/// Guessing the point count from a catalogue number LADX does not recognise
/// would produce confident wrong findings about the end of a card.
#[test]
fn an_unrecognised_catalogue_number_gives_no_point_count_rather_than_a_guess() {
    assert_eq!(points_for("1756-XYZ"), None);
    assert_eq!(points_for("SOMETHING-12"), None, "12 is not a card size");
    assert_eq!(kind_for("WIDGET"), ModuleKind::Other);
}

#[test]
fn a_slot_address_is_read_and_anything_else_is_not_invented() {
    let a = parse_address("Local:2:I.Data.3").unwrap();
    assert_eq!(a.slot, 2);
    assert!(a.input);
    assert_eq!(a.point, Some(3));

    assert!(!parse_address("Local:2:O.Data.0").unwrap().input);

    // A Siemens byte address names no slot, so there is nothing to check it
    // against and no finding to make.
    assert!(parse_address("I0.1").is_none());
    assert!(parse_address("Q0.0").is_none());
    assert!(parse_address("Motor_Run").is_none());
}

/// An address that is correct must produce nothing. A checker that flags
/// everything gets switched off.
#[test]
fn correct_addresses_are_silent() {
    let hw = Hardware {
        modules: vec![
            module("Local", 0, "1756-L83E"),
            module("DI", 1, "1756-IB16"),
            module("DO", 2, "1756-OB16E"),
        ],
        notes: vec![],
    };
    let mut p = ladx_ir::IrProject::new("t");
    p.tags = vec![
        ladx_ir::Tag {
            name: "In".into(),
            data_type: ladx_ir::DataType::Bool,
            address: Some("Local:1:I.Data.0".into()),
            initial_value: None,
            comment: None,
            field: None,
        },
        ladx_ir::Tag {
            name: "Out".into(),
            data_type: ladx_ir::DataType::Bool,
            address: Some("Local:2:O.Data.15".into()),
            initial_value: None,
            comment: None,
            field: None,
        },
    ];
    assert!(hw.check(&p).is_empty(), "got {:?}", hw.check(&p));
}

/// A file with no module list is not a file with an empty rack.
#[test]
fn no_module_list_is_said_out_loud() {
    let hw = Hardware::default();
    let p = ladx_ir::IrProject::new("t");
    assert!(hw.check(&p).is_empty(), "nothing to check against, so no findings");
    assert!(hw.to_text().contains("No hardware configuration"));
}
