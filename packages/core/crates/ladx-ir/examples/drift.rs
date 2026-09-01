use ladx_ir::drift::{drift, ExternalTag, Source};
use ladx_ir::IrProject;
fn main() {
    let p: IrProject =
        serde_json::from_str(&std::fs::read_to_string(std::env::args().nth(1).unwrap()).unwrap())
            .unwrap();
    // An HMI list of the kind an integrator actually hands over: mostly right,
    // one stale name, one address typo, one screen tag that no longer exists.
    let mut tags: Vec<ExternalTag> = p
        .tags
        .iter()
        .filter(|t| t.address.is_some())
        .map(|t| ExternalTag {
            name: t.name.clone(),
            description: t.comment.clone(),
            address: t.address.clone(),
        })
        .collect();
    if let Some(first) = tags.first_mut() {
        first.name = first.name.replace('_', "");
    }
    if let Some(second) = tags.get_mut(1) {
        second.address = Some("Local:2:I.Data.9".into());
    }
    tags.push(ExternalTag { name: "Recipe_Number".into(), description: None, address: None });
    print!("{}", drift(&p, &[Source { name: "HMI".into(), tags }]).to_text());
}
