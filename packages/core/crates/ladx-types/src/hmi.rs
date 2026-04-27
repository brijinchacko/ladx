use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub enum HmiPlatform {
    IgnitionPerspective,
    WinCcUnified,
    TwinCatHmi,
    FactoryTalkView,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub struct HmiScreen {
    pub name: String,
    pub platform: HmiPlatform,
}
