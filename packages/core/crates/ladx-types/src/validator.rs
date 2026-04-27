use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub struct ValidatorDiagnostic {
    pub severity: DiagnosticSeverity,
    /// 1-based line number; 0 if unknown.
    pub line: u32,
    /// 1-based column number; 0 if unknown.
    pub column: u32,
    pub message: String,
    /// Identifier of the rule / origin (e.g. "matiec", "light:end-keyword").
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/")]
pub struct ValidatorReport {
    pub ok: bool,
    pub language: String,
    pub backend: String,
    pub diagnostics: Vec<ValidatorDiagnostic>,
}
