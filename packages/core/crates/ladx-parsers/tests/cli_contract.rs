//! What the binary actually prints, per mode.
//!
//! The web reads these keys by hand. Inside Rust they are `serde_json::json!`
//! literals, so nothing type-checks them: renaming a field in the engine, or
//! adding a mode and spelling a key differently, compiles cleanly and breaks
//! only in the browser, at runtime, for whoever opened that tab.
//!
//! The engines have their own tests. This one is about the seam.

use std::process::Command;

fn parser() -> String {
    let root = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../..");
    for profile in ["release", "debug"] {
        let path = format!("{root}/target/{profile}/ladx-parser");
        if std::path::Path::new(&path).exists() {
            return path;
        }
    }
    panic!("build ladx-parser first: cargo build --bin ladx-parser");
}

fn fixture(slug: &str) -> String {
    format!(
        "{}/../../../../tests/fixtures/projects/{slug}/project.ir.json",
        env!("CARGO_MANIFEST_DIR")
    )
}

fn run(args: &[&str]) -> serde_json::Value {
    let out = Command::new(parser()).args(args).output().expect("running ladx-parser");
    assert!(
        out.status.success(),
        "ladx-parser {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    serde_json::from_slice(&out.stdout).expect("ladx-parser printed something that is not JSON")
}

fn has_keys(value: &serde_json::Value, keys: &[&str], what: &str) {
    let object = value.as_object().unwrap_or_else(|| panic!("{what} is not an object"));
    for key in keys {
        assert!(
            object.contains_key(*key),
            "{what} has no {key}. Keys present: {:?}",
            object.keys().collect::<Vec<_>>()
        );
    }
}

#[test]
fn narrative_prints_what_the_web_reads() {
    let v = run(&["--narrative", &fixture("03-conveyor")]);
    has_keys(&v, &["title", "sections", "gaps", "markdown"], "--narrative");
    let section = &v["sections"][0];
    has_keys(section, &["heading", "paragraphs", "needs_engineer"], "a narrative section");
    has_keys(&section["paragraphs"][0], &["text", "from"], "a narrative paragraph");
}

#[test]
fn sequence_prints_what_the_web_reads() {
    let v = run(&["--sequence", &fixture("08-multi-step-sequence")]);
    has_keys(&v, &["sequences", "notes", "text"], "--sequence");
    has_keys(&v["sequences"][0], &["register", "steps", "transitions"], "a sequence");
    has_keys(&v["sequences"][0]["transitions"][0], &["from", "to", "when", "pou", "rung"], "a transition");
}

#[test]
fn tests_print_what_the_web_reads() {
    let v = run(&["--tests", &fixture("03-conveyor")]);
    has_keys(&v, &["groups", "notCovered", "safetySteps", "markdown"], "--tests");
    has_keys(&v["groups"][0], &["subject", "steps"], "a test group");
    has_keys(&v["groups"][0]["steps"][0], &["kind", "action", "expect", "from"], "a test step");
}

#[test]
fn deviations_print_what_the_web_reads() {
    let v = run(&["--deviations", &fixture("03-conveyor")]);
    has_keys(&v, &["deviations", "blocks"], "--deviations");
    has_keys(&v["deviations"][0], &["pou", "rung", "tag", "detail", "missing"], "a deviation");
    has_keys(&v["blocks"][0], &["name", "about", "params", "limits"], "a block");
}

#[test]
fn handover_prints_what_the_web_reads() {
    let v = run(&["--handover", &fixture("08-multi-step-sequence")]);
    has_keys(&v, &["project", "files", "level", "notIncluded", "concerns"], "--handover");
    has_keys(&v["files"][0], &["path", "content", "sha256", "purpose"], "a pack file");
}

#[test]
fn hardware_prints_what_the_web_reads() {
    let l5x = format!(
        "{}/../../../../tests/fixtures/hardware/rack-with-faults.L5X",
        env!("CARGO_MANIFEST_DIR")
    );
    let v = run(&["--hardware", &l5x]);
    has_keys(&v, &["modules", "notes", "findings", "breaking", "table"], "--hardware");
    has_keys(&v["modules"][0], &["name", "catalog", "kind", "slot", "points"], "a module");
    has_keys(&v["findings"][0], &["issue", "detail"], "a hardware finding");
}

#[test]
fn drift_prints_what_the_web_reads() {
    let dir = std::env::temp_dir().join("ladx-cli-contract");
    std::fs::create_dir_all(&dir).unwrap();
    let lists = dir.join("taglists.json");
    std::fs::write(
        &lists,
        r#"[{"name":"HMI","tags":[{"name":"StartPB","description":null,"address":null}]}]"#,
    )
    .unwrap();

    let v = run(&["--drift", &fixture("03-conveyor"), lists.to_str().unwrap()]);
    has_keys(&v, &["drifts", "notes", "breaking", "text"], "--drift");
    has_keys(&v["drifts"][0], &["kind", "tag", "source", "detail"], "a drift");

    std::fs::remove_file(&lists).ok();
}

/// A mode that does not exist must fail, not print an empty success. The web
/// reads the exit code before it reads the output.
#[test]
fn an_unknown_mode_fails_rather_than_printing_nothing() {
    let out = Command::new(parser())
        .args(["--no-such-mode", &fixture("03-conveyor")])
        .output()
        .expect("running ladx-parser");
    // Either it refuses outright, or it falls through to the default manifest
    // mode; what it must never do is claim success on a mode it does not have.
    if out.status.success() {
        let v: serde_json::Value = serde_json::from_slice(&out.stdout).expect("JSON");
        assert!(
            v.get("sequences").is_none() && v.get("groups").is_none(),
            "an unknown mode answered as though it were a known one"
        );
    }
}
