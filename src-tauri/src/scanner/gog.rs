//! GOG : registre `GOG.com\Games`, lancement via GOG Galaxy s'il est installé.

use crate::model::Game;

#[cfg(windows)]
pub fn detect() -> Vec<Game> {
    use super::registry::{reg_str, subkeys, val, HKLM};
    use crate::model::{default_launcher, Launch};
    use std::path::{Path, PathBuf};

    let galaxy = reg_str(HKLM, r"SOFTWARE\WOW6432Node\GOG.com\GalaxyClient\paths", "client")
        .map(|d| Path::new(&d).join("GalaxyClient.exe"))
        .filter(|p| p.exists());
    let mut out = vec![];
    for (_, k) in subkeys(HKLM, r"SOFTWARE\WOW6432Node\GOG.com\Games") {
        let (Some(id), Some(name), Some(path)) = (val(&k, "gameID"), val(&k, "gameName"), val(&k, "path")) else {
            continue;
        };
        if val(&k, "dependsOn").is_some() || !Path::new(&path).exists() {
            continue; // DLC ou désinstallé
        }
        let game_exe = val(&k, "exe").map(PathBuf::from);
        let (launch, launcher) = if let Some(g) = &galaxy {
            (
                Launch {
                    kind: "exe".into(),
                    target: g.to_string_lossy().into_owned(),
                    args: format!("/command=runGame /gameId={id} /path=\"{path}\""),
                    cwd: None,
                },
                "GOG Galaxy",
            )
        } else if let Some(x) = &game_exe {
            (
                Launch {
                    kind: "exe".into(),
                    target: x.to_string_lossy().into_owned(),
                    args: val(&k, "launchParam").unwrap_or_default(),
                    cwd: val(&k, "workingDir").or_else(|| Some(path.clone())),
                },
                default_launcher("local"),
            )
        } else {
            continue;
        };
        let mut g = Game::new(format!("gog:{id}"), name, "gog", launch);
        g.launcher_name = launcher.to_string();
        g.install_dir = Some(path);
        g.exe_path = game_exe.map(|p| p.to_string_lossy().into_owned());
        out.push(g);
    }
    out
}

#[cfg(not(windows))]
pub fn detect() -> Vec<Game> {
    vec![]
}
