use ladx_ir::handover::{pack, PackInputs};
use ladx_ir::IrProject;
fn main() {
    let p: IrProject =
        serde_json::from_str(&std::fs::read_to_string(std::env::args().nth(1).unwrap()).unwrap())
            .unwrap();
    let pk = pack(&p, &PackInputs { dated: Some("2026-09-01".into()), ..Default::default() });
    println!("{}", pk.file("00-manifest.md").unwrap().content);
    println!("--- files ---");
    for f in &pk.files {
        println!("{:>28}  {} bytes", f.path, f.content.len());
    }
}
