//! Several specialists on one job, with the checks as the gates between them.
//!
//! "Multi-agent" usually means several model calls in a row, each one asked to
//! review the last. That does not work here, and not because the models are
//! bad: a reviewer with no way to compile, no I/O list and no rack drawing is
//! guessing, and two guesses in sequence are still a guess. It also fails the
//! thing this product is actually sold on, which is that nobody has to take the
//! output on trust.
//!
//! So a workflow here alternates. A model step proposes; a check step decides.
//! The check steps are the engines that already exist and already have tests:
//! the structural checks, the hardware comparison, the tag drift report, the
//! validation levels. They are ordinary code, they cannot be talked round, and
//! when one of them fails the run stops there rather than passing a problem
//! down the line with a note attached.
//!
//! The run keeps every step, in order, with what went in and what came out.
//! That is not a feature bolted on for compliance; it is the only way anybody
//! can answer "why does the machine do that" six months later.

use ladx_ir::IrProject;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// What a step is for. The distinction that matters is whether a step can be
/// argued with.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/agents/")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StepKind {
    /// A model call. Proposes; never decides.
    Model {
        /// The specialist being asked, which sets what it is told and what it
        /// is asked for.
        role: Role,
    },
    /// Ordinary code, run against the program. Decides; cannot be argued with.
    Check { check: Check },
    /// A person. The run stops here until somebody answers, and no model step
    /// may stand in for one.
    Person { asking: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/agents/")]
#[serde(rename_all = "camelCase")]
pub enum Role {
    /// Reads the existing program and says what is there.
    Surveyor,
    /// Turns a request into a plan against what is there.
    Planner,
    /// Writes the logic.
    Author,
    /// Reads the logic back and argues with it.
    Reviewer,
    /// Writes the words that go around it.
    Documenter,
}

impl Role {
    pub fn about(self) -> &'static str {
        match self {
            Role::Surveyor => "reads the program and reports what is there, without proposing anything",
            Role::Planner => "turns the request into a plan against the program as it is",
            Role::Author => "writes the logic the plan asks for, and nothing else",
            Role::Reviewer => "reads the logic back and looks for what is wrong with it",
            Role::Documenter => "writes the narrative and the test steps for what was built",
        }
    }
}

/// The checks that can stand as a gate. Each one is an engine with its own
/// tests, not a prompt.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/agents/")]
#[serde(rename_all = "camelCase")]
pub enum Check {
    /// Rungs that cannot do what they appear to do.
    Structural,
    /// Where the program departs from the standard blocks.
    AgainstLibrary,
    /// What the program addresses against what is in the racks.
    AgainstHardware,
    /// The program against the other tag lists.
    AgainstTagLists,
    /// Whether the level being claimed is one LADX may award.
    LevelClaim,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/agents/")]
#[serde(rename_all = "camelCase")]
pub struct Step {
    pub id: String,
    pub kind: StepKind,
    pub about: String,
    /// Whether a failure here stops the run.
    ///
    /// A check that reports problems and lets the run continue is decoration.
    /// The ones that are not blocking are the ones that genuinely cannot fail,
    /// only inform.
    pub blocking: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/agents/")]
#[serde(rename_all = "camelCase")]
pub struct Workflow {
    pub name: String,
    pub about: String,
    pub steps: Vec<Step>,
}

/* ─────────────────────────────── running ───────────────────────────── */

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/agents/")]
#[serde(rename_all = "camelCase")]
pub enum Outcome {
    Passed,
    /// Ran, found things, and the run may go on.
    Noted,
    /// Ran, found things, and the run stops.
    Stopped,
    /// Waiting on a person.
    Waiting,
    /// Not reached, because something before it stopped.
    NotReached,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/agents/")]
#[serde(rename_all = "camelCase")]
pub struct StepRecord {
    pub id: String,
    pub outcome: Outcome,
    /// What the step was given. Kept so the run can be read back.
    pub input: String,
    /// What it produced, or what it found.
    pub output: String,
    /// Findings, where the step was a check.
    pub findings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../types/src/generated/agents/")]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub workflow: String,
    pub request: String,
    pub steps: Vec<StepRecord>,
    /// Whether the whole run got to the end.
    pub finished: bool,
    /// Why it stopped, where it did.
    pub stopped_because: Option<String>,
}

impl Run {
    /// The step that stopped it, if one did.
    pub fn blocker(&self) -> Option<&StepRecord> {
        self.steps.iter().find(|s| s.outcome == Outcome::Stopped)
    }

    pub fn waiting_on(&self) -> Option<&StepRecord> {
        self.steps.iter().find(|s| s.outcome == Outcome::Waiting)
    }

    /// The run as somebody would read it back.
    pub fn to_text(&self) -> String {
        let mut s = format!("{}: {}\n\n", self.workflow, self.request);
        for r in &self.steps {
            s.push_str(&format!("  {:?}  {}\n", r.outcome, r.id));
            for f in &r.findings {
                s.push_str(&format!("      {f}\n"));
            }
        }
        if let Some(why) = &self.stopped_because {
            s.push_str(&format!("\nStopped: {why}\n"));
        } else if self.finished {
            s.push_str("\nEvery step ran.\n");
        }
        s
    }
}

/// What a run needs from outside itself.
///
/// The model is passed in rather than reached for, which is what lets the
/// desktop run the same workflows against a local model with no network call,
/// and what lets the tests run a workflow with no model at all.
pub struct Context<'a> {
    pub project: &'a IrProject,
    pub hardware: Option<&'a ladx_ir::hardware::Hardware>,
    pub tag_lists: &'a [ladx_ir::drift::Source],
    /// Asked for each model step. An error stops the run: a workflow that
    /// carries on past a model it could not reach would produce a run record
    /// showing steps that never happened.
    pub ask: &'a dyn Fn(Role, &str) -> Result<String, String>,
    /// Answers a person has already given, by step id. A step with no answer
    /// waits.
    pub answers: &'a [(String, String)],
    /// Answers a model has already given, by step id.
    ///
    /// This is what lets a run be driven from outside, one step at a time:
    /// a web route cannot hand a callback into a process, so it hands in
    /// what the model said last time and asks again. The gates stay here.
    pub model_answers: &'a [(String, String)],
    /// Whether a model step with no recorded answer should wait rather than
    /// ask. True for the driven case; false for a run with a live callback.
    pub wait_for_model: bool,
}

fn run_check(check: Check, ctx: &Context<'_>) -> (Outcome, Vec<String>) {
    match check {
        Check::Structural => {
            let health = ladx_ir::health::analyse(ctx.project);
            // Only the critical ones stop a run. Stopping on a suggestion
            // would mean nobody could ever get through the workflow, and a
            // gate everyone learns to route around is worse than no gate.
            let found: Vec<String> = health
                .findings
                .iter()
                .filter(|f| f.severity >= ladx_ir::health::Severity::Warning)
                .map(|f| f.detail.clone())
                .collect();
            let serious = health
                .findings
                .iter()
                .any(|f| f.severity == ladx_ir::health::Severity::Critical);
            (if serious { Outcome::Stopped } else if found.is_empty() { Outcome::Passed } else { Outcome::Noted }, found)
        }
        Check::AgainstLibrary => {
            let d = ladx_ir::library::deviations(ctx.project);
            let found: Vec<String> = d.iter().map(|x| x.detail.clone()).collect();
            // Departing from a house standard is a question for a person, not
            // a fault. It never stops a run on its own.
            (if found.is_empty() { Outcome::Passed } else { Outcome::Noted }, found)
        }
        Check::AgainstHardware => match ctx.hardware {
            None => (
                Outcome::Noted,
                vec!["No hardware configuration was given, so no address was checked against a card.".into()],
            ),
            Some(hw) => {
                let f = hw.check(ctx.project);
                let breaking = f.iter().filter(|x| x.issue.is_wrong_at_runtime()).count();
                let found: Vec<String> = f.iter().map(|x| x.detail.clone()).collect();
                (
                    if breaking > 0 { Outcome::Stopped } else if found.is_empty() { Outcome::Passed } else { Outcome::Noted },
                    found,
                )
            }
        },
        Check::AgainstTagLists => {
            // A check with nothing to compare against cannot fail, and a step
            // that cannot fail must not report Passed: read back later, a
            // green line here would say the tag lists agreed.
            if ctx.tag_lists.is_empty() {
                return (
                    Outcome::Noted,
                    vec!["No HMI tag list or I/O schedule was given, so nothing was compared. \
                          This step did not pass; it had nothing to do."
                        .into()],
                );
            }
            let d = ladx_ir::drift::drift(ctx.project, ctx.tag_lists);
            let breaking = d.breaking().len();
            let found: Vec<String> = d.drifts.iter().map(|x| x.detail.clone()).collect();
            (
                if breaking > 0 { Outcome::Stopped } else if found.is_empty() { Outcome::Passed } else { Outcome::Noted },
                found,
            )
        }
        Check::LevelClaim => {
            // Nothing a workflow does can earn a level above IEC, and a run
            // that ended by claiming one would be the exact failure this
            // product exists to avoid.
            let level = ladx_ir::validation::Level::Iec;
            (
                Outcome::Passed,
                vec![format!(
                    "The most this run can reach is {}. {}",
                    level.label(),
                    level.caveat()
                )],
            )
        }
    }
}

/// The program as text a model can read.
///
/// Every tag with its type, address and comment, then every rung of every
/// ladder POU in the neutral text the converter writes. A model told only
/// "6 tags and 1 POU" reports that it cannot see the tags, which is true and
/// useless; this is what makes a surveyor's report name the actual rungs.
/// Capped, because a two thousand rung program is not a prompt.
pub fn describe(project: &IrProject) -> String {
    const MAX_RUNGS: usize = 200;
    let mut s = String::new();
    s.push_str(&format!("Tags ({}):\n", project.tags.len()));
    for t in project.tags.iter().take(400) {
        s.push_str(&format!(
            "- {} {:?}{}{}\n",
            t.name,
            t.data_type,
            t.address.as_deref().map(|a| format!(" at {a}")).unwrap_or_default(),
            t.comment.as_deref().map(|c| format!(", {c}")).unwrap_or_default(),
        ));
    }
    let mut shown = 0;
    for pou in &project.pous {
        if let ladx_ir::PouBody::Ladder { rungs } = &pou.body {
            s.push_str(&format!("\nRoutine {} ({} rungs):\n", pou.name, rungs.len()));
            for r in rungs {
                if shown >= MAX_RUNGS {
                    s.push_str("  ... more rungs not shown\n");
                    return s;
                }
                shown += 1;
                let text = ladx_ir::neutral_text::rung_to_text(r).unwrap_or_else(|_| "(could not render)".into());
                let comment = r.comment.as_deref().map(|c| format!("  // {c}")).unwrap_or_default();
                s.push_str(&format!("  {}:{comment}\n    {}\n", r.id, text.trim().replace('\n', "\n    ")));
            }
        } else {
            s.push_str(&format!("\nRoutine {} is not ladder and is not shown.\n", pou.name));
        }
    }
    s
}

/// Run a workflow.
pub fn run(workflow: &Workflow, request: &str, ctx: &Context<'_>) -> Run {
    let mut records: Vec<StepRecord> = Vec::new();
    let mut stopped: Option<String> = None;
    let mut carried = request.to_string();

    for step in &workflow.steps {
        if stopped.is_some() {
            records.push(StepRecord {
                id: step.id.clone(),
                outcome: Outcome::NotReached,
                input: String::new(),
                output: String::new(),
                findings: vec![],
            });
            continue;
        }

        let record = match &step.kind {
            StepKind::Check { check } => {
                let (outcome, findings) = run_check(*check, ctx);
                let blocking_now = outcome == Outcome::Stopped && step.blocking;
                if blocking_now {
                    stopped = Some(format!("{} found something that has to be fixed first", step.id));
                }
                StepRecord {
                    id: step.id.clone(),
                    outcome: if outcome == Outcome::Stopped && !step.blocking {
                        Outcome::Noted
                    } else {
                        outcome
                    },
                    input: String::new(),
                    output: format!("{:?}", check),
                    findings,
                }
            }
            StepKind::Person { asking } => {
                match ctx.answers.iter().find(|(id, _)| id == &step.id) {
                    Some((_, answer)) => {
                        carried = format!("{carried}\n\n{asking}\n{answer}");
                        StepRecord {
                            id: step.id.clone(),
                            outcome: Outcome::Passed,
                            input: asking.clone(),
                            output: answer.clone(),
                            findings: vec![],
                        }
                    }
                    None => {
                        // Not an error, and not something a model may answer
                        // instead. The run pauses.
                        stopped = Some(format!("waiting on a person: {asking}"));
                        StepRecord {
                            id: step.id.clone(),
                            outcome: Outcome::Waiting,
                            input: asking.clone(),
                            output: String::new(),
                            findings: vec![],
                        }
                    }
                }
            }
            StepKind::Model { role } => {
                let prompt = format!(
                    "You are the {role:?} on this job. Your part is: {}.\n\nThe request: {carried}\n\n\
                     The program:\n{}\n\nWhat has happened so far:\n{}",
                    role.about(),
                    describe(ctx.project),
                    records
                        .iter()
                        .map(|r| {
                            let found = if r.findings.is_empty() {
                                String::new()
                            } else {
                                format!(": {}", r.findings.join("; "))
                            };
                            format!("- {} {:?}{found}", r.id, r.outcome)
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                );
                let recorded = ctx
                    .model_answers
                    .iter()
                    .find(|(id, _)| id == &step.id)
                    .map(|(_, a)| Ok(a.clone()));
                let asked = match recorded {
                    Some(r) => r,
                    None if ctx.wait_for_model => {
                        // Driven from outside: the prompt goes out as the
                        // step's input and the run pauses until the answer
                        // comes back in. Not an error, and not a pass.
                        stopped = Some(format!("waiting on a model: {}", step.id));
                        records.push(StepRecord {
                            id: step.id.clone(),
                            outcome: Outcome::Waiting,
                            input: prompt,
                            output: String::new(),
                            findings: vec![],
                        });
                        continue;
                    }
                    None => (ctx.ask)(*role, &prompt),
                };
                match asked {
                    Ok(answer) => {
                        carried = format!("{carried}\n\n{:?} said:\n{answer}", role);
                        StepRecord {
                            id: step.id.clone(),
                            outcome: Outcome::Passed,
                            input: prompt,
                            output: answer,
                            findings: vec![],
                        }
                    }
                    Err(why) => {
                        stopped = Some(format!("{} could not run: {why}", step.id));
                        StepRecord {
                            id: step.id.clone(),
                            outcome: Outcome::Stopped,
                            input: prompt,
                            output: String::new(),
                            findings: vec![why],
                        }
                    }
                }
            }
        };
        records.push(record);
    }

    Run {
        workflow: workflow.name.clone(),
        request: request.to_string(),
        finished: stopped.is_none(),
        stopped_because: stopped,
        steps: records,
    }
}

/* ────────────────────────── the workflows shipped ──────────────────── */

fn model(id: &str, role: Role, about: &str) -> Step {
    Step { id: id.into(), kind: StepKind::Model { role }, about: about.into(), blocking: true }
}

fn check(id: &str, check: Check, about: &str, blocking: bool) -> Step {
    Step { id: id.into(), kind: StepKind::Check { check }, about: about.into(), blocking }
}

/// Change an existing program.
pub fn modify_program() -> Workflow {
    Workflow {
        name: "modify-program".into(),
        about: "Change a program that is already running a machine. The checks sit between the \
                writing and the review, so a rung that cannot do what it appears to do never \
                reaches a reviewer who would have to spot it by eye."
            .into(),
        steps: vec![
            model("survey", Role::Surveyor, "Say what the program does now"),
            model("plan", Role::Planner, "Say what has to change, against what is there"),
            Step {
                id: "confirm-plan".into(),
                kind: StepKind::Person {
                    asking: "Is this the change you wanted, and is the machine safe to change?"
                        .into(),
                },
                about: "A person confirms before anything is written".into(),
                blocking: true,
            },
            model("write", Role::Author, "Write the logic"),
            check("structural", Check::Structural, "Rungs that cannot do what they appear to", true),
            check("hardware", Check::AgainstHardware, "Addresses against the racks", true),
            check("library", Check::AgainstLibrary, "Against the house standard", false),
            model("review", Role::Reviewer, "Argue with what was written"),
            check("level", Check::LevelClaim, "State what this run can and cannot claim", false),
        ],
    }
}

/// Take on a program somebody else wrote.
pub fn assess_program() -> Workflow {
    Workflow {
        name: "assess-program".into(),
        about: "Work out what an unfamiliar program does and what is wrong with it, before \
                quoting for work on it."
            .into(),
        steps: vec![
            check("structural", Check::Structural, "Rungs that cannot do what they appear to", false),
            check("hardware", Check::AgainstHardware, "Addresses against the racks", false),
            check("tag-lists", Check::AgainstTagLists, "The program against the HMI and schedules", false),
            check("library", Check::AgainstLibrary, "Against the house standard", false),
            model("survey", Role::Surveyor, "Say what the program does"),
            model("report", Role::Documenter, "Write it up"),
        ],
    }
}

/// Get a finished job out of the door.
pub fn prepare_handover() -> Workflow {
    Workflow {
        name: "prepare-handover".into(),
        about: "Assemble what the customer gets. Every check runs first, because a pack \
                assembled around a known fault is a fault with documentation."
            .into(),
        steps: vec![
            check("structural", Check::Structural, "Rungs that cannot do what they appear to", true),
            check("hardware", Check::AgainstHardware, "Addresses against the racks", true),
            check("tag-lists", Check::AgainstTagLists, "The program against the HMI and schedules", true),
            check("level", Check::LevelClaim, "State what has actually been validated", false),
            model("narrative", Role::Documenter, "Write the control narrative"),
        ],
    }
}

pub fn workflows() -> Vec<Workflow> {
    vec![modify_program(), assess_program(), prepare_handover()]
}

pub fn workflow(name: &str) -> Option<Workflow> {
    workflows().into_iter().find(|w| w.name == name)
}
