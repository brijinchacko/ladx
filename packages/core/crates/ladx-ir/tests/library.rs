//! The blocks that get written again on every job.

use ladx_ir::library::*;
use ladx_ir::{IrProject, OpCode, Operand, PouBody};
use std::collections::BTreeMap;
use std::path::PathBuf;

fn fixture(slug: &str) -> IrProject {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../..")
        .join("tests/fixtures/projects")
        .join(slug)
        .join("project.ir.json");
    serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap()
}

fn params(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
    pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
}

fn motor_params() -> BTreeMap<String, String> {
    params(&[
        ("start", "P101_Start_PB"),
        ("stop", "P101_Stop_PB"),
        ("overload", "P101_Overload_OK"),
        ("permissive", "Cell_Safety_OK"),
        ("motor", "P101_Run"),
    ])
}

/// The point of a library: no rename can be half-done, because there is no
/// rename. A missing parameter is an error, not a leftover from the last job.
#[test]
fn a_missing_parameter_is_refused_rather_than_left_over() {
    let mut p = motor_params();
    p.remove("overload");
    let err = build("motor-starter", "P101", &p).unwrap_err();
    assert_eq!(
        err,
        BuildError::Missing { block: "motor-starter".into(), param: "overload".into() }
    );
    assert!(err.to_string().contains("would be a different block"));
}

#[test]
fn an_unknown_block_is_named_rather_than_silently_empty() {
    assert_eq!(
        build("conveyor-gearbox", "X", &motor_params()).unwrap_err(),
        BuildError::NoSuchBlock("conveyor-gearbox".into())
    );
}

/// Every name in the built logic comes from the parameters. Nothing from the
/// block's own definition leaks through as a tag.
#[test]
fn every_tag_in_the_built_block_came_from_the_parameters() {
    let pou = build("motor-starter", "P101", &motor_params()).unwrap();
    let given: Vec<String> = motor_params().values().cloned().collect();
    for t in tags_for(&pou) {
        assert!(given.contains(&t.name), "{} is not one of the parameters", t.name);
    }
}

/// The seal-in is a branch, not a series contact. Getting that wrong makes a
/// motor that cannot start.
#[test]
fn the_motor_block_builds_a_real_seal_in() {
    let pou = build("motor-starter", "P101", &motor_params()).unwrap();
    let PouBody::Ladder { rungs } = &pou.body else { panic!() };
    assert_eq!(rungs.len(), 1);

    let st = ladx_ir::to_st::pou_to_st(&pou).source;
    assert!(
        st.contains("(P101_Start_PB OR P101_Run)"),
        "the start is in parallel with the output, got:\n{st}"
    );
    for series in ["P101_Stop_PB", "P101_Overload_OK", "Cell_Safety_OK"] {
        assert!(st.contains(&format!("AND {series}")), "{series} must be in series");
    }
}

/// A valve that has been commanded open for longer than it takes to open has
/// stuck, and the alarm latches because a valve that frees itself still stuck.
#[test]
fn the_valve_block_alarms_on_travel_and_latches_it() {
    let p = params(&[
        ("command", "V201_Open_Cmd"),
        ("solenoid", "V201_SV"),
        ("opened", "V201_Opened"),
        ("travel_timer", "V201_Travel"),
        ("travel_alarm", "V201_Fail_To_Open"),
        ("permissive", "Cell_Safety_OK"),
    ]);
    let pou = build("valve", "V201", &p).unwrap();
    let PouBody::Ladder { rungs } = &pou.body else { panic!() };
    assert_eq!(rungs.len(), 3);

    let timer = rungs.iter().find(|r| r.outputs[0].op == OpCode::TimerOn).unwrap();
    assert_eq!(timer.outputs[0].operands[1], Operand::Number { value: 5000.0 });
    // It times the commanded-but-not-arrived case, so the open limit must be
    // read as a normally-closed contact.
    assert!(timer
        .logic
        .instructions()
        .iter()
        .any(|i| i.op == OpCode::ContactNegated
            && i.operands[0] == Operand::Tag { name: "V201_Opened".into() }));

    let alarm = rungs.iter().find(|r| r.outputs[0].op == OpCode::SetCoil).unwrap();
    assert_eq!(alarm.outputs[0].operands[0], Operand::Tag { name: "V201_Fail_To_Open".into() });
}

/// The travel time is about the valve, not about the logic.
#[test]
fn the_valve_travel_time_can_be_set() {
    let mut p = params(&[
        ("command", "V_Cmd"),
        ("solenoid", "V_SV"),
        ("opened", "V_Opened"),
        ("travel_timer", "V_T"),
        ("travel_alarm", "V_Fail"),
        ("permissive", "Safe"),
    ]);
    p.insert("travel_ms".into(), "12000".into());
    let pou = build("valve", "V", &p).unwrap();
    let PouBody::Ladder { rungs } = &pou.body else { panic!() };
    let timer = rungs.iter().find(|r| r.outputs[0].op == OpCode::TimerOn).unwrap();
    assert_eq!(timer.outputs[0].operands[1], Operand::Number { value: 12000.0 });
}

/// A drive fault that clears itself has hidden the reason it happened.
#[test]
fn the_vfd_block_latches_its_fault_and_needs_a_deliberate_reset() {
    let p = params(&[
        ("run_request", "D301_Run_Req"),
        ("run_command", "D301_Run"),
        ("drive_fault", "D301_Fault"),
        ("fault_latch", "D301_Faulted"),
        ("reset", "Reset_PB"),
        ("permissive", "Cell_Safety_OK"),
    ]);
    let pou = build("vfd", "D301", &p).unwrap();
    let PouBody::Ladder { rungs } = &pou.body else { panic!() };
    assert!(rungs.iter().any(|r| r.outputs[0].op == OpCode::SetCoil));

    // The reset only works once the fault has actually gone.
    let reset = rungs.iter().find(|r| r.outputs[0].op == OpCode::ResetCoil).unwrap();
    assert!(reset
        .logic
        .instructions()
        .iter()
        .any(|i| i.op == OpCode::ContactNegated
            && i.operands[0] == Operand::Tag { name: "D301_Fault".into() }));

    // And the run command is blocked while the latch is set.
    let run = rungs.iter().find(|r| r.outputs[0].op == OpCode::Coil).unwrap();
    assert!(run
        .logic
        .instructions()
        .iter()
        .any(|i| i.op == OpCode::ContactNegated
            && i.operands[0] == Operand::Tag { name: "D301_Faulted".into() }));
}

/// Every block says what it does not do, so nobody assumes it does.
#[test]
fn every_block_states_its_limits() {
    for b in blocks() {
        assert!(!b.limits.is_empty(), "{} claims to do everything", b.name);
        assert!(!b.params.iter().filter(|p| p.required).collect::<Vec<_>>().is_empty());
        for p in &b.params {
            assert!(!p.about.is_empty(), "{}/{} has no explanation", b.name, p.name);
        }
    }
    // A permissive is not a safety function, and the block has to say so.
    assert!(block("motor-starter")
        .unwrap()
        .limits
        .iter()
        .any(|l| l.contains("A safety circuit is wired, not programmed")));
}

/// A seal-in is recognised by shape, so it works on programs that were never
/// built from the library.
#[test]
fn it_finds_a_start_stop_station_in_a_program_it_did_not_build() {
    let d = deviations(&fixture("01-motor-starter"));
    assert_eq!(d.len(), 1, "got {d:?}");
    assert_eq!(d[0].tag, "Motor");
    assert_eq!(d[0].missing, vec![Role::Permissive], "it has a stop and an overload");
}

#[test]
fn it_names_what_the_standard_has_that_the_rung_does_not() {
    let d = deviations(&fixture("03-conveyor"));
    assert_eq!(d.len(), 1);
    assert_eq!(d[0].tag, "Conveyor");
    // EStop_OK covers the permissive, Stop_PB the stop. No overload.
    assert_eq!(d[0].missing, vec![Role::Overload]);
    assert!(d[0].detail.contains("running into a trip"));
}

/// The roles are read from tag names, which is a guess, and a finding that did
/// not say so would be read as a fault proven.
#[test]
fn a_finding_says_it_is_judged_by_name() {
    let d = deviations(&fixture("01-motor-starter"));
    assert!(d[0].detail.contains("judged by tag name"));
    assert!(d[0].detail.contains("check the rung"));
}

/// A block built from the library must not then be reported as deviating from
/// it. A checker that flags its own output is worthless.
#[test]
fn the_library_does_not_flag_its_own_motor_starter() {
    let mut p = IrProject::new("t");
    p.pous = vec![build("motor-starter", "P101", &motor_params()).unwrap()];
    assert!(deviations(&p).is_empty(), "got {:?}", deviations(&p));
}

/// A rung with no seal-in is not a start/stop station and must not be judged
/// as one.
#[test]
fn rungs_that_are_not_start_stop_stations_are_left_alone() {
    let d = deviations(&fixture("08-multi-step-sequence"));
    assert!(d.is_empty(), "got {d:?}");
}
