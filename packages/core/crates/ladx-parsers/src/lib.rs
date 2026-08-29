//! Parsers for vendor PLC project formats. Phase 1 ships PLCopen TC6
//! and Rockwell L5X readers that emit a `ParseResult` (a `Project` plus
//! a `ProjectManifest` with routine/tag/UDT/AOI names). Phase 2-3 add
//! Siemens TIA XML, TwinCAT, and CODESYS.

pub mod l5x;
pub mod l5x_ir;
pub mod l5x_write;
pub mod plcopen;

use ladx_types::{ParseResult, Project, ProjectManifest, ProjectStats, VendorKind};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ParseError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("XML error: {0}")]
    Xml(#[from] quick_xml::Error),
    #[error("XML attribute error: {0}")]
    XmlAttr(#[from] quick_xml::events::attributes::AttrError),
    #[error("Unsupported file format: {0}")]
    Unsupported(String),
    #[error("Schema mismatch: {0}")]
    Schema(String),
    #[error("UTF-8 error: {0}")]
    Utf8(#[from] std::str::Utf8Error),
}

pub type Result<T> = std::result::Result<T, ParseError>;

/// Parse a project file from disk. Format is detected by extension.
pub fn parse_project_bytes(filename: &str, bytes: &[u8]) -> Result<ParseResult> {
    let ext = std::path::Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    match ext.as_str() {
        "xml" => plcopen::parse(bytes, filename),
        "l5x" => l5x::parse(bytes, filename),
        other => Err(ParseError::Unsupported(other.into())),
    }
}

/// Build a `Project` populated from a manifest. The stats are derived from
/// the manifest counts so list and counts can never disagree.
pub(crate) fn finalize(
    name: String,
    vendor: VendorKind,
    manifest: ProjectManifest,
) -> ParseResult {
    let now = chrono::Utc::now();
    let stats = ProjectStats {
        tag_count: manifest.tags.len() as u32,
        routine_count: manifest.routines.len() as u32,
        udt_count: manifest.udts.len() as u32,
        aoi_count: manifest.aois.len() as u32,
        hmi_screen_count: 0,
    };
    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        vendor,
        created_at: now,
        updated_at: now,
        stats,
    };
    ParseResult { project, manifest }
}
