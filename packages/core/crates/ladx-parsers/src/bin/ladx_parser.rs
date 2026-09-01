//! ladx-parser, CLI bridge between Node API routes and the Rust parser
//! crate. Takes a file path, dispatches by extension, and prints a JSON
//! `ParseResult` (`{ project, manifest }`) to stdout. On failure, exits
//! non-zero with the error on stderr.
//!
//! Usage:
//!     ladx-parser /path/to/project.l5x
//!     ladx-parser --ir /path/to/project.L5X
//!     ladx-parser --health /path/to/project.ir.json
//!     ladx-parser --why /path/to/project.ir.json <tag>
//!     ladx-parser --standards /path/to/request.json
//!
//! `--ir` reads the logic rather than the names and prints
//! `{ project, report, summary }`, where `project` is a LADX IR document. It is
//! a separate mode rather than a replacement because the default output is what
//! the project picker has always consumed, and that must not change shape
//! under it.

use anyhow::Context;
use std::process::ExitCode;

/// What the caller asked for.
///
/// Separate modes on one binary rather than three binaries, because every one
/// of them has to be built for the server and deployed with it, and one
/// artefact is one thing to forget rather than three.
enum Mode {
    /// Names only. What the project list has always used.
    Manifest,
    /// The logic, as a LADX IR document.
    Ir,
    /// What is worth telling somebody about an IR document.
    Health,
    /// Working backwards from one tag.
    Why,
    /// Which written standards apply to a request.
    Standards,
    /// The I/O list, read out of a project.
    Io,
    /// The alarms a program already has.
    Alarms,
    /// A control narrative written from the logic.
    Narrative,
    /// What changed between two versions.
    Diff,
    /// Screens proposed from the program.
    Screens,
    /// The steps the machine moves through.
    Sequence,
    /// Acceptance tests written from the logic.
    Tests,
    /// The racks, and the addresses that do not match them. Reads an L5X,
    /// because the module list is not in an IR document.
    Hardware,
    /// Where the program departs from the standard blocks.
    Deviations,
    /// The whole handover pack.
    Handover,
    /// The program against another tag list.
    Drift,
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    let mode = if args.iter().any(|a| a == "--ir") {
        Mode::Ir
    } else if args.iter().any(|a| a == "--health") {
        Mode::Health
    } else if args.iter().any(|a| a == "--why") {
        Mode::Why
    } else if args.iter().any(|a| a == "--standards") {
        Mode::Standards
    } else if args.iter().any(|a| a == "--io") {
        Mode::Io
    } else if args.iter().any(|a| a == "--alarms") {
        Mode::Alarms
    } else if args.iter().any(|a| a == "--narrative") {
        Mode::Narrative
    } else if args.iter().any(|a| a == "--diff") {
        Mode::Diff
    } else if args.iter().any(|a| a == "--sequence") {
        Mode::Sequence
    } else if args.iter().any(|a| a == "--tests") {
        Mode::Tests
    } else if args.iter().any(|a| a == "--hardware") {
        Mode::Hardware
    } else if args.iter().any(|a| a == "--deviations") {
        Mode::Deviations
    } else if args.iter().any(|a| a == "--handover") {
        Mode::Handover
    } else if args.iter().any(|a| a == "--drift") {
        Mode::Drift
    } else if args.iter().any(|a| a == "--screens") {
        Mode::Screens
    } else {
        Mode::Manifest
    };

    let positional: Vec<&String> = args.iter().skip(1).filter(|a| !a.starts_with("--")).collect();
    let Some(path) = positional.first() else {
        eprintln!(
            "usage: ladx-parser [--ir | --health | --why <tag> | --standards | --io | --alarms \
             | --narrative | --diff <after> | --screens | --sequence | --tests | --deviations \
             | --handover | --hardware <project.L5X> | --drift <taglists.json>] <path>"
        );
        return ExitCode::from(2);
    };

    let result = match mode {
        Mode::Manifest => run(path),
        Mode::Ir => run_ir(path),
        Mode::Health => run_health(path),
        Mode::Why => match positional.get(1) {
            Some(tag) => run_why(path, tag),
            None => Err(anyhow::anyhow!("--why needs a tag: ladx-parser --why <file> <tag>")),
        },
        Mode::Standards => run_standards(path),
        Mode::Io => run_io(path),
        Mode::Alarms => run_alarms(path),
        Mode::Narrative => run_narrative(path),
        Mode::Screens => run_screens(path),
        Mode::Sequence => run_sequence(path),
        Mode::Tests => run_tests(path),
        Mode::Hardware => run_hardware(path),
        Mode::Deviations => run_deviations(path),
        Mode::Handover => run_handover(path, positional.get(1).map(|s| s.as_str())),
        Mode::Drift => match positional.get(1) {
            Some(lists) => run_drift(path, lists),
            None => Err(anyhow::anyhow!(
                "--drift needs the other tag list: ladx-parser --drift <project.ir.json> \
                 <taglists.json>"
            )),
        },
        Mode::Diff => match positional.get(1) {
            Some(after) => run_diff(path, after),
            None => Err(anyhow::anyhow!(
                "--diff needs two files: ladx-parser --diff <before.ir.json> <after.ir.json>"
            )),
        },
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

/// An IR document from disk.
///
/// Read as IR rather than parsed from a vendor file: the caller already has
/// the project, and re-reading it would mean the analysis could disagree with
/// what is on screen.
fn read_ir(path: &str) -> anyhow::Result<ladx_ir::IrProject> {
    let raw = std::fs::read_to_string(path).with_context(|| format!("reading {path}"))?;
    serde_json::from_str(&raw).with_context(|| format!("{path} is not a LADX IR document"))
}

fn run_health(path: &str) -> anyhow::Result<String> {
    let project = read_ir(path)?;
    Ok(serde_json::to_string(&ladx_ir::health::analyse(&project))?)
}

fn run_why(path: &str, tag: &str) -> anyhow::Result<String> {
    let project = read_ir(path)?;
    Ok(serde_json::to_string(&ladx_ir::trace::why(&project, tag))?)
}

/// Which of the written standards apply to a request.
///
/// Takes one file holding the standards, the request and the project, rather
/// than reading a database: the caller already has them, and a binary that
/// could reach the database would be a second place the schema has to be known.
fn run_standards(path: &str) -> anyhow::Result<String> {
    #[derive(serde::Deserialize)]
    struct Input {
        memories: Vec<ladx_types::Memory>,
        request: String,
        #[serde(default)]
        project: Option<String>,
    }

    let raw = std::fs::read_to_string(path).with_context(|| format!("reading {path}"))?;
    let input: Input =
        serde_json::from_str(&raw).with_context(|| format!("{path} is not a standards request"))?;

    let out = ladx_rag::applicable(&input.memories, &input.request, input.project.as_deref());

    Ok(serde_json::to_string(&serde_json::json!({
        // The text a prompt gets, with the vetoes first and labelled as such.
        "prompt": out.to_prompt(),
        // And the ids, so a caller can say which standards it used rather than
        // leaving somebody to guess why the answer came out that way.
        "forbidden": out.forbidden.iter().map(|m| &m.id).collect::<Vec<_>>(),
        "guidance": out.guidance.iter().map(|m| &m.id).collect::<Vec<_>>(),
    }))?)
}

/// The I/O list, with the CSV alongside so a caller does not build it again.
fn run_io(path: &str) -> anyhow::Result<String> {
    let project = read_ir(path)?;
    let list = ladx_ir::io::io_list(&project);
    Ok(serde_json::to_string(&serde_json::json!({
        "points": list.points,
        "issues": list.issues,
        "inputs": list.inputs(),
        "outputs": list.outputs(),
        "csv": ladx_ir::io::to_csv(&list),
    }))?)
}

fn run_sequence(path: &str) -> anyhow::Result<String> {
    let project = read_ir(path)?;
    let s = ladx_ir::sequence::sequences(&project);
    Ok(serde_json::to_string(&serde_json::json!({
        "sequences": s.sequences,
        "notes": s.notes,
        "text": s.sequences.iter().map(|x| x.to_text()).collect::<Vec<_>>().join("\n"),
    }))?)
}

fn run_tests(path: &str) -> anyhow::Result<String> {
    let project = read_ir(path)?;
    let plan = ladx_ir::tests_gen::test_plan(&project);
    Ok(serde_json::to_string(&serde_json::json!({
        "groups": plan.groups,
        "notCovered": plan.not_covered,
        "safetySteps": plan.safety_steps(),
        "markdown": plan.to_markdown(&format!("{}: acceptance tests", project.name)),
    }))?)
}

/// The racks. Reads an L5X rather than an IR document, because the module list
/// is hardware configuration and the IR holds a program.
fn run_hardware(path: &str) -> anyhow::Result<String> {
    let bytes = std::fs::read(path).with_context(|| format!("reading {path}"))?;
    let import = ladx_parsers::l5x_ir::parse_to_ir(&bytes)
        .with_context(|| format!("reading the hardware configuration in {path}"))?;
    let findings = import.hardware.check(&import.project);
    Ok(serde_json::to_string(&serde_json::json!({
        "modules": import.hardware.modules,
        "notes": import.hardware.notes,
        "findings": findings,
        "breaking": findings.iter().filter(|f| f.issue.is_wrong_at_runtime()).count(),
        "table": import.hardware.to_text(),
    }))?)
}

fn run_deviations(path: &str) -> anyhow::Result<String> {
    let project = read_ir(path)?;
    Ok(serde_json::to_string(&serde_json::json!({
        "deviations": ladx_ir::library::deviations(&project),
        "blocks": ladx_ir::library::blocks(),
    }))?)
}

/// The program against another tag list: an HMI export, an I/O schedule.
fn run_drift(path: &str, lists: &str) -> anyhow::Result<String> {
    let project = read_ir(path)?;
    let raw = std::fs::read_to_string(lists).with_context(|| format!("reading {lists}"))?;
    let sources: Vec<ladx_ir::drift::Source> = serde_json::from_str(&raw)
        .with_context(|| format!("{lists} is not a list of tag sources"))?;
    let report = ladx_ir::drift::drift(&project, &sources);
    Ok(serde_json::to_string(&serde_json::json!({
        "drifts": report.drifts,
        "notes": report.notes,
        "breaking": report.breaking().len(),
        "text": report.to_text(),
    }))?)
}

/// The pack. Takes the tag lists as a second file where there are any, because
/// a pack assembled without them says so on its own manifest.
fn run_handover(path: &str, lists: Option<&str>) -> anyhow::Result<String> {
    let project = read_ir(path)?;
    let sources: Vec<ladx_ir::drift::Source> = match lists {
        Some(p) => serde_json::from_str(
            &std::fs::read_to_string(p).with_context(|| format!("reading {p}"))?,
        )
        .with_context(|| format!("{p} is not a list of tag sources"))?,
        None => Vec::new(),
    };
    let pack = ladx_ir::handover::pack(
        &project,
        &ladx_ir::handover::PackInputs {
            other_tag_lists: &sources,
            ..Default::default()
        },
    );
    Ok(serde_json::to_string(&pack)?)
}

fn run_alarms(path: &str) -> anyhow::Result<String> {
    let project = read_ir(path)?;
    let list = ladx_ir::alarms::alarm_list(&project);
    Ok(serde_json::to_string(&serde_json::json!({
        "alarms": list.alarms,
        "issues": list.issues,
        "csv": ladx_ir::alarms::to_csv(&list),
    }))?)
}

fn run_narrative(path: &str) -> anyhow::Result<String> {
    let project = read_ir(path)?;
    let doc = ladx_ir::docs::control_narrative(&project);
    Ok(serde_json::to_string(&serde_json::json!({
        "title": doc.title,
        "sections": doc.sections,
        "gaps": doc.gaps(),
        "markdown": doc.to_markdown(),
    }))?)
}

fn run_diff(before: &str, after: &str) -> anyhow::Result<String> {
    let a = read_ir(before)?;
    let b = read_ir(after)?;
    let d = ladx_ir::diff::diff(&a, &b);
    Ok(serde_json::to_string(&serde_json::json!({
        "changes": d.changes,
        "notCompared": d.not_compared,
        "worst": d.worst(),
    }))?)
}

fn run_screens(path: &str) -> anyhow::Result<String> {
    let project = read_ir(path)?;
    Ok(serde_json::to_string(&ladx_hmi::propose::propose(&project))?)
}
