//! Read an L5X into the IR and print what came out.
//!
//! For pointing the importer at a real project, which is the only way to find
//! out what real files contain that a hand-written sample does not.
//!
//!     cargo run -p ladx-parsers --example read_l5x -- path/to/Project.L5X

fn main() {
    let Some(path) = std::env::args().nth(1) else {
        eprintln!("usage: read_l5x <file.L5X>");
        std::process::exit(2);
    };

    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("could not read {path}: {e}");
            std::process::exit(1);
        }
    };

    match ladx_parsers::l5x_ir::parse_to_ir(&bytes) {
        Err(e) => {
            eprintln!("failed to parse: {e}");
            std::process::exit(1);
        }
        Ok(import) => {
            let p = &import.project;
            println!("project      {}", p.name);
            println!("entry point  {:?}", p.entry_point);
            println!("tags         {}", p.tags.len());
            println!("data types   {}", p.data_types.len());
            println!("POUs         {}", p.pous.len());
            for pou in &p.pous {
                let detail = match &pou.body {
                    ladx_ir::PouBody::Ladder { rungs } => format!("{} rungs", rungs.len()),
                    ladx_ir::PouBody::StructuredText { source } => {
                        format!("{} bytes of ST", source.len())
                    }
                    other => format!("{}", other.language_name()),
                };
                println!("  {:<40} {detail}", pou.name);
            }
            println!("\n{}", import.report.summary());
            for note in import.report.for_review() {
                println!("  [{}] {}: {}", note.fidelity.label(), note.subject, note.detail);
            }
        }
    }
}
