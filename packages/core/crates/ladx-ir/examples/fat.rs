use ladx_ir::tests_gen::test_plan;
use ladx_ir::IrProject;
fn main() {
    let p: IrProject = serde_json::from_str(&std::fs::read_to_string(std::env::args().nth(1).unwrap()).unwrap()).unwrap();
    print!("{}", test_plan(&p).to_markdown(&format!("{}: acceptance tests", p.name)));
}
