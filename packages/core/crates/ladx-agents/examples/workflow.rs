use ladx_agents::workflow::*;
use ladx_ir::IrProject;

fn main() {
    let path = std::env::args().nth(1).unwrap();
    let p: IrProject = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    // A stand-in model, so the run shows the shape rather than a model's words.
    let ask = |role: Role, _: &str| -> Result<String, String> {
        Ok(format!("<{role:?} would answer here>"))
    };
    for wf in workflows() {
        let ctx = Context {
            project: &p,
            hardware: None,
            tag_lists: &[],
            ask: &ask,
            answers: &[],
            model_answers: &[],
            wait_for_model: false,
        };
        print!("{}", run(&wf, "Add a jam alarm to the conveyor", &ctx).to_text());
        println!("────");
    }
}
