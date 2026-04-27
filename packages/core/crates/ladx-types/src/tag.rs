use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub struct Tag {
    pub name: String,
    pub data_type: String,
    pub address: Option<String>,
    pub description: Option<String>,
}
