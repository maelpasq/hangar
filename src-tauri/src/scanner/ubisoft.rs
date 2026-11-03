//! Ubisoft Connect : registre `Ubisoft\Launcher\Installs\<id>\InstallDir`.

use crate::model::Game;

#[cfg(windows)]
pub fn detect() -> Vec<Game> {
    use super::exe::best_exe;
    use super::registry::{reg_str, subkeys, val, HKLM};
    use crate::model::uri;
    use std::path::Path;

    let mut out = vec![];
    for (id, k) in subkeys(HKLM, r"SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs") {
        let Some(dir) = val(&k, "InstallDir") else { continue };
        let dir = dir.replace('/', "\\");
        if !Path::new(&dir).exists() {
            continue;
        }
        let name = reg_str(
            HKLM,
            &format!(r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Uplay Install {id}"),
            "DisplayName",
        )
        .unwrap_or_else(|| Path::new(&dir).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or(id.clone()));
        let exe = best_exe(Path::new(&dir), &name).map(|p| p.to_string_lossy().into_owned());
        let mut g = Game::new(format!("ubisoft:{id}"), name, "ubisoft", uri(format!("uplay://launch/{id}/0")));
        g.install_dir = Some(dir.trim_end_matches('\\').to_string());
        g.exe_path = exe;
        out.push(g);
    }
    out
}

#[cfg(not(windows))]
pub fn detect() -> Vec<Game> {
    vec![]
}
