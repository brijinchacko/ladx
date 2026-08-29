//! Per-install settings (currently just the chosen Ollama model). We
//! write to %APPDATA%\ladX\settings.json on Windows, the equivalent on
//! macOS / Linux. Frontend never touches the disk directly, it always
//! goes through these commands.

use serde::{Deserialize, Serialize};

use crate::state::AppState;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioSettings {
    /// Last user-selected Ollama model name. None = use the auto-suggested.
    #[serde(default)]
    pub default_model: Option<String>,
    /// Where projects live.
    ///
    /// Asked once rather than per project. Somebody who keeps work in one
    /// place should not be picking it every time, and somebody who does not
    /// can still choose per project when creating one.
    #[serde(default)]
    pub workspace_dir: Option<String>,
    /// The project folder that was open when the app last closed.
    ///
    /// Reopened on launch. Somebody who spent yesterday on one job is
    /// overwhelmingly likely to be on it again this morning, and being put back
    /// where they were is the difference between a tool and a filing cabinet.
    #[serde(default)]
    pub last_project: Option<String>,
    /// Whether the sidebar is collapsed to icons.
    ///
    /// In settings.json rather than localStorage, which this app does not use.
    /// The web app keeps the same preference in localStorage; the difference is
    /// where it is stored, not what it does.
    #[serde(default)]
    pub sidebar_collapsed: bool,
    /// Whether to look for a new version on launch.
    ///
    /// Off unless somebody turns it on, and that default is the whole point.
    /// This app is sold on making no outbound call, and a plant that has air
    /// gapped the machine has to be able to trust that without reading the
    /// source. Somebody who wants fixes delivered can say so; nobody has it
    /// decided for them.
    #[serde(default)]
    pub check_for_updates: bool,
    /// Capabilities switched on before they are finished.
    ///
    /// Empty by default, and empty means the app behaves exactly as it did
    /// before any of them existed. Stored rather than derived so that turning
    /// one on is a decision the person made and can see, not something a build
    /// decided for them.
    #[serde(default)]
    pub features: ladx_types::FeatureSet,
}

#[tauri::command]
pub fn settings_load(state: tauri::State<'_, AppState>) -> Result<StudioSettings, String> {
    let path = &state.paths.settings_json;
    if !path.exists() {
        return Ok(StudioSettings::default());
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn settings_save(
    state: tauri::State<'_, AppState>,
    settings: StudioSettings,
) -> Result<(), String> {
    let path = &state.paths.settings_json;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())?;
    state
        .audit
        .log("user", "settings_saved", settings.default_model.as_deref())
        .ok();
    Ok(())
}

#[cfg(test)]
mod feature_tests {
    use super::*;
    use ladx_types::{FeatureFlag, FeatureSet};

    /// A settings file written before flags existed still loads.
    ///
    /// This is the file every install already has on disk, so getting it wrong
    /// would present as an app that has forgotten the workspace, the model and
    /// the last project all at once.
    #[test]
    fn settings_written_before_flags_still_load() {
        let old = r#"{
            "defaultModel": "qwen2.5-coder:7b",
            "workspaceDir": "/Users/someone/LADX",
            "lastProject": "/Users/someone/LADX/Line 4",
            "sidebarCollapsed": false,
            "checkForUpdates": false
        }"#;
        let s: StudioSettings = serde_json::from_str(old).expect("existing settings must load");
        assert_eq!(s.default_model.as_deref(), Some("qwen2.5-coder:7b"));
        assert_eq!(s.features, FeatureSet::default());
        assert!(s.features.enabled.is_empty(), "nothing switches itself on");
    }

    #[test]
    fn flags_round_trip_through_the_settings_file() {
        let mut s = StudioSettings::default();
        s.features.enable(FeatureFlag::VendorSiemens);
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("vendor.siemens"), "stored under its documented name");
        let back: StudioSettings = serde_json::from_str(&json).unwrap();
        assert!(back.features.is_on(FeatureFlag::VendorSiemens));
        assert!(!back.features.is_on(FeatureFlag::VendorRockwell));
    }
}
