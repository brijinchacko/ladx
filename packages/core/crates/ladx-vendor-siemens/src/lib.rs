//! Siemens TIA Portal.
//!
//! Nothing here talks to TIA Portal yet. What it does is the part that can be
//! written and checked without it: turning the IR into SCL that S7 will
//! actually accept, which is mostly a matter of not writing IEC structured
//! text and calling it Siemens.
//!
//! The connector itself, detection, Openness, and a project on disk, comes
//! next and cannot be verified from here.

pub mod scl;
pub mod time;

pub fn ladx_vendor_siemens_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
