fn main() {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.iter().any(|s| s == "--help" || s == "-h") {
        println!("Skilly: local EVE skill planner\n  cargo run --release -- [--no-open] [--data-dir PATH]\nOnly binds to 127.0.0.1. No EVE login required.");
        return;
    }
    let mut data = std::path::PathBuf::from("data");
    let mut open = true;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--no-open" => open = false,
            "--data-dir" => {
                i += 1;
                if let Some(path) = args.get(i) {
                    data = path.into();
                } else {
                    eprintln!("--data-dir requires a path");
                    std::process::exit(2);
                }
            }
            other => {
                eprintln!("Unknown argument: {other}");
                std::process::exit(2);
            }
        }
        i += 1;
    }
    if let Err(e) = skilly::server::run(data, open) {
        eprintln!("Skilly: {e}");
        std::process::exit(1);
    }
}
