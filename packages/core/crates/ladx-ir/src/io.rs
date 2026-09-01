//! The I/O list, derived from the program rather than typed again.
//!
//! An I/O list normally exists twice: once in the PLC as tags with addresses,
//! and once in a spreadsheet somebody maintains by hand. They agree on the day
//! the spreadsheet is written and drift from then on, and the drift is only
//! discovered during commissioning, at the point where it is most expensive.
//!
//! So this reads the program. Every tag the IR says is wired to something in
//! the plant is an I/O point, and the graph says what drives it and what reads
//! it. Nothing is invented: a field somebody has not filled in comes back
//! empty rather than guessed, because an I/O schedule with plausible invented
//! ranges in it is worse than one with gaps, which at least look like gaps.

use crate::graph::ProjectGraph;
use crate::{DeviceKind, IoDirection, IrProject};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use ts_rs::TS;

/// What kind of signal a point carries.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub enum SignalType {
    DigitalInput,
    DigitalOutput,
    AnalogInput,
    AnalogOutput,
}

impl SignalType {
    pub fn label(self) -> &'static str {
        match self {
            SignalType::DigitalInput => "DI",
            SignalType::DigitalOutput => "DO",
            SignalType::AnalogInput => "AI",
            SignalType::AnalogOutput => "AO",
        }
    }

    pub fn is_analog(self) -> bool {
        matches!(self, SignalType::AnalogInput | SignalType::AnalogOutput)
    }
}

/// One point where the program meets the plant.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct IoPoint {
    pub tag: String,
    pub signal: SignalType,
    /// What kind of device, where the program says. Not inferred from the name:
    /// a tag called `Start_PB` is probably a pushbutton and probably is not
    /// worth being wrong about.
    pub device: Option<DeviceKind>,
    /// The address as the source had it. Empty is a real answer on a modern
    /// platform where most tags are symbolic.
    pub address: Option<String>,
    pub description: Option<String>,
    /// Where the program uses it, so a point can be traced to the logic.
    pub used_in: Vec<String>,
    /// Whether anything in the program actually refers to it.
    pub used: bool,
}

/// Something worth checking on an I/O list.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct IoIssue {
    /// A stable name for the kind of check.
    pub check: String,
    pub tag: String,
    pub detail: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
pub struct IoList {
    pub points: Vec<IoPoint>,
    pub issues: Vec<IoIssue>,
}

impl IoList {
    pub fn inputs(&self) -> usize {
        self.points
            .iter()
            .filter(|p| matches!(p.signal, SignalType::DigitalInput | SignalType::AnalogInput))
            .count()
    }

    pub fn outputs(&self) -> usize {
        self.points.len() - self.inputs()
    }
}

/// Read the I/O list out of a project.
pub fn io_list(project: &IrProject) -> IoList {
    let g = ProjectGraph::build(project);
    let mut points: Vec<IoPoint> = Vec::new();

    for tag in &project.tags {
        let Some(field) = &tag.field else { continue };

        // Analog or digital comes from the declared type, not the device: a
        // BOOL wired to a lamp is digital whatever anybody called it.
        let analog = !matches!(tag.data_type, crate::DataType::Bool);
        let signal = match (field.direction, analog) {
            (IoDirection::Input, false) => SignalType::DigitalInput,
            (IoDirection::Input, true) => SignalType::AnalogInput,
            (IoDirection::Output, false) => SignalType::DigitalOutput,
            (IoDirection::Output, true) => SignalType::AnalogOutput,
        };

        let uses = g.uses_of(&tag.name);
        // Deduplicated: a seal-in reads its own coil, so the tag appears twice
        // on one rung and listing it twice reads as two separate places to go
        // and look.
        let mut used_in: Vec<String> =
            uses.iter().map(|u| format!("{}/{}", u.pou, u.rung)).collect();
        used_in.sort();
        used_in.dedup();

        points.push(IoPoint {
            tag: tag.name.clone(),
            signal,
            device: field.kind,
            address: tag.address.clone(),
            description: tag.comment.clone(),
            used_in,
            used: !uses.is_empty(),
        });
    }

    points.sort_by(|a, b| {
        // Grouped by kind, then by address where there is one, which is the
        // order a wiring schedule is read in.
        a.signal
            .label()
            .cmp(b.signal.label())
            .then(a.address.cmp(&b.address))
            .then(a.tag.cmp(&b.tag))
    });

    let issues = check(&points, &g);
    IoList { points, issues }
}

fn check(points: &[IoPoint], g: &ProjectGraph) -> Vec<IoIssue> {
    let mut issues = Vec::new();

    // Two points on one terminal. Whichever is wired, the other is not, and
    // the program will read whatever the first one is doing.
    let mut by_address: BTreeMap<&str, Vec<&IoPoint>> = BTreeMap::new();
    for p in points {
        if let Some(a) = &p.address {
            by_address.entry(a.as_str()).or_default().push(p);
        }
    }
    for (address, sharing) in by_address {
        if sharing.len() < 2 {
            continue;
        }
        let names: Vec<&str> = sharing.iter().map(|p| p.tag.as_str()).collect();
        for p in &sharing {
            issues.push(IoIssue {
                check: "duplicate-address".into(),
                tag: p.tag.clone(),
                detail: format!(
                    "{address} is also used by {}. Only one of them is wired to it.",
                    names.iter().filter(|n| **n != p.tag).copied().collect::<Vec<_>>().join(", ")
                ),
            });
        }
    }

    for p in points {
        // A point nothing reads or writes is either a spare or a wiring change
        // nobody finished.
        if !p.used {
            issues.push(IoIssue {
                check: "unused-point".into(),
                tag: p.tag.clone(),
                detail: "Wired, and nothing in the program refers to it. Normal for a spare, worth \
                         a look if it was meant to do something."
                    .into(),
            });
        }

        // A description is what somebody reads at two in the morning with a
        // meter in their hand.
        if p.description.as_deref().unwrap_or("").trim().is_empty() {
            issues.push(IoIssue {
                check: "no-description".into(),
                tag: p.tag.clone(),
                detail: "No description. The tag name is all anybody has at the terminal."
                    .into(),
            });
        }

        // An output the program never drives is not an output yet.
        if matches!(p.signal, SignalType::DigitalOutput | SignalType::AnalogOutput)
            && g.writers_of(&p.tag).is_empty()
        {
            issues.push(IoIssue {
                check: "output-never-driven".into(),
                tag: p.tag.clone(),
                detail: "Wired as an output and nothing in the program drives it, so it will sit \
                         at zero."
                    .into(),
            });
        }

        // An input the program drives is either mislabelled or being forced,
        // and both are worth knowing before commissioning.
        if matches!(p.signal, SignalType::DigitalInput | SignalType::AnalogInput) {
            let written = g.writers_of(&p.tag);
            if !written.is_empty() {
                issues.push(IoIssue {
                    check: "input-written".into(),
                    tag: p.tag.clone(),
                    detail: format!(
                        "Wired as an input and the program writes it at {}. Either it is not \
                         really an input, or something is overwriting the field.",
                        written
                            .iter()
                            .map(|u| format!("{}/{}", u.pou, u.rung))
                            .collect::<Vec<_>>()
                            .join(", ")
                    ),
                });
            }
        }
    }

    issues.sort_by(|a, b| a.check.cmp(&b.check).then(a.tag.cmp(&b.tag)));
    issues
}

/// Points grouped as a wiring schedule reads.
pub fn by_signal(list: &IoList) -> BTreeMap<&'static str, Vec<&IoPoint>> {
    let mut out: BTreeMap<&'static str, Vec<&IoPoint>> = BTreeMap::new();
    for p in &list.points {
        out.entry(p.signal.label()).or_default().push(p);
    }
    out
}

/// The list as CSV, which is what somebody will actually ask for.
///
/// Written here rather than in a UI so both surfaces produce the same file, and
/// so the column order is decided once.
pub fn to_csv(list: &IoList) -> String {
    let mut s = String::from("Tag,Type,Device,Address,Description,Used in\n");
    for p in &list.points {
        let field = |v: &str| {
            if v.contains(',') || v.contains('"') {
                format!("\"{}\"", v.replace('"', "\"\""))
            } else {
                v.to_string()
            }
        };
        s.push_str(&format!(
            "{},{},{},{},{},{}\n",
            field(&p.tag),
            p.signal.label(),
            field(&p.device.map(device_label).unwrap_or("")),
            field(p.address.as_deref().unwrap_or("")),
            field(p.description.as_deref().unwrap_or("")),
            field(&p.used_in.join(" ")),
        ));
    }
    s
}

fn device_label(kind: DeviceKind) -> &'static str {
    match kind {
        DeviceKind::PushbuttonNo => "Pushbutton NO",
        DeviceKind::PushbuttonNc => "Pushbutton NC",
        DeviceKind::Selector => "Selector",
        DeviceKind::Sensor => "Sensor",
        DeviceKind::Lamp => "Lamp",
        DeviceKind::Motor => "Motor",
        DeviceKind::AnalogValue => "Analogue",
    }
}
