//! ladx-validate — CLI bridge for Node API routes. Reads source from stdin
//! (or a file path arg), runs the configured validator backend, prints a
//! `ValidatorReport` JSON to stdout. Always exits 0 — failure is in the
//! report, not the exit code, so the caller can distinguish "validation
//! failed" from "validator crashed".
//!
//! Backend selection (env-driven):
//!   LADX_VALIDATOR=matiec   prefer matiec, fall back to light if missing
//!   LADX_VALIDATOR=light    light only
//!   (unset)                 same as 'matiec'
//!
//! Usage:
//!   ladx-validate --language st              # source on stdin
//!   ladx-validate --language st <file>

use std::io::Read;
use std::process::ExitCode;

use anyhow::Context;
use ladx_validator::light::LightValidator;
use ladx_validator::matiec::MatiecValidator;
use ladx_validator::{validate_with_fallback, Validator};

fn main() -> ExitCode {
    match run() {
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

fn run() -> anyhow::Result<String> {
    let args: Vec<String> = std::env::args().collect();
    let mut language = "st".to_string();
    let mut path: Option<String> = None;
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--language" => {
                i += 1;
                language = args.get(i).cloned().unwrap_or_default();
            }
            other if !other.starts_with("--") => path = Some(other.to_string()),
            other => anyhow::bail!("unknown arg: {other}"),
        }
        i += 1;
    }

    if !language.eq_ignore_ascii_case("st") {
        anyhow::bail!("only 'st' is supported in Phase 1");
    }

    let source = match path {
        Some(p) => std::fs::read_to_string(&p).with_context(|| format!("reading {p}"))?,
        None => {
            let mut s = String::new();
            std::io::stdin().read_to_string(&mut s)?;
            s
        }
    };

    let backend_env = std::env::var("LADX_VALIDATOR").unwrap_or_else(|_| "matiec".into());
    let report = match backend_env.as_str() {
        "light" => LightValidator.validate_st(&source)?,
        _ => validate_with_fallback(&MatiecValidator::from_env(), &LightValidator, &source)?,
    };

    Ok(serde_json::to_string(&report)?)
}
