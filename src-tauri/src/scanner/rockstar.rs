//! Rockstar Games Launcher : clés de désinstallation dont `UninstallString` contient
//! `-uninstall=<titre>` (éditeur Rockstar Games). Le jeu se lance via
//! `Launcher.exe -launchTitleInFolder "<dossier du jeu>"`.

use crate::model::Game;

/// Identifiant de titre Rockstar (`gta5_gen9`, `rdr2`...) tiré de `-uninstall=<id>`.
pub fn title_id(uninstall: &str) -> Option<String> {
    let id = uninstall.split("-uninstall=").nth(1)?.split_whitespace().next()?.trim_matches('"').to_lowercase();
    // Passé en identifiant interne : rien d'autre que [a-z0-9_-].
    let safe = !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    safe.then_some(id)
}

/// `Launcher.exe` du Rockstar Games Launcher, s'il est installé.
#[cfg(windows)]
pub fn launcher_exe() -> Option<std::path::PathBuf> {
    use super::registry::{reg_str, uninstall_entries, val, HKLM};
    use std::path::PathBuf;

    let from_uninstall = uninstall_entries().into_iter().find_map(|k| {
        let launcher = val(&k, "UninstallString").and_then(|u| title_id(&u)).as_deref() == Some("launcher");
        launcher.then(|| val(&k, "InstallLocation")).flatten()
    });
    let from_key = || reg_str(HKLM, r"SOFTWARE\WOW6432Node\Rockstar Games\Launcher", "InstallFolder");
    let default = || {
        let pf = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".into());
        Some(format!(r"{pf}\Rockstar Games\Launcher"))
    };
    [from_uninstall, from_key(), default()]
        .into_iter()
        .flatten()
        .map(|d| PathBuf::from(d.trim_matches('"')).join("Launcher.exe"))
        .find(|p| p.is_file())
}

#[cfg(not(windows))]
pub fn launcher_exe() -> Option<std::path::PathBuf> {
    None
}

#[cfg(windows)]
pub fn detect() -> Vec<Game> {
    use super::registry::{uninstall_entries, val};
    use crate::model::Launch;
    use std::path::Path;

    let Some(launcher) = launcher_exe() else {
        log::info!("Rockstar : launcher non installé");
        return vec![];
    };
    let mut out = vec![];
    for k in uninstall_entries() {
        let rockstar = val(&k, "Publisher").map(|p| p.to_lowercase().contains("rockstar")).unwrap_or(false);
        let Some(id) = val(&k, "UninstallString").and_then(|u| title_id(&u)) else { continue };
        if !rockstar || id == "launcher" {
            continue;
        }
        let Some(name) = val(&k, "DisplayName") else { continue };
        let Some(dir) = val(&k, "InstallLocation") else { continue };
        let dir = dir.replace('/', "\\").trim_end_matches('\\').to_string();
        if !Path::new(&dir).is_dir() {
            continue;
        }
        let launch = Launch {
            kind: "exe".into(),
            target: launcher.to_string_lossy().into_owned(),
            args: format!("-launchTitleInFolder \"{dir}\""),
            cwd: None,
        };
        let mut g = Game::new(format!("rockstar:{id}"), name.clone(), "rockstar", launch);
        g.exe_path = val(&k, "DisplayIcon")
            .map(|s| s.split(',').next().unwrap_or("").trim_matches('"').to_string())
            .filter(|s| s.to_lowercase().ends_with(".exe") && Path::new(s).is_file())
            .or_else(|| super::exe::best_exe(Path::new(&dir), &name).map(|p| p.to_string_lossy().into_owned()));
        g.install_dir = Some(dir);
        out.push(g);
    }
    out
}

#[cfg(not(windows))]
pub fn detect() -> Vec<Game> {
    vec![]
}

/// Nom d'un titre Rockstar (identifiants du launcher). `None` : titre inconnu, pas affiché.
pub fn title_name(id: &str) -> Option<&'static str> {
    Some(match id {
        "gta5" => "Grand Theft Auto V Legacy",
        "gta5_gen9" => "Grand Theft Auto V Enhanced",
        "rdr2" => "Red Dead Redemption 2",
        "rdr" => "Red Dead Redemption",
        "gta4" => "Grand Theft Auto IV: The Complete Edition",
        "gta3" => "Grand Theft Auto III",
        "gtavc" => "Grand Theft Auto: Vice City",
        "gtasa" => "Grand Theft Auto: San Andreas",
        "gta3unreal" => "Grand Theft Auto III - The Definitive Edition",
        "gtavcunreal" => "Grand Theft Auto: Vice City - The Definitive Edition",
        "gtasaunreal" => "Grand Theft Auto: San Andreas - The Definitive Edition",
        "mp3" => "Max Payne 3",
        "lanoire" => "L.A. Noire",
        "lanoirevr" => "L.A. Noire: The VR Case Files",
        "bully" => "Bully: Scholarship Edition",
        _ => return None,
    })
}

/// Titre d'un fichier `buildcollection_<titre>_<n>.xml`, que le launcher écrit dans le dossier
/// du profil connecté pour chaque jeu du compte.
pub fn collection_title(file: &str) -> Option<String> {
    let rest = file.to_lowercase().strip_prefix("buildcollection_")?.strip_suffix(".xml")?.to_string();
    let (id, n) = rest.rsplit_once('_')?;
    (!n.is_empty() && n.chars().all(|c| c.is_ascii_digit())).then(|| id.to_string())
}

/// Jeux Rockstar du compte connecté au launcher (fichiers `buildcollection` de ses profils) :
/// ceux qui manquent s'installent depuis le Rockstar Games Launcher.
pub fn owned() -> Vec<Game> {
    use crate::model::Launch;
    let Some(launcher) = launcher_exe() else { return vec![] };
    let base = std::path::PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default()).join("Rockstar Games").join("Launcher");
    let Ok(rd) = std::fs::read_dir(&base) else { return vec![] };
    let mut ids: Vec<String> = rd
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| std::fs::read_dir(e.path()).ok())
        .flat_map(|d| d.flatten().filter_map(|f| collection_title(&f.file_name().to_string_lossy())))
        .collect();
    ids.sort();
    ids.dedup();
    ids.into_iter()
        .filter_map(|id| {
            let Some(name) = title_name(&id) else {
                log::info!("Rockstar : titre inconnu {id}");
                return None;
            };
            let launch = Launch { kind: "exe".into(), target: launcher.to_string_lossy().into_owned(), args: String::new(), cwd: None };
            let mut g = Game::new(format!("rockstar:{id}"), name.into(), "rockstar", launch);
            g.not_installed = true;
            Some(g)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifiants_de_titre() {
        let u = r#""D:\Jeux\Rockstar Games\Grand Theft Auto V Enhanced\uninstall.exe" -enableFullMode -uninstall=gta5_gen9"#;
        assert_eq!(title_id(u).as_deref(), Some("gta5_gen9"));
        assert_eq!(title_id(r#""C:\RGL\uninstall.exe" -uninstall=launcher -enableFullMode"#).as_deref(), Some("launcher"));
        assert_eq!(title_id(r"C:\Social Club\uninstallRGSCRedistributable.exe"), None);
        assert_eq!(title_id("uninstall.exe -uninstall=a&b"), None);
        assert_eq!(title_id("uninstall.exe -uninstall="), None);
    }

    #[test]
    fn jeux_du_compte() {
        assert_eq!(collection_title("buildcollection_gta5_gen9_107.xml").as_deref(), Some("gta5_gen9"));
        assert_eq!(collection_title("buildcollection_gta5_49.xml").as_deref(), Some("gta5"));
        assert_eq!(collection_title("manifest_gta5_1175.xml"), None);
        assert_eq!(collection_title("buildcollection_rdr2.xml"), None);
        assert_eq!(title_name("gta5"), Some("Grand Theft Auto V Legacy"));
        assert_eq!(title_name("inconnu"), None);
    }
}
