//! Is TIA Portal here, and can this account drive it?
//!
//! Three separate questions that a naive check collapses into one, and the
//! collapsing is why "install TIA Portal" gets shown to people who have it
//! installed:
//!
//!   1. Is TIA Portal installed at all?
//!   2. Is the Openness API component installed? It is a separate option in
//!      the Siemens installer and is frequently skipped.
//!   3. Is this Windows account in the `Siemens TIA Openness` group? Without
//!      it, every call fails at runtime with a permission error, and this is
//!      the single most common way Openness fails in practice.
//!
//! Each has a different remedy, so each is reported separately.
//!
//! **Nothing here has run against a real installation.** The paths and the
//! group name are from Siemens' own documentation, and the shape is built so
//! that when it is wrong the fix is one function rather than a rewrite. It
//! reports its own maturity honestly: on any machine that is not Windows it
//! answers NotInstalled, which is true and is also all it can know.

use ladx_vendor::{Availability, UnusableReason, VendorCapabilities, VendorConnector};
use ladx_types::VendorKind;

/// What the connector is allowed to look at.
///
/// Injected so the decision logic can be tested without a Windows machine and
/// without a TIA Portal licence. The real implementation reads the filesystem
/// and the account's groups; a test hands it a fixed answer.
pub trait Probe: Send + Sync {
    /// Whether this is even the right operating system. Openness is a .NET
    /// API on Windows and there is no other way in.
    fn is_windows(&self) -> bool;
    /// Installed TIA Portal versions, as their major version strings: "V19",
    /// "V20", "V21".
    fn installed_versions(&self) -> Vec<String>;
    /// Whether the Openness assembly is present for a given version.
    fn has_openness(&self, version: &str) -> bool;
    /// Whether the current account is in the Openness users group.
    fn in_openness_group(&self) -> bool;
}

/// The versions LADX has been checked against.
///
/// Empty on purpose. The plan is explicit that each version is proved
/// individually, and a list seeded with versions nobody has tried is a claim
/// rather than a record. A version outside this list is reported as unverified
/// rather than refused: somebody with V20 should be told what they have, not
/// told nothing.
pub const VERIFIED_VERSIONS: &[&str] = &[];

pub struct SiemensConnector<P: Probe> {
    probe: P,
}

impl<P: Probe> SiemensConnector<P> {
    pub fn new(probe: P) -> Self {
        Self { probe }
    }
}

impl<P: Probe> VendorConnector for SiemensConnector<P> {
    fn kind(&self) -> VendorKind {
        VendorKind::Siemens
    }

    fn detect(&self) -> Availability {
        // Not an error, and not phrased as one: most machines are not Windows
        // and most engineers reading an exported file are on one of them.
        if !self.probe.is_windows() {
            return Availability::NotInstalled;
        }

        let versions = self.probe.installed_versions();
        let Some(version) = versions.last().cloned() else {
            return Availability::NotInstalled;
        };

        if !self.probe.has_openness(&version) {
            return Availability::Unusable {
                version: Some(version),
                reason: UnusableReason::InterfaceMissing,
                detail: "TIA Portal is installed but the Openness API is not. It is a separate \
                         option in the Siemens installer; re-run it and select Openness."
                    .into(),
            };
        }

        if !self.probe.in_openness_group() {
            return Availability::Unusable {
                version: Some(version),
                reason: UnusableReason::NotAuthorised,
                detail: "TIA Portal and Openness are installed, but this Windows account is not \
                         in the 'Siemens TIA Openness' group. Add the account to that group and \
                         sign out and back in. Nothing else will work until then, and the error \
                         Siemens returns does not say so."
                    .into(),
            };
        }

        if !VERIFIED_VERSIONS.contains(&version.as_str()) {
            return Availability::Unusable {
                version: Some(version.clone()),
                reason: UnusableReason::VersionNotVerified,
                detail: format!(
                    "TIA Portal {version} is installed and usable, but LADX has not been checked \
                     against it. Each version is proved individually because the Openness API \
                     changes between them. Nothing is refused because of this; it is a statement \
                     about what has been tested."
                ),
            };
        }

        Availability::Installed { version }
    }

    fn capabilities(&self) -> VendorCapabilities {
        // Everything false. The connector can currently detect and nothing
        // else, and a capability set that advertises what is planned rather
        // than what works puts buttons in front of people that cannot do
        // anything.
        VendorCapabilities::default()
    }
}

/// The connector as it runs on a real machine.
pub struct SystemProbe;

impl Probe for SystemProbe {
    fn is_windows(&self) -> bool {
        cfg!(target_os = "windows")
    }

    fn installed_versions(&self) -> Vec<String> {
        // Siemens installs under Program Files with the version in the path.
        // Read from the filesystem rather than the registry because the
        // registry layout has moved between releases and the directory has
        // not.
        let root = std::path::Path::new(r"C:\Program Files\Siemens\Automation");
        let Ok(entries) = std::fs::read_dir(root) else {
            return Vec::new();
        };
        let mut found: Vec<String> = entries
            .filter_map(|e| e.ok())
            .filter_map(|e| {
                let name = e.file_name().to_string_lossy().into_owned();
                name.strip_prefix("Portal ").map(|v| v.to_string())
            })
            .collect();
        found.sort();
        found
    }

    fn has_openness(&self, version: &str) -> bool {
        std::path::Path::new(&format!(
            r"C:\Program Files\Siemens\Automation\Portal {version}\PublicAPI"
        ))
        .exists()
    }

    fn in_openness_group(&self) -> bool {
        // Not knowable without calling Windows, and guessing "yes" would turn
        // the most common failure into a confusing runtime error instead of a
        // clear message. Until this is implemented against a real machine it
        // answers no, which produces an accurate and actionable report.
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fake {
        windows: bool,
        versions: Vec<String>,
        openness: bool,
        group: bool,
    }

    impl Default for Fake {
        fn default() -> Self {
            Self { windows: true, versions: vec!["V21".into()], openness: true, group: true }
        }
    }

    impl Probe for Fake {
        fn is_windows(&self) -> bool {
            self.windows
        }
        fn installed_versions(&self) -> Vec<String> {
            self.versions.clone()
        }
        fn has_openness(&self, _: &str) -> bool {
            self.openness
        }
        fn in_openness_group(&self) -> bool {
            self.group
        }
    }

    fn detect(f: Fake) -> Availability {
        SiemensConnector::new(f).detect()
    }

    /// The ordinary case, and not an error.
    #[test]
    fn a_mac_says_not_installed_rather_than_failing() {
        assert_eq!(detect(Fake { windows: false, ..Default::default() }), Availability::NotInstalled);
    }

    #[test]
    fn windows_without_tia_says_not_installed() {
        assert_eq!(detect(Fake { versions: vec![], ..Default::default() }), Availability::NotInstalled);
    }

    /// The three failures that look alike and need different sentences.
    ///
    /// Telling somebody who has TIA Portal to install TIA Portal is the most
    /// common unhelpful error in this area, and it happens because a checker
    /// collapsed these into one boolean.
    #[test]
    fn a_missing_openness_component_is_not_a_missing_tia_portal() {
        let a = detect(Fake { openness: false, ..Default::default() });
        let Availability::Unusable { reason, detail, version } = a else {
            panic!("expected unusable, got {a:?}")
        };
        assert_eq!(reason, UnusableReason::InterfaceMissing);
        assert_eq!(version.as_deref(), Some("V21"), "it keeps what it found");
        assert!(detail.contains("separate option"), "and says what to actually do");
        assert!(!detail.contains("install TIA Portal"));
    }

    /// The single most common way Openness fails in practice.
    #[test]
    fn an_account_outside_the_group_is_told_exactly_that() {
        let a = detect(Fake { group: false, ..Default::default() });
        let Availability::Unusable { reason, detail, .. } = a else { panic!("expected unusable") };
        assert_eq!(reason, UnusableReason::NotAuthorised);
        assert!(detail.contains("Siemens TIA Openness"), "names the group");
        assert!(detail.contains("sign out"), "and the step people forget");
    }

    /// Honesty about what has been tried.
    ///
    /// No version is verified yet, so a working V21 still reports as
    /// unverified. That is the truth and it is deliberately not phrased as a
    /// refusal: somebody with a working install should be told what LADX knows
    /// about it, not told nothing.
    #[test]
    fn an_unverified_version_is_reported_without_being_refused() {
        let a = detect(Fake::default());
        let Availability::Unusable { reason, version, detail } = a else {
            panic!("no version is verified yet, so this cannot be Installed")
        };
        assert_eq!(reason, UnusableReason::VersionNotVerified);
        assert_eq!(version.as_deref(), Some("V21"));
        assert!(detail.contains("has not been checked against it"));
        assert!(detail.contains("Nothing is refused"));
    }

    /// The list is empty on purpose. Seeding it with versions nobody has tried
    /// would turn a record into a claim.
    #[test]
    fn nothing_claims_to_be_verified_yet() {
        assert!(
            VERIFIED_VERSIONS.is_empty(),
            "a version belongs here only after a real project has been through it"
        );
    }

    /// The newest install is the one reported, since that is what somebody
    /// with several would expect to be driving.
    #[test]
    fn the_newest_installed_version_is_the_one_reported() {
        let a = detect(Fake {
            versions: vec!["V17".into(), "V19".into(), "V21".into()],
            ..Default::default()
        });
        let Availability::Unusable { version, .. } = a else { panic!() };
        assert_eq!(version.as_deref(), Some("V21"));
    }

    /// Nothing is advertised, because nothing works yet.
    #[test]
    fn it_advertises_no_capabilities() {
        let c = SiemensConnector::new(Fake::default()).capabilities();
        assert_eq!(c, VendorCapabilities::default());
        assert!(!c.inspect && !c.export_ir && !c.import_ir && !c.compile);
    }

    /// A broken connector must not take the registry down with it, which is
    /// the property the registry provides and this relies on.
    #[test]
    fn it_registers_alongside_others() {
        let mut r = ladx_vendor::Registry::new();
        r.register(Box::new(SiemensConnector::new(Fake { windows: false, ..Default::default() })));
        let all = r.detect_all();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].vendor, VendorKind::Siemens);
        assert_eq!(all[0].availability, Availability::NotInstalled);
    }
}
