//! A project as a real folder on disk.
//!
//! The web app keeps documents in Postgres and object storage, which is right
//! for a browser and wrong for a laptop in a switchroom. Here the project is a
//! directory: the customer wants the folder, the folder goes on a memory stick
//! at handover, and half of what lands in it was never made by LADX. A real
//! directory can hold the datasheet somebody dragged in, and opens for a person
//! who has never installed this application, which is what handover means.

pub mod layout;

use layout::{FOLDERS, MANIFEST, SUBFOLDERS};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// What marks a directory as a LADX project.
///
/// Written as JSON rather than something binary because somebody will open it
/// in Notepad to work out what it is, and they should be able to. It carries a
/// format version from the first release, before there is anything to migrate,
/// because adding one later means guessing at what the files without it were.
#[derive(Serialize, Deserialize, Clone, Debug)]
// camelCase because this struct is both the file on disk and the shape the
// frontend receives, and the rest of the app's IPC is camelCase. One spelling
// rather than a translation layer that will eventually disagree with itself.
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    /// Bumped when the layout changes in a way that needs migrating.
    pub format: u32,
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    pub created: String,
    pub updated: String,
    /// Which LADX wrote it, for a support conversation about a file.
    pub app_version: String,
}

pub const FORMAT: u32 = 1;

#[derive(Debug)]
pub enum WorkspaceError {
    Io(std::io::Error),
    Json(serde_json::Error),
    NotAProject(PathBuf),
    AlreadyExists(PathBuf),
}

impl std::fmt::Display for WorkspaceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            // Written as the sentence the person reads, because these go
            // straight to the screen. "Io error 2" is not a thing anybody can
            // act on; "there is no folder there any more" is.
            Self::Io(e) => write!(f, "The folder could not be written: {e}"),
            Self::Json(e) => write!(f, "The project file could not be read: {e}"),
            Self::NotAProject(p) => write!(
                f,
                "{} is not a LADX project. A project folder has a {MANIFEST} in it.",
                p.display()
            ),
            Self::AlreadyExists(p) => {
                write!(f, "{} already exists and was left alone.", p.display())
            }
        }
    }
}

impl From<std::io::Error> for WorkspaceError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}
impl From<serde_json::Error> for WorkspaceError {
    fn from(e: serde_json::Error) -> Self {
        Self::Json(e)
    }
}

type Result<T> = std::result::Result<T, WorkspaceError>;

/// Build the whole structure at `dir`.
///
/// Creates nothing if the directory already holds a project, so pointing at an
/// existing one by accident cannot scatter empty folders through somebody's
/// work.
pub fn create(dir: &Path, manifest: &Manifest) -> Result<PathBuf> {
    if dir.join(MANIFEST).exists() {
        return Err(WorkspaceError::AlreadyExists(dir.to_path_buf()));
    }

    std::fs::create_dir_all(dir)?;

    for folder in FOLDERS {
        let path = dir.join(folder.dir);
        std::fs::create_dir_all(&path)?;
        // A README per folder, so the structure explains itself to somebody who
        // opened the memory stick and has never seen this application. It costs
        // nothing and it is the difference between a folder of folders and a
        // package somebody can find their way around.
        std::fs::write(
            path.join("README.txt"),
            format!(
                "{}\n\n{}\n\nPart of the LADX project \"{}\".\n",
                folder.dir, folder.holds, manifest.name
            ),
        )?;
    }

    for (parent, child) in SUBFOLDERS {
        std::fs::create_dir_all(dir.join(parent).join(child))?;
    }

    write_manifest(dir, manifest)?;
    Ok(dir.to_path_buf())
}

pub fn write_manifest(dir: &Path, manifest: &Manifest) -> Result<()> {
    let json = serde_json::to_string_pretty(manifest)?;
    std::fs::write(dir.join(MANIFEST), json)?;
    Ok(())
}

pub fn read_manifest(dir: &Path) -> Result<Manifest> {
    let path = dir.join(MANIFEST);
    if !path.exists() {
        return Err(WorkspaceError::NotAProject(dir.to_path_buf()));
    }
    let raw = std::fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&raw)?)
}

/// Whether this directory is a LADX project.
pub fn is_project(dir: &Path) -> bool {
    dir.join(MANIFEST).is_file()
}

/// Every project directly inside a folder.
///
/// One level deep on purpose. A recursive search of somebody's Documents folder
/// is slow, surprising, and finds projects they had archived.
pub fn list_projects(parent: &Path) -> Vec<(PathBuf, Manifest)> {
    let Ok(entries) = std::fs::read_dir(parent) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if let Ok(m) = read_manifest(&path) {
            out.push((path, m));
        }
    }
    out.sort_by(|a, b| b.1.updated.cmp(&a.1.updated));
    out
}

/// Where a file of this kind belongs, creating the folder if it is missing.
///
/// The folder may be missing because somebody deleted it, or because the
/// project was made by an older version that had fewer. Creating it is kinder
/// than refusing to save.
pub fn destination(project: &Path, kind: &str, filename: &str) -> Result<PathBuf> {
    let folder = project.join(layout::folder_for(kind));
    std::fs::create_dir_all(&folder)?;
    Ok(folder.join(layout::safe_dir_name(filename)))
}

/// Write a file into the project, without overwriting one that is already there.
///
/// Saving the second export of a drawing over the first, silently, is how the
/// wrong revision gets issued. A numbered suffix costs a moment of tidying and
/// loses nothing.
pub fn put(project: &Path, kind: &str, filename: &str, bytes: &[u8]) -> Result<PathBuf> {
    let target = destination(project, kind, filename)?;
    let free = free_path(&target);
    std::fs::write(&free, bytes)?;
    touch(project);
    Ok(free)
}

fn free_path(target: &Path) -> PathBuf {
    if !target.exists() {
        return target.to_path_buf();
    }
    let parent = target.parent().unwrap_or(Path::new("."));
    let stem = target.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = target.extension().and_then(|s| s.to_str());
    for n in 2..1000 {
        let name = match ext {
            Some(e) => format!("{stem} ({n}).{e}"),
            None => format!("{stem} ({n})"),
        };
        let candidate = parent.join(name);
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!("{stem}-{}", uuid::Uuid::new_v4()))
}

/// Record that something changed, so the project list orders by recency.
///
/// Failure is ignored: not being able to update a timestamp is not a reason to
/// fail the save that just succeeded.
fn touch(project: &Path) {
    if let Ok(mut m) = read_manifest(project) {
        m.updated = now();
        let _ = write_manifest(project, &m);
    }
}

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ladx-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn manifest(name: &str) -> Manifest {
        Manifest {
            format: FORMAT,
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            client: None,
            code: None,
            created: now(),
            updated: now(),
            app_version: "0.1.0".into(),
        }
    }

    #[test]
    fn creates_every_folder_and_subfolder() {
        let root = temp();
        let dir = root.join("Line 4");
        create(&dir, &manifest("Line 4")).unwrap();
        for f in FOLDERS {
            assert!(dir.join(f.dir).is_dir(), "{} missing", f.dir);
        }
        for (p, c) in SUBFOLDERS {
            assert!(dir.join(p).join(c).is_dir(), "{p}/{c} missing");
        }
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn every_folder_explains_itself() {
        // Somebody opens the memory stick who has never seen this application.
        let root = temp();
        let dir = root.join("p");
        create(&dir, &manifest("p")).unwrap();
        for f in FOLDERS {
            let readme = dir.join(f.dir).join("README.txt");
            assert!(readme.is_file(), "{} has no README", f.dir);
            let body = std::fs::read_to_string(readme).unwrap();
            assert!(body.contains(f.holds));
        }
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn round_trips_its_manifest() {
        let root = temp();
        let dir = root.join("p");
        let m = manifest("Acme, Line 4");
        create(&dir, &m).unwrap();
        let back = read_manifest(&dir).unwrap();
        assert_eq!(back.name, "Acme, Line 4");
        assert_eq!(back.format, FORMAT);
        assert_eq!(back.id, m.id);
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn refuses_to_build_over_an_existing_project() {
        // Pointing at an existing project by accident must not scatter empty
        // folders through somebody's work.
        let root = temp();
        let dir = root.join("p");
        create(&dir, &manifest("p")).unwrap();
        let again = create(&dir, &manifest("p"));
        assert!(matches!(again, Err(WorkspaceError::AlreadyExists(_))));
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn knows_a_project_from_a_folder() {
        let root = temp();
        let project = root.join("a");
        create(&project, &manifest("a")).unwrap();
        let plain = root.join("b");
        std::fs::create_dir_all(&plain).unwrap();
        assert!(is_project(&project));
        assert!(!is_project(&plain));
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn lists_projects_and_ignores_everything_else() {
        let root = temp();
        create(&root.join("one"), &manifest("one")).unwrap();
        create(&root.join("two"), &manifest("two")).unwrap();
        std::fs::create_dir_all(root.join("not a project")).unwrap();
        std::fs::write(root.join("loose.txt"), b"x").unwrap();
        assert_eq!(list_projects(&root).len(), 2);
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn files_a_document_by_its_kind() {
        let root = temp();
        let dir = root.join("p");
        create(&dir, &manifest("p")).unwrap();

        let scl = put(&dir, "scl", "Conveyor.scl", b"PROGRAM").unwrap();
        assert!(scl.starts_with(dir.join("03 Programs").join("Exports")));

        let panel = put(&dir, "panel", "Overview.html", b"<html>").unwrap();
        assert!(panel.starts_with(dir.join("04 HMI").join("Panels")));

        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn never_overwrites_a_file_that_is_already_there() {
        // Saving the second export over the first, silently, is how the wrong
        // revision gets issued.
        let root = temp();
        let dir = root.join("p");
        create(&dir, &manifest("p")).unwrap();
        let first = put(&dir, "scl", "Conveyor.scl", b"one").unwrap();
        let second = put(&dir, "scl", "Conveyor.scl", b"two").unwrap();
        assert_ne!(first, second);
        assert_eq!(std::fs::read(&first).unwrap(), b"one");
        assert_eq!(std::fs::read(&second).unwrap(), b"two");
        assert!(second.to_string_lossy().contains("(2)"));
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn recreates_a_folder_somebody_deleted() {
        let root = temp();
        let dir = root.join("p");
        create(&dir, &manifest("p")).unwrap();
        std::fs::remove_dir_all(dir.join("03 Programs")).unwrap();
        let saved = put(&dir, "ladder", "Main.json", b"{}").unwrap();
        assert!(saved.is_file());
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn saving_updates_the_timestamp() {
        let root = temp();
        let dir = root.join("p");
        let mut m = manifest("p");
        m.updated = "2000-01-01T00:00:00Z".into();
        create(&dir, &m).unwrap();
        put(&dir, "ladder", "Main.json", b"{}").unwrap();
        assert_ne!(read_manifest(&dir).unwrap().updated, "2000-01-01T00:00:00Z");
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn reading_a_folder_that_is_not_a_project_says_so() {
        let root = temp();
        let err = read_manifest(&root).unwrap_err();
        assert!(matches!(err, WorkspaceError::NotAProject(_)));
        assert!(err.to_string().contains(MANIFEST));
        std::fs::remove_dir_all(root).ok();
    }
}
