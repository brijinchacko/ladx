//! The shape every vendor integration has, and the rule that none of them can
//! take the application down.
//!
//! The governing fact about vendor software is that it is usually absent.
//! Almost nobody has TIA Portal and Studio 5000 on the same machine, plenty of
//! people have neither, and an engineer opening LADX on a laptop to read an
//! exported file is in the normal case, not an error case. So "not installed"
//! is a first-class answer here rather than a failure: it is reported, it is
//! displayed, and it never becomes an exception that a caller has to catch or
//! a dialog somebody has to dismiss.
//!
//! The second rule follows from the first. A connector that is broken, or
//! panics, or is talking to a half-installed copy of something, must fail on
//! its own. [`Registry::detect_all`] therefore catches a panicking connector
//! and turns it into [`Availability::Unusable`] for that vendor alone. One bad
//! integration degrades one row in a settings list; it does not stop the
//! ladder editor from opening.

use ladx_types::VendorKind;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub fn ladx_vendor_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Whether a vendor's software can be used on this machine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/vendor/")]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum Availability {
    /// The ordinary case. Not an error, and not phrased as one.
    NotInstalled,
    /// Found and usable.
    Installed {
        /// As the vendor reports it, not as LADX guesses it.
        version: String,
    },
    /// Present but not usable, and able to say why.
    ///
    /// Distinct from `NotInstalled` because the two need completely different
    /// sentences in front of a person. "Install TIA Portal" is useless advice
    /// to somebody who has it installed and is not in the Openness users
    /// group, and that is the single most common way this fails in practice.
    Unusable {
        version: Option<String>,
        reason: UnusableReason,
        detail: String,
    },
}

impl Availability {
    pub fn is_usable(&self) -> bool {
        matches!(self, Availability::Installed { .. })
    }
}

/// Why installed software still cannot be driven.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/vendor/")]
#[serde(rename_all = "camelCase")]
pub enum UnusableReason {
    /// Installed, but the automation interface component is not.
    InterfaceMissing,
    /// Installed with the interface, but this account is not permitted to use
    /// it. On Siemens this is the Openness users group, and it is the most
    /// common failure of the lot.
    NotAuthorised,
    /// A version LADX has not verified against. Never assumed to work: the
    /// plan is explicit that each version is proved individually.
    VersionNotVerified,
    /// The bridge could not be started or did not answer.
    BridgeFailed,
    /// The connector itself misbehaved. Recorded rather than propagated.
    ConnectorFault,
}

/// What a connector can actually do, once it is usable.
///
/// Every field defaults to false. A connector advertises only what it has, so
/// forgetting to set one hides a feature rather than offering one that is not
/// there.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/vendor/")]
#[serde(rename_all = "camelCase")]
pub struct VendorCapabilities {
    /// Read a project and report what is in it.
    pub inspect: bool,
    /// Produce LADX IR from a project.
    pub export_ir: bool,
    /// Write LADX IR back into a vendor project.
    pub import_ir: bool,
    /// Compile, and return the vendor's own diagnostics. This is the only
    /// route to a validation level above LADX's own checks.
    pub compile: bool,
}

/// One vendor integration.
///
/// Deliberately small. Everything here is read-only and cheap, because it is
/// called to draw a settings list on a machine that may have none of this
/// software. Opening projects and writing to them live behind separate traits
/// that only a usable connector is asked for.
pub trait VendorConnector: Send + Sync {
    fn kind(&self) -> VendorKind;

    /// Look for the software. Must not panic, must not block for long, and
    /// must return `NotInstalled` rather than an error when it finds nothing.
    fn detect(&self) -> Availability;

    /// What this connector offers when it is usable.
    fn capabilities(&self) -> VendorCapabilities;
}

/// One vendor's answer, ready to put in front of somebody.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/vendor/")]
#[serde(rename_all = "camelCase")]
pub struct VendorStatus {
    pub vendor: VendorKind,
    pub availability: Availability,
    /// Empty unless the vendor is usable, so nothing advertises a capability
    /// it cannot currently perform.
    pub capabilities: VendorCapabilities,
}

/// Every connector this build knows about.
#[derive(Default)]
pub struct Registry {
    connectors: Vec<Box<dyn VendorConnector>>,
}

impl Registry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, connector: Box<dyn VendorConnector>) {
        self.connectors.push(connector);
    }

    pub fn len(&self) -> usize {
        self.connectors.len()
    }

    pub fn is_empty(&self) -> bool {
        self.connectors.is_empty()
    }

    /// Ask every connector, and let none of them stop the others.
    ///
    /// A connector that panics is caught here and reported as
    /// [`UnusableReason::ConnectorFault`] for that vendor. The alternative is
    /// that one broken integration takes down the process that draws the
    /// settings page, which would make a vendor nobody uses able to break the
    /// app for somebody who does not have it installed at all.
    pub fn detect_all(&self) -> Vec<VendorStatus> {
        self.connectors.iter().map(|c| Self::detect_one(c.as_ref())).collect()
    }

    fn detect_one(connector: &dyn VendorConnector) -> VendorStatus {
        let kind = connector.kind();

        let caught = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            (connector.detect(), connector.capabilities())
        }));

        match caught {
            Ok((availability, capabilities)) => {
                // Capabilities are only meaningful for something usable.
                let capabilities = if availability.is_usable() {
                    capabilities
                } else {
                    VendorCapabilities::default()
                };
                VendorStatus { vendor: kind, availability, capabilities }
            }
            Err(_) => {
                tracing::warn!(?kind, "vendor connector panicked during detection");
                VendorStatus {
                    vendor: kind,
                    availability: Availability::Unusable {
                        version: None,
                        reason: UnusableReason::ConnectorFault,
                        detail: "The integration for this vendor failed while checking for it. \
                                 Everything else is unaffected."
                            .into(),
                    },
                    capabilities: VendorCapabilities::default(),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fake {
        kind: VendorKind,
        availability: Availability,
        capabilities: VendorCapabilities,
        panics: bool,
    }

    impl Fake {
        fn missing(kind: VendorKind) -> Self {
            Self {
                kind,
                availability: Availability::NotInstalled,
                capabilities: VendorCapabilities::default(),
                panics: false,
            }
        }

        fn working(kind: VendorKind) -> Self {
            Self {
                kind,
                availability: Availability::Installed { version: "V21".into() },
                capabilities: VendorCapabilities {
                    inspect: true,
                    export_ir: true,
                    import_ir: true,
                    compile: true,
                },
                panics: false,
            }
        }

        fn exploding(kind: VendorKind) -> Self {
            Self { panics: true, ..Self::missing(kind) }
        }
    }

    impl VendorConnector for Fake {
        fn kind(&self) -> VendorKind {
            self.kind
        }
        fn detect(&self) -> Availability {
            if self.panics {
                panic!("this connector is broken");
            }
            self.availability.clone()
        }
        fn capabilities(&self) -> VendorCapabilities {
            self.capabilities
        }
    }

    /// The whole point of the crate.
    ///
    /// One broken integration must cost exactly one row. If this fails, a
    /// vendor somebody does not even have installed can stop the app for them.
    #[test]
    fn a_panicking_connector_does_not_take_the_others_with_it() {
        let mut r = Registry::new();
        r.register(Box::new(Fake::working(VendorKind::Siemens)));
        r.register(Box::new(Fake::exploding(VendorKind::Rockwell)));
        r.register(Box::new(Fake::missing(VendorKind::Beckhoff)));

        let all = r.detect_all();
        assert_eq!(all.len(), 3, "every vendor is still reported");

        assert!(all[0].availability.is_usable());
        assert!(all[0].capabilities.compile);

        assert!(matches!(
            all[1].availability,
            Availability::Unusable { reason: UnusableReason::ConnectorFault, .. }
        ));

        assert_eq!(all[2].availability, Availability::NotInstalled);
    }

    /// Absent vendor software is the ordinary case, not a failure.
    #[test]
    fn nothing_installed_is_a_normal_answer() {
        let mut r = Registry::new();
        r.register(Box::new(Fake::missing(VendorKind::Siemens)));
        r.register(Box::new(Fake::missing(VendorKind::Rockwell)));

        let all = r.detect_all();
        assert!(all.iter().all(|s| s.availability == Availability::NotInstalled));
        assert!(all.iter().all(|s| !s.availability.is_usable()));
    }

    /// A connector that is not usable must not advertise what it could do if
    /// it were, or the UI offers buttons that cannot work.
    #[test]
    fn an_unusable_vendor_advertises_nothing() {
        struct Liar;
        impl VendorConnector for Liar {
            fn kind(&self) -> VendorKind {
                VendorKind::Siemens
            }
            fn detect(&self) -> Availability {
                Availability::Unusable {
                    version: Some("V21".into()),
                    reason: UnusableReason::NotAuthorised,
                    detail: "This account is not in the Openness users group.".into(),
                }
            }
            fn capabilities(&self) -> VendorCapabilities {
                VendorCapabilities { inspect: true, export_ir: true, import_ir: true, compile: true }
            }
        }

        let mut r = Registry::new();
        r.register(Box::new(Liar));
        let all = r.detect_all();

        assert_eq!(all[0].capabilities, VendorCapabilities::default());
        assert!(!all[0].capabilities.inspect);
    }

    /// "Not installed" and "installed but you cannot use it" need different
    /// sentences. Telling somebody who has TIA Portal to install TIA Portal is
    /// the most common unhelpful error in this whole area.
    #[test]
    fn not_installed_and_not_authorised_stay_distinct() {
        let missing = Availability::NotInstalled;
        let unauthorised = Availability::Unusable {
            version: Some("V21".into()),
            reason: UnusableReason::NotAuthorised,
            detail: "Not in the Openness users group.".into(),
        };
        assert_ne!(missing, unauthorised);

        let json = serde_json::to_string(&unauthorised).unwrap();
        assert!(json.contains("notAuthorised"), "the reason survives serialisation: {json}");
        assert!(json.contains("V21"), "the version is kept, since it is known");
    }

    #[test]
    fn an_empty_registry_reports_nothing_rather_than_failing() {
        assert!(Registry::new().detect_all().is_empty());
    }

    #[test]
    fn availability_round_trips() {
        for a in [
            Availability::NotInstalled,
            Availability::Installed { version: "V21".into() },
            Availability::Unusable {
                version: None,
                reason: UnusableReason::InterfaceMissing,
                detail: "Openness is not installed.".into(),
            },
        ] {
            let json = serde_json::to_string(&a).unwrap();
            let back: Availability = serde_json::from_str(&json).unwrap();
            assert_eq!(back, a);
        }
    }
}
