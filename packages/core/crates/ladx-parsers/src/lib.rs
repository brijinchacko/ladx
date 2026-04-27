//! Parsers for vendor PLC project formats. Phase 1 ships a minimal PLCopen
//! TC6 XML reader and an L5X stub; Phase 2-3 add full Rockwell L5X, Siemens
//! TIA XML, TwinCAT, and CODESYS.

pub mod l5x;
pub mod plcopen;

use ladx_types::{Project, ProjectStats, VendorKind};
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
pub fn parse_project_bytes(filename: &str, bytes: &[u8]) -> Result<Project> {
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

/// Build an empty `Project` with default stats for a given vendor and name.
pub(crate) fn empty_project(name: String, vendor: VendorKind) -> Project {
    let now = chrono::Utc::now();
    Project {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        vendor,
        created_at: now,
        updated_at: now,
        stats: ProjectStats::default(),
    }
}
