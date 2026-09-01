//! Why won't it start?
//!
//!     cargo run -p ladx-ir --example why -- <project.ir.json> <tag>

use ladx_ir::trace::{Sense, why};
use ladx_ir::IrProject;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let (Some(path), Some(tag)) = (args.get(1), args.get(2)) else {
        eprintln!("usage: why <project.ir.json> <tag>");
        std::process::exit(2);
    };
    let project: IrProject =
        serde_json::from_str(&std::fs::read_to_string(path).expect("could not read")).unwrap();

    let t = why(&project, tag);
    println!("What has to be true for {} to come on\n", t.tag);

    if let Some(note) = &t.note {
        println!("  {note}");
        return;
    }

    for step in &t.steps {
        let indent = "  ".repeat(step.depth as usize + 1);
        if step.already_seen {
            println!("{indent}{} is held in by {} on {}/{} (already covered above)",
                step.tag, step.via, step.pou, step.rung);
            continue;
        }
        println!("{indent}{} is driven by {} on {}/{}", step.tag, step.via, step.pou, step.rung);
        if let Some(c) = &step.comment {
            println!("{indent}  \"{c}\"");
        }
        for c in &step.conditions {
            let want = match c.sense {
                Sense::MustBeOn => "must be ON",
                Sense::MustBeOff => "must be OFF",
                Sense::Other => "is compared",
            };
            let alt = if c.one_of_several { ", or one of the alternatives" } else { "" };
            let more = if c.driven_in_program { " (driven in this program)" } else { "" };
            println!("{indent}    {} {want}{alt}{more}", c.tag);
        }
        println!();
    }

    let checks = t.things_to_check();
    if !checks.is_empty() {
        println!("  Directly on the rung that drives it, check:");
        for c in checks {
            println!(
                "    {} {}",
                c.tag,
                if c.sense == Sense::MustBeOn { "is on" } else { "is off" }
            );
        }
        println!(
            "\n  Anything further back is above, with its structure: following a\n  \
             condition that must be OFF inverts what is behind it, so it cannot be\n  \
             flattened into this list without saying the opposite of the truth."
        );
    }
}
