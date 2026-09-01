//! IR out to SCL, and back. What survives the trip and what does not.
use ladx_ir::IrProject;
use ladx_vendor_siemens::{read::read_scl, scl::pou_to_scl};

fn main() {
    let path = std::env::args().nth(1).unwrap();
    let p: IrProject = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();

    let mut src = String::new();
    for pou in &p.pous {
        let s = pou_to_scl(pou);
        src.push_str(&format!("// \u{2500}\u{2500} {} \u{2500}\u{2500}\n", pou.name));
        src.push_str(&ladx_vendor_siemens::scl::declarations(&s.instances));
        src.push('\n');
        src.push_str(&s.source);
        src.push('\n');
    }
    println!("--- SCL ---\n{src}");

    let back = read_scl(&p.name, &src);
    println!("--- read back: {} ---", back.summary());
    for n in &back.notes {
        if n.fidelity != ladx_vendor_siemens::read::ReadFidelity::Exact {
            println!("  [{:?}] {} {}", n.fidelity, n.at, n.detail);
            if let Some(s) = &n.source {
                println!("        {s}");
            }
        }
    }

    println!("--- logic, ignoring the rung ids SCL cannot carry ---");
    let strip = |p: &IrProject| {
        p.pous
            .iter()
            .map(|pou| {
                let ladx_ir::PouBody::Ladder { rungs } = &pou.body else { return String::new() };
                rungs
                    .iter()
                    .map(|r| {
                        format!(
                            "{:?} => {:?}",
                            r.logic.instructions().iter().map(|i| (&i.op, &i.operands)).collect::<Vec<_>>(),
                            r.outputs.iter().map(|i| (&i.op, &i.operands)).collect::<Vec<_>>()
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .collect::<Vec<_>>()
            .join("\n")
    };
    if strip(&p) == strip(&back.project) {
        println!("  identical");
    } else {
        for (a, b) in strip(&p).lines().zip(strip(&back.project).lines()) {
            if a != b {
                println!("  before: {a}\n  after:  {b}");
            }
        }
    }

    println!("--- what changed ---");
    let d = ladx_ir::diff::diff(&p, &back.project);
    if d.changes.is_empty() {
        println!("  nothing: the program survived the round trip");
    }
    for c in &d.changes {
        println!("  [{:?}] {}", c.risk, c.summary);
    }
}
