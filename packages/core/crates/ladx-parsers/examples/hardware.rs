fn main() {
    let bytes = std::fs::read(std::env::args().nth(1).unwrap()).unwrap();
    let import = ladx_parsers::l5x_ir::parse_to_ir(&bytes).unwrap();
    print!("{}", import.hardware.to_text());
    println!();
    for f in import.hardware.check(&import.project) {
        println!("[{:?}] {}", f.issue, f.detail);
    }
}
