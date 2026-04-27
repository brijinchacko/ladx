use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub enum PlcLanguage {
    Ladder,
    StructuredText,
    FunctionBlock,
    InstructionList,
    SequentialFunctionChart,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub struct PlcRoutine {
    pub name: String,
    pub language: PlcLanguage,
    pub source: String,
}
