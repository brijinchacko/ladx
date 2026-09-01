//! Screens proposed from a program.
//!
//!     cargo run -p ladx-hmi --example propose -- <project.ir.json>

use ladx_hmi::propose::{propose, Control};
use ladx_ir::IrProject;

fn main() {
    let Some(path) = std::env::args().nth(1) else {
        eprintln!("usage: propose <project.ir.json>");
        std::process::exit(2);
    };
    let project: IrProject =
        serde_json::from_str(&std::fs::read_to_string(path).expect("could not read")).unwrap();

    let p = propose(&project);
    for s in &p.screens {
        println!("{}", s.name);
        println!("  {}", s.purpose);
        for b in &s.bindings {
            let how = match b.control {
                Control::Indicator => "show",
                Control::Momentary => "press",
                Control::Maintained => "switch",
                Control::Setpoint => "set",
                Control::Alarm => "alarm",
            };
            println!("    {:<6} {:<22} {}", how, b.tag, b.label);
        }
        println!();
    }
    for n in &p.notes {
        println!("  {n}");
    }
}
