//! Blocks that get written again on every job.
//!
//! Every integrator has a motor starter they trust. It gets copied from the
//! last project, the tag names get edited, and about one time in ten an edit is
//! missed and a rung still refers to the previous machine's overload. The logic
//! is not the hard part; keeping the copies identical is.
//!
//! A block here is the logic once, with the tag names as parameters. Two things
//! follow from that which copying does not give:
//!
//! Instantiating cannot half-rename, because there is no rename. The names are
//! filled in from the parameters, and a parameter that is not supplied is an
//! error rather than a leftover from the previous job.
//!
//! And a block can be recognised in a program that was not built from it, which
//! is what makes the library useful on the several hundred existing programs
//! nobody is going to rewrite. `deviations` says what a stretch of logic does
//! differently from the standard, which is the review a senior engineer does by
//! eye and does not have time to do on all of them.

use crate::{Instruction, Logic, OpCode, Operand, Pou, PouBody, PouKind, Rung, Tag};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub struct Param {
    pub name: String,
    /// What it is for, in the words somebody filling it in would use.
    pub about: String,
    /// Whether the block still works without it. A motor needs an overload; it
    /// does not need a running-hours counter.
    pub required: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub struct Block {
    pub name: String,
    pub about: String,
    pub params: Vec<Param>,
    /// What this block does not do, so nobody assumes it does.
    pub limits: Vec<String>,
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum BuildError {
    #[error("{block} needs {param}, and a block built without it would be a different block")]
    Missing { block: String, param: String },
    #[error("no block called {0}")]
    NoSuchBlock(String),
}

/* ────────────────────────────── the blocks ─────────────────────────── */

fn motor() -> Block {
    Block {
        name: "motor-starter".into(),
        about: "A start/stop station with a seal-in, an overload and a safety permissive. The \
                stop button and the overload are read as normally closed, because that is how \
                they are wired: a broken wire stops the motor."
            .into(),
        params: vec![
            Param { name: "start".into(), about: "Start pushbutton".into(), required: true },
            Param {
                name: "stop".into(),
                about: "Stop pushbutton, wired normally closed".into(),
                required: true,
            },
            Param {
                name: "overload".into(),
                about: "Overload contact, closed when healthy".into(),
                required: true,
            },
            Param {
                name: "permissive".into(),
                about: "Safety permissive, closed when it is safe to run".into(),
                required: true,
            },
            Param { name: "motor".into(), about: "The output that runs it".into(), required: true },
            Param {
                name: "running".into(),
                about: "Run feedback from the contactor, if there is one".into(),
                required: false,
            },
        ],
        limits: vec![
            "There is no start-failed check. Without run feedback there is nothing to check it \
             against, and with it, how long to wait is a decision about the machine."
                .into(),
            "The safety permissive is a permissive, not a safety function. A safety circuit is \
             wired, not programmed, and this rung does not replace it."
                .into(),
        ],
    }
}

fn valve() -> Block {
    Block {
        name: "valve".into(),
        about: "An open/close valve with limit switches and a travel alarm. The alarm is what \
                makes it worth having: a valve that has been commanded open for longer than it \
                takes to open has either stuck or lost its air."
            .into(),
        params: vec![
            Param { name: "command".into(), about: "The request to open".into(), required: true },
            Param { name: "solenoid".into(), about: "The output to the solenoid".into(), required: true },
            Param {
                name: "opened".into(),
                about: "Open limit switch".into(),
                required: true,
            },
            Param {
                name: "travel_timer".into(),
                about: "Timer instance for the travel alarm".into(),
                required: true,
            },
            Param {
                name: "travel_alarm".into(),
                about: "Set when it does not get there in time".into(),
                required: true,
            },
            Param {
                name: "permissive".into(),
                about: "Safety permissive".into(),
                required: true,
            },
        ],
        limits: vec![
            "The travel time is a number about the valve, not about the logic. It is set from \
             the parameter and 5 seconds is only a starting point."
                .into(),
            "There is no closed limit switch in this block. A valve with two limits wants a \
             second travel alarm, which is the same rung again."
                .into(),
        ],
    }
}

fn vfd() -> Block {
    Block {
        name: "vfd".into(),
        about: "A drive run command with a fault interlock and a reset. A drive fault latches, \
                because a drive that faults and clears on its own has hidden the reason."
            .into(),
        params: vec![
            Param { name: "run_request".into(), about: "The request to run".into(), required: true },
            Param { name: "run_command".into(), about: "Run output to the drive".into(), required: true },
            Param { name: "drive_fault".into(), about: "Fault input from the drive".into(), required: true },
            Param {
                name: "fault_latch".into(),
                about: "Latched fault, cleared by the reset".into(),
                required: true,
            },
            Param { name: "reset".into(), about: "Fault reset pushbutton".into(), required: true },
            Param { name: "permissive".into(), about: "Safety permissive".into(), required: true },
        ],
        limits: vec![
            "The speed reference is not in this block. It is an analogue value with engineering \
             units and a scale, and those are decisions about the machine."
                .into(),
            "Nothing here checks that the drive is actually running. That needs the drive's \
             status word, which differs by make."
                .into(),
        ],
    }
}

/// Every block LADX ships.
pub fn blocks() -> Vec<Block> {
    vec![motor(), valve(), vfd()]
}

pub fn block(name: &str) -> Option<Block> {
    blocks().into_iter().find(|b| b.name == name)
}

/* ──────────────────────────── instantiation ────────────────────────── */

fn contact(id: &str, tag: &str) -> Logic {
    Logic::Element {
        instruction: Instruction {
            id: id.into(),
            op: OpCode::Contact,
            operands: vec![Operand::Tag { name: tag.into() }],
            vendor: None,
        },
    }
}

fn out(id: &str, op: OpCode, operands: Vec<Operand>) -> Instruction {
    Instruction { id: id.into(), op, operands, vendor: None }
}

fn need<'a>(
    block: &str,
    params: &'a BTreeMap<String, String>,
    key: &str,
) -> Result<&'a str, BuildError> {
    params
        .get(key)
        .map(String::as_str)
        .ok_or_else(|| BuildError::Missing { block: block.into(), param: key.into() })
}

/// Build a block's logic with real tag names.
///
/// `prefix` names the POU, so two motors do not land in the same routine.
pub fn build(
    name: &str,
    prefix: &str,
    params: &BTreeMap<String, String>,
) -> Result<Pou, BuildError> {
    let rungs = match name {
        "motor-starter" => motor_rungs(params)?,
        "valve" => valve_rungs(params)?,
        "vfd" => vfd_rungs(params)?,
        other => return Err(BuildError::NoSuchBlock(other.into())),
    };
    Ok(Pou {
        name: prefix.to_string(),
        kind: PouKind::Program,
        body: PouBody::Ladder { rungs },
        local_tags: Vec::new(),
        comment: Some(format!(
            "Built from the {name} block. Edits here do not go back to the library.",
        )),
        container: None,
    })
}

fn motor_rungs(p: &BTreeMap<String, String>) -> Result<Vec<Rung>, BuildError> {
    let b = "motor-starter";
    let (start, stop) = (need(b, p, "start")?, need(b, p, "stop")?);
    let overload = need(b, p, "overload")?;
    let permissive = need(b, p, "permissive")?;
    let motor = need(b, p, "motor")?;

    // Start in parallel with the motor's own output is the seal-in. Everything
    // else is in series and each one drops it.
    let seal = Logic::Parallel { children: vec![contact("m1", start), contact("m2", motor)] };
    Ok(vec![Rung {
        id: "r1".into(),
        comment: Some(format!(
            "{motor} runs when {start} is pressed and keeps running until {stop} is pressed, \
             {overload} trips or {permissive} opens."
        )),
        logic: Logic::Series {
            children: vec![
                seal,
                contact("m3", stop),
                contact("m4", overload),
                contact("m5", permissive),
            ],
        },
        outputs: vec![out("m_out", OpCode::Coil, vec![Operand::Tag { name: motor.into() }])],
    }])
}

fn valve_rungs(p: &BTreeMap<String, String>) -> Result<Vec<Rung>, BuildError> {
    let b = "valve";
    let command = need(b, p, "command")?;
    let solenoid = need(b, p, "solenoid")?;
    let opened = need(b, p, "opened")?;
    let timer = need(b, p, "travel_timer")?;
    let alarm = need(b, p, "travel_alarm")?;
    let permissive = need(b, p, "permissive")?;
    let travel_ms: f64 = p.get("travel_ms").and_then(|v| v.parse().ok()).unwrap_or(5000.0);

    Ok(vec![
        Rung {
            id: "r1".into(),
            comment: Some(format!("{solenoid} follows {command} while {permissive} is closed.")),
            logic: Logic::Series {
                children: vec![contact("v1", command), contact("v2", permissive)],
            },
            outputs: vec![out("v_out", OpCode::Coil, vec![Operand::Tag { name: solenoid.into() }])],
        },
        Rung {
            id: "r2".into(),
            comment: Some(format!(
                "Timing how long {solenoid} has been commanded without {opened} arriving."
            )),
            logic: Logic::Series {
                children: vec![
                    contact("v3", solenoid),
                    Logic::Element {
                        instruction: Instruction {
                            id: "v4".into(),
                            op: OpCode::ContactNegated,
                            operands: vec![Operand::Tag { name: opened.into() }],
                            vendor: None,
                        },
                    },
                ],
            },
            outputs: vec![out(
                "v_t",
                OpCode::TimerOn,
                vec![
                    Operand::Tag { name: timer.into() },
                    Operand::Number { value: travel_ms },
                ],
            )],
        },
        Rung {
            id: "r3".into(),
            comment: Some(format!(
                "{alarm} latches, because a valve that sticks once and frees itself is still a \
                 valve that stuck."
            )),
            logic: contact("v5", &format!("{timer}.DN")),
            outputs: vec![out("v_a", OpCode::SetCoil, vec![Operand::Tag { name: alarm.into() }])],
        },
    ])
}

fn vfd_rungs(p: &BTreeMap<String, String>) -> Result<Vec<Rung>, BuildError> {
    let b = "vfd";
    let request = need(b, p, "run_request")?;
    let command = need(b, p, "run_command")?;
    let fault = need(b, p, "drive_fault")?;
    let latch = need(b, p, "fault_latch")?;
    let reset = need(b, p, "reset")?;
    let permissive = need(b, p, "permissive")?;

    Ok(vec![
        Rung {
            id: "r1".into(),
            comment: Some(format!("{latch} latches on {fault} and stays until {reset}.")),
            logic: contact("d1", fault),
            outputs: vec![out("d_s", OpCode::SetCoil, vec![Operand::Tag { name: latch.into() }])],
        },
        Rung {
            id: "r2".into(),
            comment: Some(format!("{reset} clears it, and only when {fault} has gone.")),
            logic: Logic::Series {
                children: vec![
                    contact("d2", reset),
                    Logic::Element {
                        instruction: Instruction {
                            id: "d3".into(),
                            op: OpCode::ContactNegated,
                            operands: vec![Operand::Tag { name: fault.into() }],
                            vendor: None,
                        },
                    },
                ],
            },
            outputs: vec![out("d_r", OpCode::ResetCoil, vec![Operand::Tag { name: latch.into() }])],
        },
        Rung {
            id: "r3".into(),
            comment: Some(format!(
                "{command} runs while {request} is on, {latch} is clear and {permissive} is closed."
            )),
            logic: Logic::Series {
                children: vec![
                    contact("d4", request),
                    Logic::Element {
                        instruction: Instruction {
                            id: "d5".into(),
                            op: OpCode::ContactNegated,
                            operands: vec![Operand::Tag { name: latch.into() }],
                            vendor: None,
                        },
                    },
                    contact("d6", permissive),
                ],
            },
            outputs: vec![out("d_out", OpCode::Coil, vec![Operand::Tag { name: command.into() }])],
        },
    ])
}

/// The tags a built block needs declared, for anything that did not exist.
pub fn tags_for(pou: &Pou) -> Vec<Tag> {
    let PouBody::Ladder { rungs } = &pou.body else { return Vec::new() };
    let mut names: Vec<String> = Vec::new();
    for r in rungs {
        for i in r.outputs.iter().chain(r.logic.instructions()) {
            for o in &i.operands {
                if let Operand::Tag { name } = o {
                    let base = name.split('.').next().unwrap_or(name).to_string();
                    if !names.contains(&base) {
                        names.push(base);
                    }
                }
            }
        }
    }
    names
        .into_iter()
        .map(|name| Tag {
            name,
            data_type: crate::DataType::Bool,
            address: None,
            initial_value: None,
            comment: None,
            field: None,
        })
        .collect()
}

/* ───────────────────────────── recognition ─────────────────────────── */

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub enum Role {
    Stop,
    Overload,
    Permissive,
}

impl Role {
    fn matches(self, tag: &str) -> bool {
        let t = tag.to_lowercase();
        match self {
            Role::Stop => t.contains("stop") && !t.contains("estop") && !t.contains("e_stop"),
            Role::Overload => {
                t.contains("overload") || t.contains("ol_") || t.contains("thermal")
                    || t.contains("_ol")
            }
            Role::Permissive => {
                ["estop", "e_stop", "emergency", "guard", "safety", "permissive", "interlock"]
                    .iter()
                    .any(|m| t.contains(m))
            }
        }
    }

    fn why(self) -> &'static str {
        match self {
            Role::Stop => "nothing on this rung stops it except removing the start signal, so a \
                           stop button would have to be held",
            Role::Overload => "a motor with no overload contact in the rung keeps running into a \
                              trip",
            Role::Permissive => "no safety permissive drops this output",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub struct Deviation {
    pub pou: String,
    pub rung: String,
    /// The output this is about.
    pub tag: String,
    pub block: String,
    /// What the standard block has that this rung does not.
    pub missing: Vec<Role>,
    pub detail: String,
}

/// Whether a rung is a start/stop station: something in parallel that is a
/// contact on the rung's own output. That shape is a seal-in and very little
/// else, which is why it can be recognised without relying on names.
fn sealed_output(rung: &Rung) -> Option<String> {
    let coil = rung.outputs.iter().find(|i| i.op == OpCode::Coil)?;
    let Some(Operand::Tag { name }) = coil.operands.first() else { return None };

    fn has_self_contact(logic: &Logic, name: &str) -> bool {
        match logic {
            Logic::Parallel { children } => children.iter().any(|c| match c {
                Logic::Element { instruction } => {
                    instruction.op == OpCode::Contact
                        && matches!(&instruction.operands.first(),
                            Some(Operand::Tag { name: n }) if n == name)
                }
                other => has_self_contact(other, name),
            }),
            Logic::Series { children } => children.iter().any(|c| has_self_contact(c, name)),
            Logic::Element { .. } => false,
        }
    }

    has_self_contact(&rung.logic, name).then(|| name.clone())
}

/// Where a program departs from the standard blocks.
///
/// Only start/stop stations are recognised, and only by shape. What the
/// conditions on them *mean* is judged by name, which is the only signal a PLC
/// program carries: nothing in a file marks a contact as an overload. So a
/// finding here is a question worth asking, not a fault proven, and the wording
/// says so.
pub fn deviations(project: &crate::IrProject) -> Vec<Deviation> {
    let mut out = Vec::new();
    for pou in &project.pous {
        let PouBody::Ladder { rungs } = &pou.body else { continue };
        for rung in rungs {
            let Some(tag) = sealed_output(rung) else { continue };

            // Only the conditions in series with the seal-in count. One in
            // parallel is an alternative way to start it, not something that
            // stops it.
            let series: Vec<&Instruction> = match &rung.logic {
                Logic::Series { children } => children
                    .iter()
                    .filter_map(|c| match c {
                        Logic::Element { instruction } => Some(instruction),
                        _ => None,
                    })
                    .collect(),
                _ => Vec::new(),
            };
            let names: Vec<String> = series
                .iter()
                .filter_map(|i| match i.operands.first() {
                    Some(Operand::Tag { name }) => Some(name.clone()),
                    _ => None,
                })
                .collect();

            let missing: Vec<Role> = [Role::Stop, Role::Overload, Role::Permissive]
                .into_iter()
                .filter(|r| !names.iter().any(|n| r.matches(n)))
                .collect();

            if missing.is_empty() {
                continue;
            }

            let detail = format!(
                "{tag} is a start/stop station. The standard motor starter has a stop, an \
                 overload and a safety permissive in series with the seal-in; on this rung {}. \
                 The roles are judged by tag name, which is all a PLC file carries, so check the \
                 rung rather than taking this as proven.",
                missing
                    .iter()
                    .map(|r| r.why())
                    .collect::<Vec<_>>()
                    .join(", and ")
            );

            out.push(Deviation {
                pou: pou.name.clone(),
                rung: rung.id.clone(),
                tag,
                block: "motor-starter".into(),
                missing,
                detail,
            });
        }
    }
    out
}
