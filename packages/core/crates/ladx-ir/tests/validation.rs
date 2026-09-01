//! What a validation level is allowed to claim.

use ladx_ir::validation::{ClaimError, Level, Validation};

/// The rule the whole thing turns on.
///
/// Levels above IEC are claims about what somebody else's software did. No
/// amount of internal checking produces one, and LADX asking for it is a
/// mistake rather than an optimistic estimate.
#[test]
fn ladx_cannot_award_itself_a_vendor_level() {
    let err = Validation::claim(
        Level::VendorCompiled,
        vec!["LADX structural checks".into()],
        None,
    )
    .unwrap_err();
    assert_eq!(err, ClaimError::NeedsVendor { level: Level::VendorCompiled });

    assert!(Validation::claim(Level::VendorImported, vec!["x".into()], None).is_err());
    assert!(Validation::claim(Level::Simulated, vec!["x".into()], None).is_err());
}

/// And it refuses rather than quietly recording a lower one, because a caller
/// asking for level 4 without a compiler result has made a mistake and hiding
/// it here is the worst place to hide it.
#[test]
fn a_bad_claim_is_refused_rather_than_downgraded() {
    let result = Validation::claim(Level::VendorCompiled, vec!["something".into()], None);
    assert!(result.is_err(), "it must not silently become Structural");
}

#[test]
fn the_levels_ladx_can_award_are_the_three_it_performs() {
    for level in [Level::Generated, Level::Structural, Level::Iec] {
        assert!(level.is_self_awardable(), "{level:?}");
        assert!(Validation::claim(level, vec!["checked".into()], None).is_ok());
    }
    for level in [Level::VendorImported, Level::VendorCompiled, Level::Simulated] {
        assert!(!level.is_self_awardable(), "{level:?}");
    }
}

#[test]
fn a_vendor_claim_carries_the_version() {
    let v = Validation::claim(
        Level::VendorCompiled,
        vec!["Compiled without errors".into()],
        Some(("TIA Portal".into(), "V21".into())),
    )
    .unwrap();
    assert_eq!(v.summary(), "Compiled by vendor software (TIA Portal V21)");
}

/// A level with nothing behind it is a badge rather than a statement.
#[test]
fn a_level_has_to_say_what_earned_it() {
    assert_eq!(
        Validation::claim(Level::Structural, vec![], None).unwrap_err(),
        ClaimError::NoEvidence
    );
}

/// Every level says what it does not mean, because the failure here is not a
/// lie but somebody reading more into a green tick than is in it.
#[test]
fn every_level_states_its_own_limit() {
    for level in [
        Level::Generated,
        Level::Structural,
        Level::Iec,
        Level::VendorImported,
        Level::VendorCompiled,
        Level::Simulated,
    ] {
        assert!(!level.caveat().is_empty(), "{level:?} has no caveat");
        assert!(!level.label().is_empty());
    }

    // The two that get over-read the most.
    assert!(Level::Structural.caveat().contains("No compiler has seen it"));
    assert!(Level::VendorCompiled.caveat().contains("never run"));
    assert!(Level::Simulated.caveat().contains("does not replace"));
}

/// No level says a thing is ready for a controller, including the highest.
#[test]
fn nothing_is_ever_production_ready() {
    for level in [Level::Generated, Level::Structural, Level::Iec, Level::VendorCompiled, Level::Simulated] {
        assert!(!level.is_production_ready(), "{level:?} must not claim that");
    }
}

#[test]
fn levels_are_ordered_by_strength_of_claim() {
    assert!(Level::Generated < Level::Structural);
    assert!(Level::Structural < Level::Iec);
    assert!(Level::Iec < Level::VendorImported);
    assert!(Level::VendorImported < Level::VendorCompiled);
    assert!(Level::VendorCompiled < Level::Simulated);
}
