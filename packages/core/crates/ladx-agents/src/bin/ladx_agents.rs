//! ladx-agents, the workflow engine as a process the web can drive.
//!
//! A run is a loop the engine owns: model steps propose, check steps decide,
//! person steps wait. A web route cannot hand a callback into a process, so
//! the route hands in everything said so far and asks where the run stands.
//! The engine answers with the whole run: every step, its outcome, and for a
//! step that is waiting, the prompt or the question. The route then calls the
//! model or a person, records the answer, and asks again. The gates never
//! leave this process.
//!
//! Usage:
//!   ladx-agents --list             the workflows shipped, as JSON
//!   ladx-agents --advance <file>   a run, from a JSON file:
//!     { "workflow": "modify-program", "request": "...", "project": <IrProject>,
//!       "hardware": <Hardware> | null, "tag_lists": [<Source>...],
//!       "answers": [["step-id", "what the person said"]],
//!       "model_answers": [["step-id", "what the model said"]] }

use std::process::ExitCode;

use ladx_agents::workflow::{run, workflow, workflows, Context, Role};
use serde::Deserialize;

#[derive(Deserialize)]
struct Advance {
    workflow: String,
    request: String,
    project: ladx_ir::IrProject,
    #[serde(default)]
    hardware: Option<ladx_ir::hardware::Hardware>,
    #[serde(default)]
    tag_lists: Vec<ladx_ir::drift::Source>,
    #[serde(default)]
    answers: Vec<(String, String)>,
    #[serde(default)]
    model_answers: Vec<(String, String)>,
}

fn usage() -> String {
    "usage: ladx-agents --list | --advance <run.json>".to_string()
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    let out = match args.get(1).map(String::as_str) {
        Some("--list") => serde_json::json!({ "workflows": workflows() }).to_string(),
        Some("--advance") => match args.get(2) {
            None => {
                eprintln!("{}", usage());
                return ExitCode::FAILURE;
            }
            Some(path) => match advance(path) {
                Ok(json) => json,
                Err(why) => {
                    eprintln!("{why}");
                    return ExitCode::FAILURE;
                }
            },
        },
        _ => {
            eprintln!("{}", usage());
            return ExitCode::FAILURE;
        }
    };
    println!("{out}");
    ExitCode::SUCCESS
}

fn advance(path: &str) -> Result<String, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("could not read {path}: {e}"))?;
    let input: Advance = serde_json::from_str(&text).map_err(|e| format!("bad run file: {e}"))?;
    let wf = workflow(&input.workflow).ok_or_else(|| format!("no workflow called {}", input.workflow))?;

    // Never reached: with wait_for_model set, a model step with no recorded
    // answer waits rather than asks. Present so the type is satisfied and so
    // the failure is loud if that ever changes.
    let never = |_role: Role, _prompt: &str| -> Result<String, String> {
        Err("the driven engine does not call a model itself".into())
    };
    let ctx = Context {
        project: &input.project,
        hardware: input.hardware.as_ref(),
        tag_lists: &input.tag_lists,
        ask: &never,
        answers: &input.answers,
        model_answers: &input.model_answers,
        wait_for_model: true,
    };
    let r = run(&wf, &input.request, &ctx);
    serde_json::to_string(&r).map_err(|e| e.to_string())
}
