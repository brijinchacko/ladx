//! Look a project over.
//!
//!     cargo run -p ladx-ir --example analyse -- <project.ir.json>

use ladx_ir::health::{analyse, Severity};
use ladx_ir::IrProject;

fn main() {
    let Some(path) = std::env::args().nth(1) else {
        eprintln!("usage: analyse <project.ir.json>");
        std::process::exit(2);
    };
    let project: IrProject =
        serde_json::from_str(&std::fs::read_to_string(&path).expect("could not read")).unwrap();

    let r = analyse(&project);
    println!("{}\n", project.name);

    if r.findings.is_empty() {
        println!("  Nothing to report.");
    }
    for f in &r.findings {
        let tag = match f.severity {
            Severity::Critical => "CRITICAL",
            Severity::Warning => "WARNING ",
            Severity::Suggestion => "SUGGEST ",
            Severity::Information => "INFO    ",
        };
        println!("  {tag}  {}", f.title);
        println!("            {}", f.detail);
        let places: Vec<String> = f
            .locations
            .iter()
            .filter_map(|l| match (&l.pou, &l.rung) {
                (Some(p), Some(r)) => Some(format!("{p}/{r}")),
                (Some(p), None) => Some(p.clone()),
                _ => None,
            })
            .collect();
        if !places.is_empty() {
            println!("            at {}", places.join(", "));
        }
        println!();
    }

    for n in &r.not_checked {
        println!("  Not examined: {n}");
    }
}
