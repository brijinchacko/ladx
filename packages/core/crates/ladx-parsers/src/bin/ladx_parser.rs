//! ladx-parser, CLI bridge between Node API routes and the Rust parser
//! crate. Takes a file path, dispatches by extension, and prints a JSON
//! `ParseResult` (`{ project, manifest }`) to stdout. On failure, exits
//! non-zero with the error on stderr.
//!
//! Usage:
//!     ladx-parser /path/to/project.l5x

use anyhow::Context;
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    let Some(path) = args.get(1) else {
        eprintln!("usage: ladx-parser <path>");
        return ExitCode::from(2);
    };

    match run(path) {
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
