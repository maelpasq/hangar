//! Steam : `libraryfolders.vdf` + `appmanifest_*.acf` de chaque bibliothèque.

use crate::model::{uri, Game};
use std::fs;
use std::path::PathBuf;

/// Valeurs d'une clé dans un fichier VDF (format texte de Valve), insensible à la casse.
pub fn vdf_values(text: &str, key: &str) -> Vec<String> {
    let needle = format!("\"{}\"", key).to_lowercase();
    text.lines()
        .filter_map(|l| {
            let l = l.trim();
            if !l.to_lowercase().starts_with(&needle) {
                return None;
            }
            let rest = l[needle.len()..].trim();
            if !rest.starts_with('"') {
                return None; // ouverture d'un bloc, pas une valeur
            }
            let v = rest.trim_matches('"');
            Some(v.replace("\\\\", "\\"))
        })
        .collect()
}

pub fn steam_root() -> Option<PathBuf> {
    #[cfg(windows)]
    if let Some(p) = super::registry::reg_str(super::registry::HKCU, r"Software\Valve\Steam", "SteamPath") {
        let p = PathBuf::from(p.replace('/', "\\"));
        if p.exists() {
            return Some(p);
        }
    }
    let p = if cfg!(target_os = "macos") {
        super::mac_support().join("Steam")
    } else {
        PathBuf::from(r"C:\Program Files (x86)\Steam")
    };
    p.exists().then_some(p)
}

const STEAM_IGNORED: &[&str] = &[
    "steamworks common", "redistributable", "proton", "steam linux runtime",
    "steamvr", "wallpaper engine", "soundtrack", "dedicated server", "sdk",
];

/// Lit un `appmanifest_*.acf`. `lib` est le dossier `steamapps` qui le contient.
pub fn parse_manifest(text: &str, lib: &std::path::Path) -> Option<Game> {
    let appid: u32 = vdf_values(text, "appid").first()?.parse().ok()?;
    let name = vdf_values(text, "name").into_iter().next().unwrap_or_default();
    if name.is_empty() || appid == 228980 {
        return None;
    }
    let lname = name.to_lowercase();
    if STEAM_IGNORED.iter().any(|s| lname.contains(s)) {
        return None;
    }
    let dir = vdf_values(text, "installdir").into_iter().next().map(|d| lib.join("common").join(d));
    let mut g = Game::new(format!("steam:{appid}"), name, "steam", uri(format!("steam://rungameid/{appid}")));
    g.install_dir = dir.map(|d| d.to_string_lossy().into_owned());
    g.steam_app_id = Some(appid);
    g.size_bytes = vdf_values(text, "SizeOnDisk").first().and_then(|s| s.parse().ok()).filter(|s: &u64| *s > 0);
    Some(g)
}

pub fn detect() -> Vec<Game> {
    let Some(root) = steam_root() else {
        log::info!("Steam : non installé");
        return vec![];
    };
    let mut libs = vec![root.join("steamapps")];
    match fs::read_to_string(root.join("steamapps").join("libraryfolders.vdf")) {
        Ok(t) => {
            for p in vdf_values(&t, "path") {
                let lib = PathBuf::from(p).join("steamapps");
                if !libs.iter().any(|l| l.to_string_lossy().eq_ignore_ascii_case(&lib.to_string_lossy())) {
                    libs.push(lib);
                }
            }
        }
        Err(e) => log::warn!("Steam : libraryfolders.vdf illisible ({e})"),
    }
    let mut out = vec![];
    for lib in libs {
        let Ok(rd) = fs::read_dir(&lib) else {
            log::warn!("Steam : bibliothèque inaccessible {}", lib.display());
            continue;
        };
        for e in rd.flatten() {
            let fname = e.file_name().to_string_lossy().to_lowercase();
            if !(fname.starts_with("appmanifest_") && fname.ends_with(".acf")) {
                continue;
            }
            let Ok(t) = fs::read_to_string(e.path()) else { continue };
            if let Some(g) = parse_manifest(&t, &lib) {
                out.push(g);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    const LIBRARY: &str = include_str!("../../tests/fixtures/libraryfolders.vdf");
    const MANIFEST: &str = include_str!("../../tests/fixtures/appmanifest_526870.acf");

    #[test]
    fn chemins_des_bibliotheques() {
        assert_eq!(
            vdf_values(LIBRARY, "path"),
            vec![r"C:\Program Files (x86)\Steam".to_string(), r"D:\SteamLibrary".to_string()]
        );
    }

    #[test]
    fn manifeste() {
        let g = parse_manifest(MANIFEST, Path::new(r"D:\SteamLibrary\steamapps")).unwrap();
        assert_eq!(g.id, "steam:526870");
        assert_eq!(g.name, "Satisfactory");
        assert_eq!(g.steam_app_id, Some(526870));
        assert_eq!(g.launch.target, "steam://rungameid/526870");
        assert_eq!(g.launcher_name, "Steam");
        assert!(g.install_dir.unwrap().ends_with("Satisfactory"));
        assert!(g.size_bytes.unwrap_or(0) > 0, "SizeOnDisk du manifeste");
    }

    #[test]
    fn ignore_les_outils() {
        let t = "\"AppState\"\n{\n\t\"appid\"\t\t\"228980\"\n\t\"name\"\t\t\"Steamworks Common Redistributables\"\n}";
        assert!(parse_manifest(t, Path::new("x")).is_none());
        let t = "\"AppState\"\n{\n\t\"appid\"\t\t\"1493710\"\n\t\"name\"\t\t\"Proton Experimental\"\n}";
        assert!(parse_manifest(t, Path::new("x")).is_none());
    }
}
