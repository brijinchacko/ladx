//! ladx-audit — skeleton crate. See MASTER_BUILD_SPEC.md for scope. Phase 0
//! ships an empty crate so the workspace builds; later phases fill it in.

pub fn ladx_audit_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
