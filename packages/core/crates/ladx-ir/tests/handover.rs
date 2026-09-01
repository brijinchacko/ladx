//! The pack that gets handed over.

use ladx_ir::drift::{ExternalTag, Source};
use ladx_ir::handover::{pack, PackInputs};
use ladx_ir::validation::{Level, Validation};
use ladx_ir::IrProject;
use std::path::PathBuf;

fn fixture(slug: &str) -> IrProject {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../..")
        .join("tests/fixtures/projects")
        .join(slug)
        .join("project.ir.json");
    serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap()
}

#[test]
fn the_manifest_comes_first_and_lists_everything_else() {
    let p = pack(&fixture("03-conveyor"), &PackInputs::default());
    assert_eq!(p.files[0].path, "00-manifest.md");
    for f in &p.files[1..] {
        assert!(p.files[0].content.contains(&f.path), "{} is not in the manifest", f.path);
    }
}

/// A checksum that does not match its file is worse than no checksum.
#[test]
fn every_checksum_is_the_checksum_of_the_file_it_sits_next_to() {
    use sha2::{Digest, Sha256};
    let p = pack(&fixture("03-conveyor"), &PackInputs::default());
    for f in &p.files {
        assert_eq!(f.sha256, format!("{:x}", Sha256::digest(f.content.as_bytes())), "{}", f.path);
    }
}

/// Same program in, same pack out. A checksum that changes on its own proves
/// nothing.
#[test]
fn the_same_program_produces_the_same_checksums() {
    let a = pack(&fixture("03-conveyor"), &PackInputs::default());
    let b = pack(&fixture("03-conveyor"), &PackInputs::default());
    let sums = |p: &ladx_ir::handover::Pack| {
        p.files.iter().map(|f| f.sha256.clone()).collect::<Vec<_>>()
    };
    assert_eq!(sums(&a), sums(&b));
}

/// The pack must never read as though it were complete.
#[test]
fn the_pack_says_what_it_cannot_contain() {
    let p = pack(&fixture("03-conveyor"), &PackInputs::default());
    assert!(p.not_included.iter().any(|n| n.contains("Wiring drawings")));
    assert!(p.not_included.iter().any(|n| n.contains("commissioning record")));
    assert!(p.not_included.iter().any(|n| n.contains("Signed test sheets")));
    let m = &p.files[0].content;
    assert!(m.contains("Not in this pack"));
    assert!(
        m.contains("ready to run a plant"),
        "the manifest must say the program is not signed off"
    );
}

/// The level is the one that was earned. A pack cannot promote itself.
#[test]
fn the_manifest_states_the_level_actually_reached() {
    let p = pack(&fixture("03-conveyor"), &PackInputs::default());
    assert_eq!(p.level, Level::Generated);

    let v = Validation::ladx_structural(vec!["LADX structural checks".into()]);
    let p = pack(
        &fixture("03-conveyor"),
        &PackInputs { validation: Some(v), ..Default::default() },
    );
    assert_eq!(p.level, Level::Structural);
    assert!(p.files[0].content.contains("LADX structural checks"));
    assert!(p.files[0].content.contains("ready to run a plant"), "still not signed off");
}

/// Handing over with a runtime-breaking tag disagreement unresolved means the
/// fault turns up on site. The pack has to say so before it is sent.
#[test]
fn runtime_breaking_drift_becomes_a_concern_on_the_manifest() {
    let src = Source {
        name: "HMI".into(),
        tags: vec![ExternalTag {
            name: "Recipe_Number".into(),
            description: None,
            address: None,
        }],
    };
    let p = pack(
        &fixture("03-conveyor"),
        &PackInputs { other_tag_lists: std::slice::from_ref(&src), ..Default::default() },
    );
    assert!(p.concerns.iter().any(|c| c.contains("break at runtime")), "{:?}", p.concerns);
    assert!(p.files[0].content.contains("Before this is sent"));
    assert!(p.file("05-tag-list-comparison.md").is_some());
}

/// With no list to compare against, the absence of findings is not a finding.
#[test]
fn no_tag_list_is_itself_a_concern() {
    let p = pack(&fixture("03-conveyor"), &PackInputs::default());
    assert!(p.file("05-tag-list-comparison.md").is_none());
    assert!(p.concerns.iter().any(|c| c.contains("nothing was checked against the program")));
}

/// A safety tag that never reaches an output is the finding worth acting on,
/// and it is different from having no safety at all.
#[test]
fn safety_that_does_not_reach_the_outputs_is_named() {
    let p = pack(&fixture("08-multi-step-sequence"), &PackInputs::default());
    let c = p
        .concerns
        .iter()
        .find(|c| c.contains("EStop_OK"))
        .expect("should name the tag");
    assert!(c.contains("does not appear directly on any output"));
}

/// A program with no sequence does not get an empty sequence document.
#[test]
fn documents_with_nothing_to_say_are_left_out() {
    let p = pack(&fixture("01-motor-starter"), &PackInputs::default());
    assert!(p.file("03-sequence-of-operation.md").is_none());
    let p = pack(&fixture("08-multi-step-sequence"), &PackInputs::default());
    assert!(p.file("03-sequence-of-operation.md").is_some());
}
