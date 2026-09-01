//! The racks read out of a real L5X, and checked against the program.
//!
//! These live here rather than in ladx-ir because reading them needs the L5X
//! parser, and the parser depends on the IR.

use ladx_ir::hardware::{Finding, HardwareIssue};

fn cell() -> (ladx_ir::hardware::Hardware, ladx_ir::IrProject) {
    let bytes = std::fs::read(
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../../tests/fixtures/hardware/rack-with-faults.L5X"),
    )
    .unwrap();
    let import = ladx_parsers::l5x_ir::parse_to_ir(&bytes).unwrap();
    (import.hardware, import.project)
}

#[test]
fn the_racks_are_read_with_their_slots_and_revisions() {
    let (hw, _) = cell();
    assert_eq!(hw.modules.len(), 5);
    let di = hw.in_slot(1).unwrap();
    assert_eq!(di.name, "DI_01");
    assert_eq!(di.catalog.as_deref(), Some("1756-IB16"));
    assert_eq!(di.points, Some(16));
    assert_eq!(di.revision.as_deref(), Some("3.1"), "asked for at handover");
    assert!(hw.in_slot(3).unwrap().inhibited);
}

/// The slot is the address of the upstream port, not an attribute of the
/// module, and a module can have more than one port.
#[test]
fn the_slot_comes_from_the_port_that_faces_the_chassis() {
    let (hw, _) = cell();
    assert_eq!(hw.in_slot(6).map(|m| m.name.as_str()), Some("Spare_DI"));
    assert_eq!(hw.modules.iter().filter(|m| m.slot.is_none()).count(), 0);
}

/// The four faults that read the wrong terminal at runtime.
#[test]
fn it_finds_the_addresses_that_do_not_match_the_racks() {
    let (hw, project) = cell();
    let found = hw.check(&project);
    let has = |i: HardwareIssue| found.iter().find(|f| f.issue == i).cloned();

    let empty = has(HardwareIssue::NoModuleInSlot).expect("slot 7 is empty");
    assert!(empty.detail.contains("slot 7"));

    let over = has(HardwareIssue::PointBeyondCard).expect("point 20 on a 16-point card");
    assert!(over.detail.contains("the last one is 15"), "got: {}", over.detail);

    assert!(has(HardwareIssue::ModuleInhibited).is_some(), "an inhibited card never updates");
    assert!(has(HardwareIssue::WrongDirection).is_some(), "an output on an input card");

    for f in found.iter().filter(|f| f.issue != HardwareIssue::ModuleUnused) {
        assert!(f.issue.is_wrong_at_runtime(), "{:?}", f.issue);
    }
}

/// An address named directly in a rung is as real as one on a tag, and a check
/// that reads only the tag list finds nothing on half of real programs.
#[test]
fn addresses_written_straight_into_the_logic_are_checked_too() {
    let (hw, project) = cell();
    assert!(project.tags.iter().all(|t| t.address.is_none()), "none of these are on tags");
    assert!(!hw.check(&project).is_empty(), "and they are still checked");
}

/// A card nobody addresses is either spare or forgotten, and only that one.
#[test]
fn only_the_genuinely_unused_card_is_called_unused() {
    let (hw, project) = cell();
    let unused: Vec<Finding> = hw
        .check(&project)
        .into_iter()
        .filter(|f| f.issue == HardwareIssue::ModuleUnused)
        .collect();
    assert_eq!(
        unused.len(),
        1,
        "got {:?}",
        unused.iter().map(|f| &f.detail).collect::<Vec<_>>()
    );
    assert!(unused[0].detail.contains("Spare_DI"));
}

/// The controller and the comms card are not I/O and must not be reported as
/// unused simply because no rung addresses them.
#[test]
fn the_controller_is_not_reported_as_an_unused_card() {
    let (hw, project) = cell();
    assert!(!hw.check(&project).iter().any(|f| f.detail.contains("Local is in slot 0")));
}

/// A program export carries no module list, and that is different from a
/// controller with an empty rack.
#[test]
fn an_export_without_modules_says_so_rather_than_showing_an_empty_rack() {
    let bytes = std::fs::read(
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../../tests/golden/01-motor-starter.L5X"),
    )
    .unwrap();
    let import = ladx_parsers::l5x_ir::parse_to_ir(&bytes).unwrap();
    assert!(import.hardware.modules.is_empty());
    assert!(
        import.hardware.notes.iter().any(|n| n.contains("no module list")),
        "or every address looks unchecked for no stated reason"
    );
}
