//! An L5X, converted to Siemens SCL.
//!
//!     cargo run -p ladx-vendor-siemens --example migrate -- <file.L5X>

use ladx_vendor_siemens::migrate::l5x_to_siemens;

fn main() {
    let Some(path) = std::env::args().nth(1) else {
        eprintln!("usage: migrate <file.L5X>");
        std::process::exit(2);
    };
    let bytes = std::fs::read(&path).expect("could not read");

    match l5x_to_siemens(&bytes) {
        Err(e) => {
            eprintln!("could not read that L5X: {e}");
            std::process::exit(1);
        }
        Ok(m) => {
            print!("{}", m.to_source());
            println!("// ─────────────────────────────────────");
            println!("// {}", m.summary());
            if m.needs_review() {
                println!("//");
                println!("// Before this is used, somebody has to look at:");
                for n in m.report.for_review() {
                    println!("//   [{}] {}: {}", n.fidelity.label(), n.subject, n.detail);
                }
            }
            println!("//");
            println!("// Nothing here has been imported by TIA Portal.");
        }
    }
}
