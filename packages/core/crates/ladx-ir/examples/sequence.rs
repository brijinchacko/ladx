use ladx_ir::sequence::sequences;
use ladx_ir::IrProject;
fn main() {
    let p: IrProject = serde_json::from_str(&std::fs::read_to_string(std::env::args().nth(1).unwrap()).unwrap()).unwrap();
    let s = sequences(&p);
    for seq in &s.sequences { print!("{}", seq.to_text()); }
    for n in &s.notes { println!("  {n}"); }
}
