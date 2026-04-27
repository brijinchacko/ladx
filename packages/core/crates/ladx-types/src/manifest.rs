use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Lightweight manifest of a parsed project — names only, no source code.
/// Goal: small enough to inject into a chat system prompt for every turn.
/// For very large projects the consumer is expected to truncate.

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub struct RoutineRef {
    pub name: String,
    pub language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub struct TagRef {
    pub name: String,
    pub data_type: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub struct ProjectManifest {
    pub routines: Vec<RoutineRef>,
    pub tags: Vec<TagRef>,
    pub udts: Vec<String>,
    pub aois: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub struct ParseResult {
    pub project: crate::Project,
    pub manifest: ProjectManifest,
}
