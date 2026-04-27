//! Shared types that cross the FFI boundary into TypeScript.
//!
//! Every public struct/enum here derives `serde::{Serialize, Deserialize}` and
//! `ts_rs::TS`, with `#[ts(export, export_to = "../../../../types/src/generated/")]`
//! pointing at `packages/types/src/generated/`.
//!
//! After modifying any type, run `pnpm test:rust` to regenerate bindings.

pub mod audit;
pub mod document;
pub mod hmi;
pub mod memory;
pub mod plc;
pub mod project;
pub mod tag;

pub use audit::*;
pub use document::*;
pub use hmi::*;
pub use memory::*;
pub use plc::*;
pub use project::*;
pub use tag::*;
