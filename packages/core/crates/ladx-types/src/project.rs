use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub vendor: VendorKind,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub stats: ProjectStats,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub enum VendorKind {
    Siemens,
    Rockwell,
    Beckhoff,
    Codesys,
    Mitsubishi,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub struct ProjectStats {
    pub tag_count: u32,
    pub routine_count: u32,
    pub udt_count: u32,
    pub aoi_count: u32,
    pub hmi_screen_count: u32,
}
