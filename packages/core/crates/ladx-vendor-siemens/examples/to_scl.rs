//! Ladder as SCL.
//!
//!     cargo run -p ladx-vendor-siemens --example to_scl -- <project.ir.json>

use ladx_ir::{IrProject, PouBody};
use ladx_vendor_siemens::scl::{declarations, pou_to_scl};

fn main() {
    let Some(path) = std::env::args().nth(1) else {
        eprintln!("usage: to_scl <project.ir.json>");
        std::process::exit(2);
    };
    let p: IrProject =
        serde_json::from_str(&std::fs::read_to_string(path).expect("could not read")).unwrap();

    for pou in &p.pous {
        let PouBody::Ladder { .. } = &pou.body else { continue };
        let out = pou_to_scl(pou);
        println!("// ── {} ──────────────────────────────", pou.name);
        print!("{}", declarations(&out.instances));
        println!();
        print!("{}", out.source);
        println!("// {}", out.report.summary());
        for n in out.report.for_review() {
            println!("// [{}] {}", n.fidelity.label(), n.detail);
        }
        println!();
    }
}
