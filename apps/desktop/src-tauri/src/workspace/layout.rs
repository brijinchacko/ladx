//! What a LADX project looks like on disk.
//!
//! A control project is already a folder of paperwork on every job that has
//! ever been done, and the folder is not arbitrary: there is a specification,
//! a set of drawings, the programs, the test records, and the pack that gets
//! handed over. People know where things go. An application that invents its
//! own arrangement makes somebody translate between two of them.
//!
//! So the folders are the lifecycle phases the product already models, in the
//! order they happen, numbered. The numbers are not decoration: Explorer and
//! Finder sort alphabetically, and without them "Handover" files before
//! "Requirements", which is the reverse of the order anybody works in.
//!
//! ## Why this is on disk at all
//!
//! The web app keeps documents in Postgres and object storage, which is right
//! for a browser. On a laptop in a switchroom it is wrong: the customer wants
//! the folder, the folder goes on a memory stick at handover, and half of what
//! lands in it was never made by LADX. A project that is a real directory can
//! hold the datasheet somebody dragged in, and can be opened by a person who
//! has never installed this application, which is what handover means.

use std::path::{Path, PathBuf};

/// One folder in a project, and what belongs in it.
pub struct Folder {
    /// The name on disk, numbered so it sorts into working order.
    pub dir: &'static str,
    /// The phase this belongs to, matching the lifecycle the app models.
    pub phase: &'static str,
    /// Written into the folder's own README, so the structure explains itself
    /// to somebody who opened it without the application.
    pub holds: &'static str,
}

/// The structure, in the order the work happens.
pub const FOLDERS: &[Folder] = &[
    Folder {
        dir: "01 Specification",
        phase: "requirements",
        holds: "What the machine has to do. Functional design specification, \
                user requirements, the customer's own standards, scope.",
    },
    Folder {
        dir: "02 Drawings",
        phase: "design",
        holds: "Panel layouts and electrical schematics. DXF and PDF exports go \
                in the subfolders so the editable and the issued copies do not \
                sit side by side looking alike.",
    },
    Folder {
        dir: "03 Programs",
        phase: "development",
        holds: "Ladder programs, and the Structured Text, SCL and PLCopen \
                exports under Exports.",
    },
    Folder {
        dir: "04 HMI",
        phase: "development",
        holds: "Operator screens, and under Panels the exported HTML panels \
                that run on their own.",
    },
    Folder {
        dir: "05 Testing",
        phase: "factory_test",
        holds: "Factory and site acceptance records, logic test records, \
                recorded runs exported as CSV.",
    },
    Folder {
        dir: "06 Commissioning",
        phase: "commissioning",
        holds: "Site records, loop checks, snags, what changed on site.",
    },
    Folder {
        dir: "07 Handover",
        phase: "handover",
        holds: "The pack that leaves with the machine. As built drawings, the \
                final program, manuals, certificates.",
    },
    Folder {
        dir: "99 Working",
        phase: "summary",
        holds: "Anything not filed yet: imports, a datasheet somebody sent, \
                scratch. Nothing here is part of the handover.",
    },
];

/// Subfolders, so an editable file and an issued PDF are never mistaken.
pub const SUBFOLDERS: &[(&str, &str)] = &[
    ("02 Drawings", "DXF"),
    ("02 Drawings", "PDF"),
    ("03 Programs", "Exports"),
    ("04 HMI", "Panels"),
];

/// The manifest that marks a directory as a LADX project.
pub const MANIFEST: &str = "ladx-project.json";

/// Where a document of a given kind belongs.
///
/// One function, so nothing writing a file has to decide for itself. Two
/// callers guessing separately is how a project ends up with drawings in three
/// places.
pub fn folder_for(kind: &str) -> &'static str {
    match kind {
        "drawing" | "cad" | "schematic" => "02 Drawings",
        "dxf" => "02 Drawings/DXF",
        "pdf-drawing" => "02 Drawings/PDF",
        "program" | "ladder" => "03 Programs",
        "export" | "st" | "scl" | "plcopen" | "neutral" => "03 Programs/Exports",
        "hmi" | "screen" => "04 HMI",
        "panel" => "04 HMI/Panels",
        "test" | "fat" | "sat" | "recording" => "05 Testing",
        "commissioning" => "06 Commissioning",
        "handover" | "as-built" => "07 Handover",
        // A document whose kind we do not recognise goes to Specification
        // rather than to Working: most documents are specifications, and a
        // wrong guess that puts a real deliverable somewhere visible is better
        // than one that hides it in scratch.
        "document" | "spec" | "fds" | "urs" => "01 Specification",
        _ => "99 Working",
    }
}

/// A folder name a filesystem will accept, from something a person typed.
///
/// Deliberately strict. This runs on both Windows and macOS, and Windows
/// refuses `< > : " / \ | ? *`, refuses trailing dots and spaces, and reserves
/// a list of device names that has caught people out since DOS. A project
/// called `CON` or `Panel: Line 4` is a perfectly reasonable thing to type and
/// neither can be a directory.
pub fn safe_dir_name(input: &str) -> String {
    const RESERVED: &[&str] = &[
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
        "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];

    let mut out: String = input
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            c if (c as u32) < 0x20 => '-',
            c => c,
        })
        .collect();

    // Collapse the runs a substitution leaves behind, so "Panel: Line 4"
    // becomes "Panel- Line 4" rather than "Panel-- Line 4".
    while out.contains("--") {
        out = out.replace("--", "-");
    }

    let trimmed = out.trim().trim_end_matches('.').trim().to_string();

    if trimmed.is_empty() {
        return "Project".to_string();
    }
    // A reserved name is reserved with or without an extension, and case does
    // not matter.
    let stem = trimmed.split('.').next().unwrap_or(&trimmed).to_uppercase();
    if RESERVED.contains(&stem.as_str()) {
        return format!("{trimmed} project");
    }
    // Long paths are still a real limit on Windows without opt in, and a
    // project name is only one segment of the path somebody chose.
    if trimmed.chars().count() > 80 {
        return trimmed.chars().take(80).collect::<String>().trim().to_string();
    }
    trimmed
}

/// A name that is free, by appending a number rather than overwriting.
///
/// Two projects called "Line 4 upgrade" is ordinary: the same job for two
/// clients, or a second attempt. Silently writing into the first one is the
/// kind of data loss nobody notices until the wrong drawing is issued.
pub fn available_dir(parent: &Path, name: &str) -> PathBuf {
    let base = safe_dir_name(name);
    let first = parent.join(&base);
    if !first.exists() {
        return first;
    }
    for n in 2..1000 {
        let candidate = parent.join(format!("{base} ({n})"));
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!("{base} ({})", uuid::Uuid::new_v4()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folders_sort_into_working_order() {
        // The reason for the numbers: without them Handover files before
        // Requirements, which is the reverse of how anybody works.
        let mut names: Vec<&str> = FOLDERS.iter().map(|f| f.dir).collect();
        let original = names.clone();
        names.sort();
        assert_eq!(names, original);
    }

    #[test]
    fn every_folder_says_what_it_holds() {
        for f in FOLDERS {
            assert!(!f.holds.is_empty(), "{} has no description", f.dir);
        }
    }

    #[test]
    fn every_subfolder_has_a_parent() {
        for (parent, _) in SUBFOLDERS {
            assert!(
                FOLDERS.iter().any(|f| f.dir == *parent),
                "{parent} is not a folder"
            );
        }
    }

    #[test]
    fn documents_are_filed_by_kind() {
        assert_eq!(folder_for("ladder"), "03 Programs");
        assert_eq!(folder_for("scl"), "03 Programs/Exports");
        assert_eq!(folder_for("panel"), "04 HMI/Panels");
        assert_eq!(folder_for("dxf"), "02 Drawings/DXF");
    }

    #[test]
    fn an_unknown_kind_lands_somewhere_it_will_be_seen() {
        assert_eq!(folder_for("something-new"), "99 Working");
    }

    #[test]
    fn every_destination_is_a_real_folder() {
        // A kind filed to a path that is never created writes into nothing.
        for kind in [
            "drawing", "dxf", "pdf-drawing", "ladder", "scl", "hmi", "panel", "test",
            "commissioning", "handover", "fds", "anything-else",
        ] {
            let dest = folder_for(kind);
            let known = FOLDERS.iter().any(|f| f.dir == dest)
                || SUBFOLDERS
                    .iter()
                    .any(|(p, c)| format!("{p}/{c}") == dest);
            assert!(known, "{kind} files to {dest}, which is never created");
        }
    }

    #[test]
    fn strips_what_windows_refuses() {
        assert_eq!(safe_dir_name("Panel: Line 4"), "Panel- Line 4");
        assert_eq!(safe_dir_name("a/b\\c"), "a-b-c");
        assert_eq!(safe_dir_name("What? Now*"), "What- Now-");
    }

    #[test]
    fn refuses_a_trailing_dot_or_space() {
        // Windows silently drops both, so a folder created as "Line 4." is
        // "Line 4" and nothing can find it again by the name it was given.
        assert_eq!(safe_dir_name("Line 4."), "Line 4");
        assert_eq!(safe_dir_name("Line 4  "), "Line 4");
    }

    #[test]
    fn works_around_a_reserved_device_name() {
        assert_eq!(safe_dir_name("CON"), "CON project");
        assert_eq!(safe_dir_name("con"), "con project");
        assert_eq!(safe_dir_name("LPT1.old"), "LPT1.old project");
    }

    #[test]
    fn never_returns_nothing() {
        for bad in ["", "   ", "...", "///"] {
            assert!(!safe_dir_name(bad).is_empty(), "{bad:?} produced nothing");
        }
    }

    #[test]
    fn keeps_a_name_a_person_would_recognise() {
        assert_eq!(safe_dir_name("Acme Bakery, Line 4 upgrade"), "Acme Bakery, Line 4 upgrade");
    }

    #[test]
    fn caps_a_very_long_name() {
        let long = "x".repeat(300);
        assert!(safe_dir_name(&long).chars().count() <= 80);
    }
}
