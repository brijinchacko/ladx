// ts-rs writes one .ts file per type that derives `TS` with `#[ts(export)]`
// during `cargo test`. This file is intentionally empty — the export side-
// effect happens via the `__export_bindings_*` tests that ts-rs's derive
// macro injects into the crate. Adding any `#[test]` here is fine; we just
// need at least one test target to exist.

#[test]
fn bindings_export_runs() {
    // No-op. The real work is done by tests injected by `#[derive(TS)]`.
}
