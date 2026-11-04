fn main() {
    // Sans cette ligne, régénérer les icônes (npm run brand) ne relance pas ce script :
    // l'exe garderait l'ancienne icône embarquée dans resource.lib.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
