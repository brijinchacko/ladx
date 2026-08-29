//! Vendor project import, the content path.
//!
//! Separate from `projects.rs`, which reads a project's names and is what the
//! project picker has always used. That path is untouched and stays the
//! default; this one reads the logic, and it is behind a flag because it is
//! not finished and must not quietly become the thing people depend on before
//! it is.
//!
//! Nothing here has been tested against Studio 5000. The flag says
//! `Planned` for exactly that reason, and it stays saying it until a project
//! exported by real software has been through this and back.

use crate::state::AppState;
use ladx_ir::IrProject;
use ladx_ir::fidelity::ConversionReport;
use ladx_types::FeatureFlag;
use serde::Serialize;

/// A project read out of a vendor file, and what the reading cost.
#[derive(Serialize)]
pub struct VendorImport {
    pub project: IrProject,
    pub report: ConversionReport,
    /// One line, for putting in front of somebody without making them read the
    /// whole report.
    pub summary: String,
}

/// Whether the caller is allowed to be here.
///
/// Read from settings on every call rather than cached at boot. Somebody who
/// turns the flag on expects it to take effect, and a cached answer would make
/// the toggle look broken.
fn require(state: &tauri::State<'_, AppState>, flag: FeatureFlag) -> Result<(), String> {
    let settings = crate::commands::settings::load(state)?;
    if settings.features.is_on(flag) {
        return Ok(());
    }
    Err(format!(
        "{} is switched off. Turn it on in Settings if you want to try it; it is not finished.",
        flag.label()
    ))
}

/// Read an L5X into the IR, with its conversion report.
#[tauri::command]
pub fn l5x_import(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<VendorImport, String> {
    require(&state, FeatureFlag::VendorRockwell)?;

    let bytes = std::fs::read(&path).map_err(|e| format!("could not read {path}: {e}"))?;
    let import = ladx_parsers::l5x_ir::parse_to_ir(&bytes).map_err(|e| e.to_string())?;

    state
        .audit
        .log("user", "l5x_import", Some(&path))
        .ok();

    Ok(VendorImport {
        summary: import.report.summary(),
        project: import.project,
        report: import.report,
    })
}

/// Write an IR project back out as an L5X.
#[tauri::command]
pub fn l5x_export(
    state: tauri::State<'_, AppState>,
    project: IrProject,
) -> Result<String, String> {
    require(&state, FeatureFlag::VendorRockwell)?;
    let out = ladx_parsers::l5x_write::write(&project).map_err(|e| e.to_string())?;
    state.audit.log("user", "l5x_export", Some(&project.name)).ok();
    Ok(out.xml)
}

#[cfg(test)]
mod tests {
    use ladx_types::{FeatureFlag, FeatureSet};

    /// The gate is the point of this module, so it is worth stating plainly:
    /// nothing here runs unless somebody switched it on.
    #[test]
    fn the_flag_is_off_until_somebody_turns_it_on() {
        let f = FeatureSet::default();
        assert!(!f.is_on(FeatureFlag::VendorRockwell));
    }

    #[test]
    fn turning_it_on_only_turns_that_one_on() {
        let mut f = FeatureSet::default();
        f.enable(FeatureFlag::VendorRockwell);
        assert!(f.is_on(FeatureFlag::VendorRockwell));
        assert!(!f.is_on(FeatureFlag::VendorSiemens));
    }
}
