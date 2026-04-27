use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub enum MemoryCollection {
    ProjectContext,
    AcceptedPairs,
    CuratedPatterns,
    ForbiddenPatterns,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub struct MemoryEntry {
    pub id: String,
    pub collection: MemoryCollection,
    pub content: String,
    pub label: Option<String>,
}
