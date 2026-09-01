//! The racks, the cards in them, and what the program expects to be there.
//!
//! A PLC program addresses hardware by position: `Local:2:I.Data.3` means slot
//! 2, input word, bit 3. Nothing in the logic says what is in slot 2, and
//! nothing checks. Put a 16-point card where a 32-point card was, or move a
//! card one slot to make room, and every address past that point still
//! compiles, still downloads, and reads the wrong terminal.
//!
//! That fault is normally found by a person with a meter on a Saturday. The
//! information needed to find it earlier is in the export: the module list says
//! what is in each slot and how many points it has, and the program says what
//! it addresses. Comparing the two is arithmetic.

use crate::IrProject;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub enum ModuleKind {
    Controller,
    DigitalInput,
    DigitalOutput,
    AnalogInput,
    AnalogOutput,
    /// A combined card, or one whose direction the catalogue number does not
    /// give away.
    Mixed,
    Communications,
    /// Read, but not classified. Named rather than guessed at.
    Other,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub struct Module {
    pub name: String,
    /// The catalogue number, which is what somebody orders a replacement by.
    pub catalog: Option<String>,
    pub kind: ModuleKind,
    /// Where it sits. None for a module that is not in a chassis slot.
    pub slot: Option<u32>,
    /// What it plugs into, by name.
    pub parent: Option<String>,
    /// Points on the card, where the catalogue number says.
    pub points: Option<u32>,
    /// Firmware, as major.minor. Kept because a mismatch against the project
    /// is a download failure, and because it is asked for at handover.
    pub revision: Option<String>,
    /// A module the controller is told to ignore. It is in the list and it is
    /// not in the machine, and reading its data returns nothing.
    pub inhibited: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub struct Hardware {
    pub modules: Vec<Module>,
    /// Said when there is no hardware in the file, so an empty list is not
    /// read as "no hardware".
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub enum HardwareIssue {
    /// The program addresses a slot with nothing in it.
    NoModuleInSlot,
    /// The program addresses a point past the end of the card.
    PointBeyondCard,
    /// The program reads a card that is inhibited, so the data never updates.
    ModuleInhibited,
    /// An input address on an output card, or the reverse.
    WrongDirection,
    /// A card nothing in the program uses.
    ModuleUnused,
}

impl HardwareIssue {
    /// Whether this reads the wrong terminal at runtime rather than merely
    /// being untidy.
    pub fn is_wrong_at_runtime(self) -> bool {
        matches!(
            self,
            HardwareIssue::NoModuleInSlot
                | HardwareIssue::PointBeyondCard
                | HardwareIssue::ModuleInhibited
                | HardwareIssue::WrongDirection
        )
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/ir/")]
#[serde(rename_all = "camelCase")]
pub struct HardwareFinding {
    pub issue: HardwareIssue,
    /// The tag, where one address is at fault.
    pub tag: Option<String>,
    pub detail: String,
}

/// A Rockwell address: `Local:2:I.Data.3`, or `Local:2:O.Data.0`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Address {
    pub chassis: String,
    pub slot: u32,
    /// I or O.
    pub input: bool,
    pub point: Option<u32>,
}

/// Read a slot-and-point address, or nothing.
///
/// Nothing is the right answer for a Siemens address like `I0.1`, which names
/// no slot: a byte address says nothing about which card it lands on, so
/// checking it against a module list is not possible and pretending otherwise
/// would invent findings.
pub fn parse_address(text: &str) -> Option<Address> {
    let mut parts = text.split(':');
    let chassis = parts.next()?.to_string();
    let slot: u32 = parts.next()?.parse().ok()?;
    let rest = parts.next()?;
    let mut bits = rest.split('.');
    let dir = bits.next()?;
    let input = match dir {
        "I" => true,
        "O" => false,
        _ => return None,
    };
    // Data.3, or just Data, or Ch0Data.
    let point = bits.last().and_then(|b| b.parse().ok());
    Some(Address { chassis, slot, input, point })
}

/// How many points a Rockwell catalogue number carries, where the number says.
///
/// Read off the digits in the catalogue number, which is the convention
/// Rockwell follows: 1756-IB16 is 16 points. Where it does not parse, the
/// answer is None and no check is made, rather than a guess that produces
/// confident wrong findings.
pub fn points_for(catalog: &str) -> Option<u32> {
    let digits: String = catalog
        .rsplit('-')
        .next()?
        .chars()
        .skip_while(|c| !c.is_ascii_digit())
        .take_while(|c| c.is_ascii_digit())
        .collect();
    match digits.parse::<u32>().ok()? {
        n @ (4 | 8 | 16 | 32) => Some(n),
        _ => None,
    }
}

/// What a catalogue number says the card does.
pub fn kind_for(catalog: &str) -> ModuleKind {
    let c = catalog.to_uppercase();
    let suffix = c.rsplit('-').next().unwrap_or("");
    // L is a controller, EN is Ethernet, then I/O by letter.
    if suffix.starts_with('L') {
        return ModuleKind::Controller;
    }
    if suffix.starts_with("EN") || suffix.starts_with("DNB") || suffix.starts_with("CN") {
        return ModuleKind::Communications;
    }
    match suffix.chars().next() {
        Some('I') if suffix.starts_with("IF") => ModuleKind::AnalogInput,
        Some('I') => ModuleKind::DigitalInput,
        Some('O') if suffix.starts_with("OF") => ModuleKind::AnalogOutput,
        Some('O') => ModuleKind::DigitalOutput,
        _ => ModuleKind::Other,
    }
}

impl Hardware {
    pub fn in_slot(&self, slot: u32) -> Option<&Module> {
        self.modules.iter().find(|m| m.slot == Some(slot))
    }

    /// Compare what the program addresses against what is in the racks.
    pub fn check(&self, project: &IrProject) -> Vec<HardwareFinding> {
        let mut out = Vec::new();
        if self.modules.is_empty() {
            return out;
        }

        let mut used: BTreeMap<u32, u32> = BTreeMap::new();

        // Two places an address appears, and a check that reads only one of
        // them finds nothing on half of real programs. A tag can carry the
        // address in its declaration, and a rung can name the module address
        // directly. Both are ordinary, and both are wrong in the same ways.
        struct Site {
            tag: String,
            address: String,
        }
        // Taken from the declarations rather than from the I/O list, because
        // the I/O list holds points the program actually uses. A tag declared
        // against a card and not yet referenced still means that card is
        // spoken for, and calling it unused would send somebody to pull a card
        // that is about to be wired.
        let mut sites: Vec<Site> = project
            .tags
            .iter()
            .chain(project.pous.iter().flat_map(|p| &p.local_tags))
            .filter_map(|t| {
                t.address.as_ref().map(|a| Site { tag: t.name.clone(), address: a.clone() })
            })
            .collect();
        for pou in &project.pous {
            let crate::PouBody::Ladder { rungs } = &pou.body else { continue };
            for rung in rungs {
                for i in rung.outputs.iter().chain(rung.logic.instructions()) {
                    for o in &i.operands {
                        if let crate::Operand::Tag { name } = o {
                            if parse_address(name).is_some() {
                                sites.push(Site { tag: name.clone(), address: name.clone() });
                            }
                        }
                    }
                }
            }
        }
        sites.sort_by(|a, b| a.address.cmp(&b.address));
        sites.dedup_by(|a, b| a.address == b.address);

        for point in &sites {
            let Some(addr) = parse_address(&point.address) else {
                continue;
            };
            *used.entry(addr.slot).or_default() += 1;

            let Some(module) = self.in_slot(addr.slot) else {
                out.push(HardwareFinding {
                    issue: HardwareIssue::NoModuleInSlot,
                    tag: Some(point.tag.clone()),
                    detail: format!(
                        "{} is at slot {} and there is no module in slot {}. The address is legal \
                         and reads nothing.",
                        point.tag, addr.slot, addr.slot
                    ),
                });
                continue;
            };

            if module.inhibited {
                out.push(HardwareFinding {
                    issue: HardwareIssue::ModuleInhibited,
                    tag: Some(point.tag.clone()),
                    detail: format!(
                        "{} is on {}, which is inhibited. The card is in the list and not in the \
                         machine, so this never changes.",
                        point.tag, module.name
                    ),
                });
            }

            if let (Some(p), Some(capacity)) = (addr.point, module.points) {
                if p >= capacity {
                    out.push(HardwareFinding {
                        issue: HardwareIssue::PointBeyondCard,
                        tag: Some(point.tag.clone()),
                        detail: format!(
                            "{} is point {p} on {}, which has {capacity}. Points are counted from \
                             zero, so the last one is {}.",
                            point.tag,
                            module.name,
                            capacity - 1
                        ),
                    });
                }
            }

            let wrong = match module.kind {
                ModuleKind::DigitalInput | ModuleKind::AnalogInput => !addr.input,
                ModuleKind::DigitalOutput | ModuleKind::AnalogOutput => addr.input,
                _ => false,
            };
            if wrong {
                out.push(HardwareFinding {
                    issue: HardwareIssue::WrongDirection,
                    tag: Some(point.tag.clone()),
                    detail: format!(
                        "{} is addressed as {} on {}, which is {}.",
                        point.tag,
                        if addr.input { "an input" } else { "an output" },
                        module.name,
                        match module.kind {
                            ModuleKind::DigitalInput | ModuleKind::AnalogInput => "an input card",
                            _ => "an output card",
                        }
                    ),
                });
            }
        }

        // A card nothing addresses is either spare or forgotten, and the
        // difference matters at commissioning.
        for m in &self.modules {
            let Some(slot) = m.slot else { continue };
            if matches!(m.kind, ModuleKind::Controller | ModuleKind::Communications) {
                continue;
            }
            if !used.contains_key(&slot) {
                out.push(HardwareFinding {
                    issue: HardwareIssue::ModuleUnused,
                    tag: None,
                    detail: format!(
                        "{} is in slot {slot} and nothing in the program addresses it. Either it \
                         is a spare or something is not wired up yet.",
                        m.name
                    ),
                });
            }
        }

        out.sort_by(|a, b| a.issue.cmp(&b.issue).then(a.detail.cmp(&b.detail)));
        out
    }

    /// The rack list, as it would appear in a handover document.
    pub fn to_text(&self) -> String {
        if self.modules.is_empty() {
            let mut s = String::from("No hardware configuration in this file.\n");
            for n in &self.notes {
                s.push_str(&format!("  {n}\n"));
            }
            return s;
        }
        let mut s = String::from("| Slot | Name | Catalogue | Type | Points | Revision |\n");
        s.push_str("|---|---|---|---|---|---|\n");
        let mut sorted: Vec<&Module> = self.modules.iter().collect();
        sorted.sort_by_key(|m| (m.slot.unwrap_or(u32::MAX), m.name.clone()));
        for m in sorted {
            s.push_str(&format!(
                "| {} | {}{} | {} | {:?} | {} | {} |\n",
                m.slot.map(|s| s.to_string()).unwrap_or_else(|| "-".into()),
                m.name,
                if m.inhibited { " (inhibited)" } else { "" },
                m.catalog.as_deref().unwrap_or("-"),
                m.kind,
                m.points.map(|p| p.to_string()).unwrap_or_else(|| "-".into()),
                m.revision.as_deref().unwrap_or("-"),
            ));
        }
        s
    }
}
