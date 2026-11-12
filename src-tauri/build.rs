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
    // Mod Hangar MC : pas embarqué dans l'exe, téléchargé à la demande ; seules ses empreintes le sont.
    println!("cargo:rerun-if-changed=resources/mods");
    let mut mods: Vec<(String, String)> = std::fs::read_dir("resources/mods")
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_str()?.to_string();
            let mc = name.strip_prefix("hangarmc-")?.strip_suffix(".jar")?.to_string();
            Some((mc, sha1_smol::Sha1::from(std::fs::read(e.path()).ok()?).digest().to_string()))
        })
        .collect();
    mods.sort();
    let out = std::path::Path::new(&std::env::var("OUT_DIR").unwrap()).join("mods.rs");
    std::fs::write(out, format!("const MODS: &[(&str, &str)] = &{mods:?};")).unwrap();
    // Commandes de l'app soumises aux permissions : chaque fenêtre n'appelle que celles que sa
    // capacité (`capabilities/*.json`) lui accorde. La liste vient de `generate_handler!` dans
    // main.rs, pour ne jamais en oublier une.
    println!("cargo:rerun-if-changed=src/main.rs");
    let commands: &'static [&'static str] = Box::leak(app_commands().into_boxed_slice());
    // Une commande ajoutée sans permission serait refusée à l'exécution : on l'arrête ici.
    println!("cargo:rerun-if-changed=capabilities");
    let caps: String = ["capabilities/default.json", "capabilities/tray.json"]
        .iter()
        .map(|f| std::fs::read_to_string(f).unwrap_or_default())
        .collect();
    for c in commands {
        let perm = format!("\"allow-{}\"", c.replace('_', "-"));
        assert!(caps.contains(&perm), "commande {c} sans permission : ajoute {perm} dans capabilities/default.json");
    }
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(commands)),
    )
    .expect("tauri-build");
}

/// Noms des commandes de `generate_handler![...]` dans main.rs (`commands::nom`).
fn app_commands() -> Vec<&'static str> {
    let main = std::fs::read_to_string("src/main.rs").expect("src/main.rs");
    let start = main.find("generate_handler![").expect("generate_handler! dans main.rs");
    let block = &main[start..start + main[start..].find(']').expect("fin de generate_handler!")];
    block
        .split("commands::")
        .skip(1)
        .map(|s| &*Box::leak(s.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '_').collect::<String>().into_boxed_str()))
        .collect()
}
