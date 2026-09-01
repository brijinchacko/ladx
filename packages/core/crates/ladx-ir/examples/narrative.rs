use ladx_ir::docs::control_narrative;
use ladx_ir::IrProject;
fn main() {
    let path = std::env::args().nth(1).unwrap();
    let p: IrProject = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let d = control_narrative(&p);
    print!("{}", d.to_markdown());
    eprintln!("gaps: {}", d.gaps());
}
