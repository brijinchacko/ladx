use ladx_ir::library::{blocks, build, deviations, tags_for};
use ladx_ir::IrProject;
use std::collections::BTreeMap;

fn main() {
    if let Some(path) = std::env::args().nth(1) {
        let p: IrProject = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        for d in deviations(&p) {
            println!("{}/{}: {}\n", d.pou, d.rung, d.detail);
        }
        return;
    }
    for b in blocks() {
        println!("{} — {}", b.name, b.about);
    }
    let params: BTreeMap<String, String> = [
        ("start", "P101_Start_PB"),
        ("stop", "P101_Stop_PB"),
        ("overload", "P101_Overload_OK"),
        ("permissive", "Cell_Safety_OK"),
        ("motor", "P101_Run"),
    ]
    .iter()
    .map(|(k, v)| (k.to_string(), v.to_string()))
    .collect();
    let pou = build("motor-starter", "P101", &params).unwrap();
    println!("\n{}", ladx_ir::to_st::pou_to_st(&pou).source);
    println!("tags: {:?}", tags_for(&pou).iter().map(|t| &t.name).collect::<Vec<_>>());
}
