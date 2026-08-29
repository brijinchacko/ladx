//! ladx-parser, CLI bridge between Node API routes and the Rust parser
//! crate. Takes a file path, dispatches by extension, and prints a JSON
//! `ParseResult` (`{ project, manifest }`) to stdout. On failure, exits
//! non-zero with the error on stderr.
//!
//! Usage:
//!     ladx-parser /path/to/project.l5x
//!     ladx-parser --ir /path/to/project.L5X
//!
//! `--ir` reads the logic rather than the names and prints
//! `{ project, report, summary }`, where `project` is a LADX IR document. It is
//! a separate mode rather than a replacement because the default output is what
//! the project picker has always consumed, and that must not change shape
//! under it.

use anyhow::Context;
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    let ir = args.iter().any(|a| a == "--ir");
    let Some(path) = args.iter().skip(1).find(|a| !a.starts_with("--")) else {
        eprintln!("usage: ladx-parser [--ir] <path>");
        return ExitCode::from(2);
    };

    let result = if ir { run_ir(path) } else { run(path) };

    match result {
        Ok(json) => {
            println!("{json}");
            ExitCode::SUCCESS
        }
        Err(err) => {
            eprintln!("{err:#}");
            ExitCode::FAILURE
        }
    }
}

fn run(path: &str) -> anyhow::Result<String> {
    let bytes =
        std::fs::read(path).with_context(|| format!("reading project file: {path}"))?;
    let result = ladx_parsers::parse_project_bytes(path, &bytes)
        .with_context(|| format!("parsing project file: {path}"))?;
    Ok(serde_json::to_string(&result)?)
}

fn run_ir(path: &str) -> anyhow::Result<String> {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    // Named rather than silently attempted. Only L5X reads into the IR today,
    // and letting a PLCopen file through to fail deeper down would produce a
    // confusing error a long way from the cause.
    if ext != "l5x" {
        anyhow::bail!(
            "--ir currently reads Rockwell L5X only; {path} is .{ext}. \
             The other formats still work without --ir."
        );
    }

    let bytes =
        std::fs::read(path).with_context(|| format!("reading project file: {path}"))?;
    let import = ladx_parsers::l5x_ir::parse_to_ir(&bytes)
        .with_context(|| format!("reading project file into the IR: {path}"))?;

    Ok(serde_json::to_string(&serde_json::json!({
        "project": import.project,
        "report": import.report,
        "summary": import.report.summary(),
    }))?)
}
