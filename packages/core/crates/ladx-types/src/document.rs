use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub enum DocumentKind {
    Fds,
    Fat,
    Sat,
    IoList,
    Bom,
    Manual,
    ControlNarrative,
    AlarmPhilosophy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub enum RegulatoryRegime {
    None,
    Gamp5,
    Isa88,
    Isa106,
    Iec61511,
    Iec62443,
}
