//! Ask a project about one of its tags.
//!
//!     cargo run -p ladx-ir --example explain -- <project.ir.json> <tag>
//!
//! The point is what is *not* here: no model, no retrieval, no prompt. These
//! answers are computed from the program, so they are either right or a bug,
//! rather than plausible. What a model is later given is the rungs this names.

use ladx_ir::graph::ProjectGraph;
use ladx_ir::IrProject;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let (Some(path), Some(tag)) = (args.get(1), args.get(2)) else {
        eprintln!("usage: explain <project.ir.json> <tag>");
        std::process::exit(2);
    };

    let raw = std::fs::read_to_string(path).expect("could not read the project");
    let project: IrProject = serde_json::from_str(&raw).expect("not an IR document");
    let g = ProjectGraph::build(&project);

    println!("{} in {}\n", tag, project.name);

    let writers = g.writers_of(tag);
    if writers.is_empty() {
        println!("  Nothing in this program drives it. It comes from the field, or from");
        println!("  somewhere LADX cannot read.");
    } else {
        println!("  Driven by:");
        for w in &writers {
            println!("    {} in {}, rung {}", w.via, w.pou, w.rung);
        }
    }

    let readers = g.readers_of(tag);
    println!();
    if readers.is_empty() {
        println!("  Nothing examines it.");
    } else {
        println!("  Examined by:");
        for r in &readers {
            println!("    {} in {}, rung {}", r.via, r.pou, r.rung);
        }
    }

    if g.writers_of(tag).len() > 1 {
        println!("\n  Driven from more than one place. That is normal for a latch or a");
        println!("  step register, and worth a look if this output is misbehaving.");
    }

    if !g.declared.iter().any(|d| d == tag) && !g.uses_of(tag).is_empty() {
        println!("\n  Nothing declares this tag.");
    }

    let unused = g.unused();
    let undeclared = g.undeclared();
    if !unused.is_empty() || !undeclared.is_empty() {
        println!("\n  Elsewhere in this project:");
        if !undeclared.is_empty() {
            println!("    used but not declared: {}", undeclared.join(", "));
        }
        if !unused.is_empty() {
            println!("    declared but unused:   {}", unused.join(", "));
        }
    }

}
