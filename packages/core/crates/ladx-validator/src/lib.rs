//! Validators for generated PLC code. Two backends are wired today:
//!
//! - **Light** (`light.rs`): pure-Rust IEC 61131-3 sanity checks, balanced
//!   `IF/END_IF`, `FOR/END_FOR`, `CASE/END_CASE`, `WHILE/END_WHILE`,
//!   `FUNCTION_BLOCK/END_FUNCTION_BLOCK`, etc.; bracket parity; statement
//!   terminators. Catches obvious problems without external deps.
//!
//! - **matiec** (`matiec.rs`): subprocess wrapper around the matiec
//!   compiler. Production-grade. Requires the `matiec` binary on PATH or
//!   at `$LADX_MATIEC_BIN`. Returns a "matiec not configured" report when
//!   missing, caller decides whether to fall back to Light.
//!
//! Phase 1 surfaces validator output to the UI. Auto-retry-with-feedback
//! (per spec §8.1) is an upcoming sub-phase that wraps an `LlmClient` and
//! a `Validator`; this crate provides the `Validator` half.

pub mod light;
pub mod matiec;

use ladx_types::ValidatorReport;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ValidatorError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("subprocess error: {0}")]
    Subprocess(String),
    #[error("backend unavailable: {0}")]
    Unavailable(String),
}

pub type Result<T> = std::result::Result<T, ValidatorError>;

pub trait Validator {
    fn name(&self) -> &'static str;
    fn validate_st(&self, source: &str) -> Result<ValidatorReport>;
}

/// Try the primary backend; if it reports `Unavailable`, fall back to the
/// secondary. Used in production to prefer matiec when present and fall
/// through to Light in dev / when the binary is missing.
pub fn validate_with_fallback<P, F>(
    primary: &P,
    fallback: &F,
    source: &str,
) -> Result<ValidatorReport>
where
    P: Validator,
    F: Validator,
{
    match primary.validate_st(source) {
        Ok(report) => Ok(report),
        Err(ValidatorError::Unavailable(_)) => fallback.validate_st(source),
        Err(e) => Err(e),
    }
}
