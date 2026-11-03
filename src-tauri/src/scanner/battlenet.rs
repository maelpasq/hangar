//! Battle.net : clés de désinstallation dont `UninstallString` contient `Battle.net` et `--uid=`.

use crate::model::Game;

/// Table uid (préfixe) vers code produit Battle.net.
pub fn product_code(uid: &str) -> Option<&'static str> {
    let u = uid.to_lowercase();
    let map: &[(&str, &str)] = &[
        ("wow_classic", "WoWC"), ("wow", "WoW"), ("prometheus", "Pro"), ("hs_beta", "WTCG"),
        ("diablo3", "D3"), ("fenris", "Fen"), ("osi", "OSI"), ("s2", "S2"), ("s1", "S1"),
        ("heroes", "Hero"), ("w3", "W3"), ("viper", "VIPR"), ("odin", "ODIN"), ("lazarus", "LAZR"),
        ("zeus", "ZEUS"), ("fore", "FORE"), ("auks", "AUKS"), ("rtro", "RTRO"), ("wlby", "WLBY"),
        ("anbs", "ANBS"), ("gryphon", "GRY"), ("spot", "SPOT"),
    ];
    map.iter().find(|(p, _)| u.starts_with(p)).map(|(_, c)| *c)
}

#[cfg(windows)]
pub fn detect() -> Vec<Game> {
    use super::registry::{uninstall_entries, val};
    use crate::model::{uri, Launch};
    use std::path::{Path, PathBuf};

    let entries = uninstall_entries();
    let bnet_exe = entries
        .iter()
        .find(|k| val(k, "DisplayName").as_deref() == Some("Battle.net"))
        .and_then(|k| val(k, "InstallLocation"))
        .map(|d| Path::new(&d).join("Battle.net.exe"))
        .filter(|p| p.exists())
        .or_else(|| {
            let p = PathBuf::from(r"C:\Program Files (x86)\Battle.net\Battle.net.exe");
            p.exists().then_some(p)
        });

    let mut out = vec![];
    for k in &entries {
        let Some(name) = val(k, "DisplayName") else { continue };
        let Some(loc) = val(k, "InstallLocation") else { continue };
        let loc = loc.trim_end_matches('\\').to_string();
        if !Path::new(&loc).is_dir() {
            continue;
        }
        let uninst = val(k, "UninstallString").unwrap_or_default();
        if !(uninst.contains("Battle.net") && uninst.contains("--uid=")) || name == "Battle.net" {
            continue;
        }
        let uid = uninst.split("--uid=").nth(1).unwrap_or("").split_whitespace().next().unwrap_or("");
        let Some(code) = product_code(uid) else {
            log::info!("Battle.net : uid inconnu {uid}");
            continue;
        };
        let launch = match &bnet_exe {
            Some(b) => Launch {
                kind: "exe".into(),
                target: b.to_string_lossy().into_owned(),
                args: format!("--exec=\"launch {code}\""),
                cwd: None,
            },
            None => uri(format!("battlenet://{code}")),
        };
        let mut g = Game::new(format!("battlenet:{code}"), name, "battlenet", launch);
        g.exe_path = val(k, "DisplayIcon")
            .map(|s| s.split(',').next().unwrap_or("").trim_matches('"').to_string())
            .filter(|s| s.to_lowercase().ends_with(".exe"));
        g.install_dir = Some(loc);
        out.push(g);
    }
    out
}

#[cfg(not(windows))]
pub fn detect() -> Vec<Game> {
    vec![]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_produit() {
        assert_eq!(product_code("prometheus"), Some("Pro"));
        assert_eq!(product_code("wow_classic_era"), Some("WoWC"));
        assert_eq!(product_code("wow"), Some("WoW"));
        assert_eq!(product_code("fenris"), Some("Fen"));
        assert_eq!(product_code("inconnu"), None);
    }
}
