// Embarque l'installeur NSIS produit par `npm run build` (ou celui indiqué par HANGAR_NSIS).
use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-changed=../package.json");
    println!("cargo:rerun-if-env-changed=HANGAR_NSIS");
    let nsis = match std::env::var("HANGAR_NSIS") {
        Ok(p) => PathBuf::from(p),
        Err(_) => {
            let pkg = std::fs::read_to_string("../package.json").expect("package.json introuvable");
            let version = pkg
                .split("\"version\"")
                .nth(1)
                .and_then(|s| s.split('"').nth(1))
                .expect("version absente de package.json");
            PathBuf::from(format!(
                "../src-tauri/target/release/bundle/nsis/Hangar_{version}_x64-setup.exe"
            ))
        }
    };
    let nsis = std::fs::canonicalize(&nsis).unwrap_or_else(|_| {
        panic!(
            "Installeur NSIS introuvable : {}. Lance d'abord `npm run build`.",
            nsis.display()
        )
    });
    println!("cargo:rerun-if-changed={}", nsis.display());
    println!("cargo:rustc-env=HANGAR_NSIS={}", nsis.display());
    // La config versionnée s'appelle setup.conf.json : tauri-action prend le premier
    // tauri.conf.json du dépôt et confondrait l'installeur avec l'app (release sans artefacts).
    println!("cargo:rerun-if-changed=setup.conf.json");
    std::fs::copy("setup.conf.json", "tauri.conf.json").expect("copie de setup.conf.json");
    tauri_build::build();
}
