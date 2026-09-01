//! The tag lists, compared.

use ladx_ir::drift::{drift, DriftKind, ExternalTag, Source};
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

fn hmi(tags: &[(&str, Option<&str>, Option<&str>)]) -> Source {
    Source {
        name: "HMI".into(),
        tags: tags
            .iter()
            .map(|(n, d, a)| ExternalTag {
                name: (*n).into(),
                description: d.map(String::from),
                address: a.map(String::from),
            })
            .collect(),
    }
}

/// The finding that matters: a rename that was not carried through reads as a
/// typo, not as two unrelated missing tags.
#[test]
fn a_near_miss_is_called_a_rename_not_two_missing_tags() {
    let p = fixture("01-motor-starter");
    // A tag with punctuation in it, which is where this drift actually happens.
    let real = p.tags.iter().find(|t| t.name.contains('_')).unwrap().name.clone();
    // What the HMI still calls it after somebody renamed the PLC tag.
    let stale = real.replace('_', "");

    let r = drift(&p, &[hmi(&[(&stale, None, None)])]);
    let d = r
        .drifts
        .iter()
        .find(|d| d.kind == DriftKind::ProbableRename)
        .expect("should spot the rename");
    assert_eq!(d.tag, stale);
    assert_eq!(d.counterpart.as_deref(), Some(real.as_str()));

    // And it must NOT also be reported as missing from each side.
    assert!(!r.drifts.iter().any(|d| d.kind == DriftKind::MissingFromPlc));
    assert!(
        !r.drifts.iter().any(|d| d.kind == DriftKind::MissingFromSource && d.tag == real),
        "the renamed tag was accounted for"
    );
}

/// Punctuation drift is the commonest kind and is not an edit-distance case.
#[test]
fn punctuation_only_differences_are_the_same_tag() {
    let p = fixture("01-motor-starter");
    let real = p.tags.iter().find(|t| t.name.contains('_')).unwrap().name.clone();
    let r = drift(&p, &[hmi(&[(&real.to_lowercase().replace('_', "-"), None, None)])]);
    assert_eq!(
        r.drifts.iter().filter(|d| d.kind == DriftKind::ProbableRename).count(),
        1
    );
}

/// A tag nothing close to exists is genuinely missing, and that one breaks at
/// runtime rather than at build time.
#[test]
fn a_tag_with_no_counterpart_is_missing_and_breaks_at_runtime() {
    let r = drift(&fixture("01-motor-starter"), &[hmi(&[("Totally_Unrelated_Thing", None, None)])]);
    let d = r.drifts.iter().find(|d| d.tag == "Totally_Unrelated_Thing").unwrap();
    assert_eq!(d.kind, DriftKind::MissingFromPlc);
    assert!(d.kind.breaks_at_runtime());
    assert!(!r.breaking().is_empty());
}

/// Same name, different address: somebody is wired to the wrong terminal.
#[test]
fn a_disagreeing_address_is_reported_and_breaks_at_runtime() {
    let p = fixture("01-motor-starter");
    let t = p.tags.iter().find(|t| t.address.is_some()).expect("an addressed tag");
    let r = drift(&p, &[hmi(&[(&t.name, None, Some("Local:9:I.Data.7"))])]);
    let d = r.drifts.iter().find(|d| d.kind == DriftKind::AddressDisagrees).unwrap();
    assert_eq!(d.tag, t.name);
    assert!(d.kind.breaks_at_runtime());
}

/// A matching address must not be reported. A checker that flags everything
/// gets switched off.
#[test]
fn agreement_is_silent() {
    let p = fixture("01-motor-starter");
    let all: Vec<_> = p
        .tags
        .iter()
        .map(|t| ExternalTag {
            name: t.name.clone(),
            description: t.comment.clone(),
            address: t.address.clone(),
        })
        .collect();
    let r = drift(&p, &[Source { name: "HMI".into(), tags: all }]);
    assert!(r.drifts.is_empty(), "found {:?}", r.drifts);
    assert!(r.to_text().contains("The lists agree"));
}

/// Only tags wired to hardware are expected elsewhere. Reporting every
/// internal working bit as missing from the HMI would bury the real findings.
#[test]
fn internal_bits_are_not_expected_on_the_hmi() {
    let p = fixture("03-conveyor");
    let r = drift(&p, &[hmi(&[])]);
    let missing: Vec<&str> =
        r.drifts.iter().filter(|d| d.kind == DriftKind::MissingFromSource).map(|d| d.tag.as_str()).collect();
    assert!(!missing.is_empty(), "the wired I/O should be reported");
    let io = ladx_ir::io::io_list(&p);
    for tag in &missing {
        assert!(
            io.points.iter().any(|pt| &pt.tag == tag),
            "{tag} is not wired to anything and should not be expected on the HMI"
        );
    }
}

/// With nothing to compare against, say so rather than reporting no drift.
#[test]
fn no_sources_is_not_the_same_as_no_drift() {
    let r = drift(&fixture("01-motor-starter"), &[]);
    assert!(r.drifts.is_empty());
    assert!(r.notes.iter().any(|n| n.contains("Nothing to compare against")));
}
