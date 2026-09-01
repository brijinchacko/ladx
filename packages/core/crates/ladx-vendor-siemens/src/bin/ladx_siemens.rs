//! ladx-siemens, the Siemens half of the bridge the web app shells out to.
//!
//! A second binary rather than another mode on `ladx-parser`, and not by
//! preference: the SCL generator lives in this crate, which depends on the
//! parser crate, so putting it there would be a cycle.
//!
//! Usage:
//!     ladx-siemens --scl <project.ir.json>       IR to SCL
//!     ladx-siemens --migrate <project.L5X>       L5X to SCL, one step

use anyhow::Context;
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    let scl = args.iter().any(|a| a == "--scl");
    let migrate = args.iter().any(|a| a == "--migrate");
    let Some(path) = args.iter().skip(1).find(|a| !a.starts_with("--")) else {
        eprintln!("usage: ladx-siemens [--scl | --migrate] <path>");
        return ExitCode::from(2);
    };

    let result = if migrate {
        run_migrate(path)
    } else if scl {
        run_scl(path)
    } else {
        Err(anyhow::anyhow!("say what to do: --scl or --migrate"))
    };

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

/// The shape both modes return, so a caller does not branch on which it used.
fn reply(m: &ladx_vendor_siemens::migrate::Migration) -> anyhow::Result<String> {
    Ok(serde_json::to_string(&serde_json::json!({
        "source": m.to_source(),
        "summary": m.summary(),
        "needsReview": m.needs_review(),
        "report": m.report,
        "pous": m.pous.iter().map(|p| serde_json::json!({
            "name": p.name,
            "declarations": p.declarations,
            "source": p.source,
        })).collect::<Vec<_>>(),
    }))?)
}

fn run_scl(path: &str) -> anyhow::Result<String> {
    let raw = std::fs::read_to_string(path).with_context(|| format!("reading {path}"))?;
    let project: ladx_ir::IrProject =
        serde_json::from_str(&raw).with_context(|| format!("{path} is not a LADX IR document"))?;
    let m = ladx_vendor_siemens::migrate::ir_to_siemens(
        &project,
        ladx_ir::fidelity::ConversionReport::new(),
    );
    reply(&m)
}

fn run_migrate(path: &str) -> anyhow::Result<String> {
    let bytes = std::fs::read(path).with_context(|| format!("reading {path}"))?;
    let m = ladx_vendor_siemens::migrate::l5x_to_siemens(&bytes)
        .with_context(|| format!("converting {path}"))?;
    reply(&m)
}
