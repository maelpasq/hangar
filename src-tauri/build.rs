fn main() {
    // Sans cette ligne, régénérer les icônes (npm run brand) ne relance pas ce script :
    // l'exe garderait l'ancienne icône embarquée dans resource.lib.
    println!("cargo:rerun-if-changed=icons");
    // Jeux web qui ont une jaquette (Discord Rich Presence l'affiche depuis le dépôt GitHub).
    println!("cargo:rerun-if-changed=../src/assets/web-games");
    let mut ids: Vec<String> = std::fs::read_dir("../src/assets/web-games")
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| e.file_name().to_str()?.strip_suffix(".webp").map(String::from))
        .collect();
    ids.sort();
    let out = std::path::Path::new(&std::env::var("OUT_DIR").unwrap()).join("web_covers.rs");
    std::fs::write(out, format!("const WEB_COVERS: &[&str] = &{ids:?};")).unwrap();
    tauri_build::build()
}
