//! The operator interface, proposed from the program.
//!
//! The rich HMI model lives in `packages/hmi` and is what the editor works on.
//! This is the part that can be computed rather than drawn: which tags an
//! operator needs to see, which they need to touch, and which are faults. The
//! program already answers all three.

pub mod propose;

pub fn ladx_hmi_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
