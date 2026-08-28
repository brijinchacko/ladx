//! Choosing where projects live, and putting files in the right place.
//!
//! The one thing the desktop can do that the web app cannot: a project is a
//! folder the person picked, on a disk they control, that they can back up,
//! put on a memory stick, and hand over. Everything here exists to make that
//! folder correct without the person having to arrange it.

use crate::state::AppState;
use crate::workspace::{self, Manifest};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri_plugin_dialog::DialogExt;

/// A project as the frontend wants it: the manifest plus where it is.
#[derive(Serialize, Debug)]
pub struct ProjectFolder {
    pub path: String,
    #[serde(flatten)]
    pub manifest: Manifest,
}

/// Ask for a folder to keep projects in.
///
/// Asked once and remembered, rather than per project. Somebody who keeps work
/// in one place should not be picking it every time, and somebody who does not
/// can still choose per project below.
#[tauri::command]
pub async fn pick_workspace(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let chosen: Option<PathBuf> = app
        .dialog()
        .file()
        .set_title("Where should LADX keep your projects?")
        .blocking_pick_folder()
        .and_then(|p| p.into_path().ok());
    Ok(chosen.map(|p| p.to_string_lossy().to_string()))
}

/// Make a project folder, with its whole structure.
///
/// `parent` is where it goes; the folder itself is named after the project. A
/// name already taken gets a number rather than being written into, because
/// two jobs called "Line 4 upgrade" is ordinary and silently merging them is
/// the kind of loss nobody notices until the wrong drawing is issued.
#[tauri::command]
pub async fn create_project_folder(
    parent: String,
    name: String,
    client: Option<String>,
    code: Option<String>,
) -> Result<ProjectFolder, String> {
    let parent_path = PathBuf::from(&parent);
    if !parent_path.is_dir() {
        return Err(format!(
            "{parent} is not a folder any more. Pick where projects should live again."
        ));
    }

    let dir = workspace::layout::available_dir(&parent_path, &name);
    let manifest = Manifest {
        format: workspace::FORMAT,
        id: uuid::Uuid::new_v4().to_string(),
        name: name.clone(),
        client,
        code,
        created: workspace::now(),
        updated: workspace::now(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    };

    workspace::create(&dir, &manifest).map_err(|e| e.to_string())?;

    Ok(ProjectFolder {
        path: dir.to_string_lossy().to_string(),
        manifest,
    })
}

/// Every project in the workspace folder.
#[tauri::command]
pub async fn list_project_folders(parent: String) -> Result<Vec<ProjectFolder>, String> {
    Ok(workspace::list_projects(&PathBuf::from(parent))
        .into_iter()
        .map(|(path, manifest)| ProjectFolder {
            path: path.to_string_lossy().to_string(),
            manifest,
        })
        .collect())
}

/// Open a folder somebody points at, if it is a project.
#[tauri::command]
pub async fn open_project_folder(app: tauri::AppHandle) -> Result<Option<ProjectFolder>, String> {
    let chosen: Option<PathBuf> = app
        .dialog()
        .file()
        .set_title("Open a LADX project")
        .blocking_pick_folder()
        .and_then(|p| p.into_path().ok());

    let Some(dir) = chosen else { return Ok(None) };
    let manifest = workspace::read_manifest(&dir).map_err(|e| e.to_string())?;
    Ok(Some(ProjectFolder {
        path: dir.to_string_lossy().to_string(),
        manifest,
    }))
}

/// Save something into the project, filed by what it is.
///
/// The caller says what kind of thing it is and the layout decides where it
/// goes, so nothing writing a file has to know the folder names. Two callers
/// deciding separately is how a project ends up with drawings in three places.
#[tauri::command]
pub async fn save_into_project(
    project: String,
    kind: String,
    filename: String,
    contents: String,
) -> Result<String, String> {
    let path = workspace::put(
        &PathBuf::from(project),
        &kind,
        &filename,
        contents.as_bytes(),
    )
    .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Read something back out of a project.
#[tauri::command]
pub async fn read_from_project(
    project: String,
    kind: String,
    filename: String,
) -> Result<Option<String>, String> {
    let path = workspace::destination(&PathBuf::from(project), &kind, &filename)
        .map_err(|e| e.to_string())?;
    if !path.is_file() {
        return Ok(None);
    }
    std::fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

/// What is in a project folder, for a file listing in the app.
#[derive(Serialize, Debug)]
pub struct FolderEntry {
    pub folder: String,
    pub name: String,
    pub bytes: u64,
    pub path: String,
}

#[tauri::command]
pub async fn list_project_files(project: String) -> Result<Vec<FolderEntry>, String> {
    let root = PathBuf::from(&project);
    if !workspace::is_project(&root) {
        return Err(format!("{project} is not a LADX project."));
    }

    let mut out = Vec::new();
    for folder in workspace::layout::FOLDERS {
        let dir = root.join(folder.dir);
        collect(&dir, folder.dir.to_string(), &mut out);
        for (parent, child) in workspace::layout::SUBFOLDERS {
            if *parent == folder.dir {
                collect(&dir.join(child), format!("{parent}/{child}"), &mut out);
            }
        }
    }
    Ok(out)
}

fn collect(dir: &std::path::Path, label: String, out: &mut Vec<FolderEntry>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        // The READMEs are ours, and listing them as project files would put
        // eight entries nobody wrote at the top of every folder.
        if name == "README.txt" {
            continue;
        }
        out.push(FolderEntry {
            folder: label.clone(),
            name,
            bytes: entry.metadata().map(|m| m.len()).unwrap_or(0),
            path: path.to_string_lossy().to_string(),
        });
    }
}

/// Show the project in Explorer or Finder.
///
/// The point of a project being a real folder is that a person can use it as
/// one, and the first thing they will want is to look at it.
#[tauri::command]
pub async fn reveal_project(app: tauri::AppHandle, project: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(project, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Remember where projects live, so it is asked once rather than every time.
///
/// Through the settings file the rest of the app already uses, rather than a
/// second store. Two places remembering preferences is one of them being
/// wrong after a reinstall.
#[tauri::command]
pub fn set_workspace_dir(state: tauri::State<'_, AppState>, dir: String) -> Result<(), String> {
    let mut settings = crate::commands::settings::settings_load(state.clone())?;
    settings.workspace_dir = Some(dir);
    crate::commands::settings::settings_save(state, settings)
}

#[tauri::command]
pub fn get_workspace_dir(state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    Ok(crate::commands::settings::settings_load(state)?.workspace_dir)
}

/// Remember which project was open, so a relaunch lands back in it.
///
/// A command of its own rather than the frontend reading the settings, editing
/// one field and writing the whole file back. Two of those in flight at once
/// and the second overwrites the first field, which is how a preference that
/// was set correctly is gone by the next launch.
#[tauri::command]
pub fn set_last_project(
    state: tauri::State<'_, AppState>,
    project: Option<String>,
) -> Result<(), String> {
    let mut settings = crate::commands::settings::settings_load(state.clone())?;
    settings.last_project = project;
    crate::commands::settings::settings_save(state, settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A scratch directory that removes itself, so a failing test does not
    /// leave folders behind in the temp directory forever.
    struct Temp(PathBuf);
    impl Temp {
        fn new(tag: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("ladx-cmd-{tag}-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
    }
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn make(parent: &Path, name: &str) -> ProjectFolder {
        let dir = workspace::layout::available_dir(parent, name);
        let manifest = Manifest {
            format: workspace::FORMAT,
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            client: None,
            code: None,
            created: workspace::now(),
            updated: workspace::now(),
            app_version: "test".to_string(),
        };
        workspace::create(&dir, &manifest).unwrap();
        ProjectFolder {
            path: dir.to_string_lossy().to_string(),
            manifest,
        }
    }

    #[tokio::test]
    async fn refuses_a_parent_that_is_not_there() {
        // Somebody's workspace folder was on a drive that is now unplugged.
        // The message has to say what to do, because "No such file" does not.
        let err = create_project_folder(
            "/nowhere/at/all/ladx".to_string(),
            "Line 4".to_string(),
            None,
            None,
        )
        .await
        .unwrap_err();
        assert!(err.contains("Pick where projects should live again"), "{err}");
    }

    #[tokio::test]
    async fn a_new_project_is_listed_and_readable() {
        let tmp = Temp::new("list");
        let made = create_project_folder(
            tmp.0.to_string_lossy().to_string(),
            "Acme Bakery, Line 4".to_string(),
            Some("Acme".to_string()),
            Some("J-2291".to_string()),
        )
        .await
        .unwrap();

        assert_eq!(made.manifest.client.as_deref(), Some("Acme"));
        assert_eq!(made.manifest.code.as_deref(), Some("J-2291"));

        let listed = list_project_folders(tmp.0.to_string_lossy().to_string())
            .await
            .unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].path, made.path);
    }

    #[tokio::test]
    async fn a_saved_file_comes_back_from_where_it_was_filed() {
        let tmp = Temp::new("roundtrip");
        let project = make(&tmp.0, "Roundtrip").path;

        let written = save_into_project(
            project.clone(),
            "scl".to_string(),
            "Main.scl".to_string(),
            "// converted\n".to_string(),
        )
        .await
        .unwrap();
        assert!(written.contains("03 Programs"), "{written}");
        assert!(written.contains("Exports"), "{written}");

        let read = read_from_project(project, "scl".to_string(), "Main.scl".to_string())
            .await
            .unwrap();
        assert_eq!(read.as_deref(), Some("// converted\n"));
    }

    #[tokio::test]
    async fn reading_something_that_is_not_there_is_not_an_error() {
        // An empty project is the normal case on the first day, and a tool
        // asking whether its file exists yet must not be told the disk failed.
        let tmp = Temp::new("absent");
        let project = make(&tmp.0, "Absent").path;
        let read = read_from_project(project, "hmi".to_string(), "Screen1.json".to_string())
            .await
            .unwrap();
        assert!(read.is_none());
    }

    #[tokio::test]
    async fn listing_shows_files_under_the_folder_they_are_filed_in() {
        let tmp = Temp::new("files");
        let project = make(&tmp.0, "Files").path;
        for (kind, name) in [("scl", "Main.scl"), ("panel", "Line4.html"), ("fds", "FDS.md")] {
            save_into_project(project.clone(), kind.to_string(), name.to_string(), "x".to_string())
                .await
                .unwrap();
        }

        let files = list_project_files(project).await.unwrap();
        let mut seen: Vec<(String, String)> = files
            .iter()
            .map(|f| (f.folder.clone(), f.name.clone()))
            .collect();
        seen.sort();

        assert_eq!(
            seen,
            vec![
                ("01 Specification".to_string(), "FDS.md".to_string()),
                ("03 Programs/Exports".to_string(), "Main.scl".to_string()),
                ("04 HMI/Panels".to_string(), "Line4.html".to_string()),
            ]
        );
    }

    #[tokio::test]
    async fn our_own_readmes_are_not_listed_as_project_files() {
        // create() writes one per folder to explain the structure. Listing them
        // would put eight files nobody wrote at the top of every folder.
        let tmp = Temp::new("readme");
        let project = make(&tmp.0, "Readme").path;
        let files = list_project_files(project).await.unwrap();
        assert!(files.is_empty(), "{files:?}", files = files.len());
    }

    #[tokio::test]
    async fn listing_a_folder_that_is_not_a_project_says_so() {
        let tmp = Temp::new("notaproject");
        let err = list_project_files(tmp.0.to_string_lossy().to_string())
            .await
            .unwrap_err();
        assert!(err.contains("not a LADX project"), "{err}");
    }
}
