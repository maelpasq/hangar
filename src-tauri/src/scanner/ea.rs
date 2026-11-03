//! EA app : clés de désinstallation dont le dossier contient `__Installer\installerdata.xml`
//! ou dont l'éditeur est Electronic Arts. Lancement par l'exe du jeu (il ouvre l'EA app).

use crate::model::Game;

#[cfg(windows)]
pub fn detect() -> Vec<Game> {
    use super::exe::best_exe;
    use super::norm;
    use super::registry::{uninstall_entries, val};
    use crate::model::exe;
    use std::path::Path;

    let mut out = vec![];
    for k in uninstall_entries() {
        let Some(name) = val(&k, "DisplayName") else { continue };
        let Some(loc) = val(&k, "InstallLocation") else { continue };
        let loc = loc.trim_end_matches('\\').to_string();
        if !Path::new(&loc).is_dir() {
            continue;
        }
        let uninst = val(&k, "UninstallString").unwrap_or_default();
        if uninst.contains("Battle.net") {
            continue; // géré par battlenet.rs
        }
        let publisher = val(&k, "Publisher").unwrap_or_default();
        let lname = name.to_lowercase();
        let is_ea = Path::new(&loc).join("__Installer").join("installerdata.xml").exists()
            || (publisher.contains("Electronic Arts") && !lname.starts_with("ea app"));
        if !is_ea || lname.contains("ea app") || lname.contains("origin") {
            continue;
        }
        let Some(x) = best_exe(Path::new(&loc), &name) else { continue };
        let mut g = Game::new(format!("ea:{}", norm(&name)), name, "ea", exe(&x, ""));
        g.install_dir = Some(loc);
        g.exe_path = Some(x.to_string_lossy().into_owned());
        out.push(g);
    }
    out
}

#[cfg(not(windows))]
pub fn detect() -> Vec<Game> {
    vec![]
}
