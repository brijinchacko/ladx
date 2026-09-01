//! Screens proposed from the program, for an engineer to argue with.
//!
//! Building an operator interface starts with the same work every time: read
//! the tag table, decide which tags an operator needs to see, decide which they
//! need to touch, and lay them out. The first three of those are mechanical and
//! the program already answers them. A tag wired to a lamp is something to
//! show. A tag wired to a pushbutton is something to press. A latched fault is
//! something for the alarm screen.
//!
//! So this proposes. It does not generate a finished interface and it is not
//! trying to: layout, grouping by machine area, and what an operator is allowed
//! to touch are judgements about the plant, not about the program. What it
//! removes is the transcription, which is the part that is tedious and the part
//! where tags get missed.
//!
//! Every proposal says which tag it came from, so an engineer reviewing it can
//! see the whole answer rather than a screen that appeared.

use ladx_ir::alarms::alarm_list;
use ladx_ir::io::{io_list, SignalType};
use ladx_ir::{DeviceKind, IrProject};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// What an operator does with a value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/hmi/")]
#[serde(rename_all = "camelCase")]
pub enum Control {
    /// Shown and not touchable. A running lamp, a level.
    Indicator,
    /// Pressed and released. A start button.
    Momentary,
    /// Left where it is put. Auto/manual.
    Maintained,
    /// A number an operator can change. A setpoint.
    Setpoint,
    /// A fault, on the alarm screen rather than beside the equipment.
    Alarm,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/hmi/")]
pub struct ProposedBinding {
    pub tag: String,
    /// What to label it, taken from the description where there is one, and
    /// from the tag name where there is not. Never invented.
    pub label: String,
    pub control: Control,
    /// Why this binding was proposed, so somebody can disagree with it.
    pub because: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/hmi/")]
pub struct ProposedScreen {
    pub name: String,
    /// What the screen is for, in a sentence.
    pub purpose: String,
    pub bindings: Vec<ProposedBinding>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/hmi/")]
pub struct Proposal {
    pub screens: Vec<ProposedScreen>,
    /// What the program did not answer, so silence is not read as completeness.
    pub notes: Vec<String>,
}

/// A label a person would read, from what the program actually says.
fn label_for(tag: &str, description: Option<&str>) -> String {
    match description.map(str::trim).filter(|d| !d.is_empty()) {
        Some(d) => d.to_string(),
        // Underscores out, which is the whole of the guessing this does. It
        // will not expand an abbreviation or invent a friendlier name: an
        // operator screen that says something the tag table does not is worse
        // than one that reads a little technically.
        None => tag.replace('_', " "),
    }
}

/// Whether a tag is part of the safety circuit.
///
/// This decides more than a label. A safety device is hardwired and is not an
/// operator control: an E-stop that can be pressed from a screen is not an
/// E-stop, and a guard interlock that can be satisfied from a screen is a
/// bypass. Proposing either as a button would be proposing something nobody
/// should build, and a proposal an engineer has to catch is worse than no
/// proposal.
///
/// Matched on the name because that is the only signal available: the IR
/// records what a tag is wired to, not whether it is safety rated. Being
/// cautious here costs a control that has to be added by hand; being wrong the
/// other way puts an E-stop on a touchscreen.
fn is_safety(tag: &str) -> bool {
    let lower = tag.to_lowercase();
    const MARKERS: [&str; 7] =
        ["estop", "e_stop", "emergency", "guard", "safety", "lightcurtain", "light_curtain"];
    MARKERS.iter().any(|m| lower.contains(m))
}

fn control_for(signal: SignalType, device: Option<DeviceKind>) -> Control {
    match device {
        Some(DeviceKind::PushbuttonNo) | Some(DeviceKind::PushbuttonNc) => Control::Momentary,
        Some(DeviceKind::Selector) => Control::Maintained,
        Some(DeviceKind::Lamp) | Some(DeviceKind::Motor) | Some(DeviceKind::Sensor) => {
            Control::Indicator
        }
        Some(DeviceKind::AnalogValue) | None => match signal {
            SignalType::AnalogOutput => Control::Setpoint,
            _ => Control::Indicator,
        },
    }
}

/// Propose screens for a project.
pub fn propose(project: &IrProject) -> Proposal {
    let io = io_list(project);
    let alarms = alarm_list(project);

    let mut overview: Vec<ProposedBinding> = Vec::new();
    let mut controls: Vec<ProposedBinding> = Vec::new();
    let mut alarm_bindings: Vec<ProposedBinding> = Vec::new();

    let is_alarm = |tag: &str| {
        alarms
            .alarms
            .iter()
            .any(|a| a.tag == tag && !a.follows_other_alarms)
    };

    for p in &io.points {
        // A fault belongs on the alarm screen rather than beside the equipment,
        // whatever it is wired to.
        if is_alarm(&p.tag) {
            alarm_bindings.push(ProposedBinding {
                tag: p.tag.clone(),
                label: label_for(&p.tag, p.description.as_deref()),
                control: Control::Alarm,
                because: "The program latches this as a fault.".into(),
            });
            continue;
        }

        let safety = is_safety(&p.tag);
        let control = if safety { Control::Indicator } else { control_for(p.signal, p.device) };

        let binding = ProposedBinding {
            tag: p.tag.clone(),
            label: label_for(&p.tag, p.description.as_deref()),
            control,
            because: if safety {
                "Part of the safety circuit, so it is shown and not operable. A safety device \
                 that can be operated from a screen is not a safety device."
                    .into()
            } else {
                match p.device {
                    Some(d) => format!("Wired as {}.", device_words(d)),
                    None => format!("{} with no device recorded.", p.signal.label()),
                }
            },
        };

        match control {
            Control::Momentary | Control::Maintained | Control::Setpoint => controls.push(binding),
            _ => overview.push(binding),
        }
    }

    // Alarms that are not wired to anything are still alarms.
    for a in alarms.alarms.iter().filter(|a| !a.follows_other_alarms) {
        if alarm_bindings.iter().any(|b| b.tag == a.tag) {
            continue;
        }
        alarm_bindings.push(ProposedBinding {
            tag: a.tag.clone(),
            label: label_for(&a.tag, a.description.as_deref()),
            control: Control::Alarm,
            because: a.evidence.clone(),
        });
    }

    let mut screens = Vec::new();
    if !overview.is_empty() {
        screens.push(ProposedScreen {
            name: "Overview".into(),
            purpose: "What the machine is doing. Everything here is shown, not touched.".into(),
            bindings: overview,
        });
    }
    if !controls.is_empty() {
        screens.push(ProposedScreen {
            name: "Controls".into(),
            purpose: "What an operator can change. Whether they should be able to is a decision \
                      about the plant, not about the program."
                .into(),
            bindings: controls,
        });
    }
    if !alarm_bindings.is_empty() {
        screens.push(ProposedScreen {
            name: "Alarms".into(),
            purpose: "Faults the program raises, with what raises and clears each one.".into(),
            bindings: alarm_bindings,
        });
    }

    let mut notes = Vec::new();
    notes.push(
        "These are proposals. Layout, grouping by machine area, and what an operator is allowed \
         to touch are judgements about the plant that the program cannot answer."
            .into(),
    );

    let safety_shown: Vec<&str> =
        io.points.iter().map(|p| p.tag.as_str()).filter(|t| is_safety(t)).collect();
    if !safety_shown.is_empty() {
        notes.push(format!(
            "{} looks like part of the safety circuit and is proposed as shown only. Check that \
             is right: LADX matches on the name because the program does not record what is \
             safety rated, so it will miss one that is named differently.",
            safety_shown.join(", ")
        ));
    }

    let undescribed = io
        .points
        .iter()
        .filter(|p| p.description.as_deref().unwrap_or("").trim().is_empty())
        .count();
    if undescribed > 0 {
        notes.push(format!(
            "{undescribed} of these are labelled from the tag name because the program has no \
             description for them. An operator screen reading MOTOR 1 RUN is worse than one \
             reading Conveyor running, and only the tag table can fix that."
        ));
    }

    if io.points.is_empty() {
        notes.push(
            "No tag in this program is recorded as wired to anything, so there is nothing to \
             propose. Marking tags as inputs and outputs is what makes this possible."
                .into(),
        );
    }

    Proposal { screens, notes }
}

fn device_words(kind: DeviceKind) -> &'static str {
    match kind {
        DeviceKind::PushbuttonNo => "a momentary pushbutton",
        DeviceKind::PushbuttonNc => "a normally closed pushbutton",
        DeviceKind::Selector => "a maintained selector",
        DeviceKind::Sensor => "a sensor",
        DeviceKind::Lamp => "an indicator",
        DeviceKind::Motor => "a motor or contactor",
        DeviceKind::AnalogValue => "an analogue value",
    }
}
