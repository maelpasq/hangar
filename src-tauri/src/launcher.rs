//! Lancement via ShellExecuteW (URI, shell:AppsFolder, exe avec arguments et dossier de travail).
//! Jamais `cmd /c start` : le `&` des URI Epic casse.

use crate::model::Launch;
use std::path::Path;

/// Empêche l'ouverture d'une fenêtre console pour les processus enfants.
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Traduit un code de retour ShellExecute (<= 32) en message français.
pub fn shell_error(code: isize, target: &str) -> String {
    match code {
        0 | 8 => "Mémoire insuffisante pour lancer le jeu.".into(),
        2 => format!("Fichier introuvable : {target}"),
        3 => format!("Dossier introuvable : {target}"),
        5 => "Accès refusé par Windows. Essaie de lancer le jeu depuis son launcher.".into(),
        11 => "L'exécutable du jeu est invalide ou corrompu.".into(),
        26 | 32 => "Fichier en cours d'utilisation, réessaie dans un instant.".into(),
        27 | 31 => "Aucune application n'est associée à ce lien : le launcher du jeu est-il installé ?".into(),
        28..=30 => "Windows n'a pas répondu à temps, réessaie.".into(),
        _ => format!("Impossible de lancer le jeu (code {code})."),
    }
}

#[cfg(windows)]
pub fn shell_open(target: &str, args: &str, cwd: Option<&str>, verb: &str) -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    fn w(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }
    let (t, a, v) = (w(target), w(args), w(verb));
    let c = cwd.filter(|c| Path::new(c).is_dir()).map(w);
    // SAFETY : chaînes UTF-16 terminées par zéro, vivantes pendant tout l'appel.
    let r = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            v.as_ptr(),
            t.as_ptr(),
            if args.is_empty() { std::ptr::null() } else { a.as_ptr() },
            c.as_ref().map(|c| c.as_ptr()).unwrap_or(std::ptr::null()),
            SW_SHOWNORMAL,
        )
    };
    let code = r as isize;
    if code > 32 {
        Ok(())
    } else {
        Err(shell_error(code, target))
    }
}

#[cfg(not(windows))]
pub fn shell_open(target: &str, args: &str, cwd: Option<&str>, _verb: &str) -> Result<(), String> {
    unix_open(target, args, cwd)
}

/// macOS et Linux : un binaire est lancé directement, le reste (URI, `.app`, dossier) passe par
/// `open` (macOS) ou `xdg-open` (Linux).
/// Compilé partout pour être vérifié par `cargo clippy` sous Windows.
#[cfg_attr(windows, allow(dead_code))]
fn unix_open(target: &str, args: &str, cwd: Option<&str>) -> Result<(), String> {
    use std::process::Command;
    // shortcut: arguments découpés aux espaces (pas de guillemets), suffisant pour Riot et les jeux locaux.
    let args: Vec<&str> = args.split_whitespace().collect();
    if Path::new(target).is_file() {
        let ext = Path::new(target).extension().map(|x| x.to_string_lossy().to_lowercase()).unwrap_or_default();
        // Linux : un jeu Windows passe par Wine, un raccourci par `gio launch`, un script par sh
        // (le bit exécutable manque souvent après une copie).
        let mut c = match ext.as_str() {
            "exe" if cfg!(target_os = "linux") => Command::new("wine"),
            "desktop" if cfg!(target_os = "linux") => {
                let mut c = Command::new("gio");
                c.arg("launch");
                c
            }
            "sh" if cfg!(target_os = "linux") => Command::new("sh"),
            _ => Command::new(target),
        };
        if c.get_program() != target {
            c.arg(target);
        }
        c.args(&args);
        if let Some(d) = cwd.filter(|d| Path::new(d).is_dir()) {
            c.current_dir(d);
        }
        return c.spawn().map(|_| ()).map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound if c.get_program() == "wine" => {
                "Ce jeu Windows a besoin de Wine : installe-le (sudo pacman -S wine) puis relance-le.".into()
            }
            _ => format!("Impossible de lancer le jeu : {e}"),
        });
    }
    let mac = cfg!(target_os = "macos");
    let mut c = Command::new(if mac { "open" } else { "xdg-open" });
    c.arg(target);
    // xdg-open n'accepte qu'une cible : les arguments ne passent que sous macOS.
    if mac && !args.is_empty() {
        c.arg("--args").args(&args);
    }
    match c.status() {
        Ok(s) if s.success() => Ok(()),
        Ok(_) => Err("Aucune application n'est associée à ce lien : le launcher du jeu est-il installé ?".into()),
        Err(e) => Err(format!("Impossible de lancer le jeu : {e}")),
    }
}

/// Ouvre une cible. Un lien `steam://` passe par `steam.exe -silent` (comme le protocole de
/// Windows, `-- "lien"`) : Steam démarre dans la zone de notification sans ouvrir sa fenêtre.
fn open(target: &str, args: &str, cwd: Option<&str>) -> Result<(), String> {
    #[cfg(windows)]
    if target.starts_with("steam://") && args.is_empty() {
        if let Some(steam) = crate::scanner::steam::steam_root().map(|r| r.join("steam.exe")) {
            return shell_open(&steam.to_string_lossy(), &format!("-silent -- \"{target}\""), None, "open");
        }
    }
    shell_open(target, args, cwd, "open")
}

/// Lance un jeu selon sa description de lancement.
pub fn launch(l: &Launch) -> Result<(), String> {
    if l.target.trim().is_empty() {
        return Err("Ce jeu n'a pas de cible de lancement.".into());
    }
    if l.kind == "exe" && !Path::new(&l.target).exists() {
        return Err(format!("Exécutable introuvable : {}", l.target));
    }
    open(&l.target, &l.args, l.cwd.as_deref())
}

pub fn open_folder(path: &str) -> Result<(), String> {
    if !Path::new(path).is_dir() {
        return Err("Dossier introuvable.".into());
    }
    shell_open(path, "", None, "explore")
}

/// Où se désinstalle un jeu : (cible à ouvrir, message pour l'utilisateur).
/// Steam a un lien direct ; GOG Galaxy ouvre la page du jeu ; Epic ouvre son launcher ;
/// les autres jeux Windows sont dans Paramètres > Applications installées.
pub fn uninstall_target(g: &crate::model::Game) -> Result<(String, String), String> {
    let name = &g.name;
    let id = g.id.split_once(':').map(|(_, x)| x).unwrap_or("");
    let digits = !id.is_empty() && id.chars().all(|c| c.is_ascii_digit());
    match g.store.as_str() {
        "steam" if digits => Ok((format!("steam://uninstall/{id}"), format!("Confirme la désinstallation de {name} dans la fenêtre de Steam."))),
        "gog" if digits && g.launcher_name == "GOG Galaxy" => Ok((
            format!("goggalaxy://openGameView/{id}"),
            format!("Désinstalle {name} depuis sa page dans GOG Galaxy (menu Gérer)."),
        )),
        "epic" => Ok(("com.epicgames.launcher://".into(), format!("Désinstalle {name} depuis la bibliothèque d'Epic Games."))),
        _ if !cfg!(windows) => {
            // macOS et Linux : le jeu se désinstalle en le mettant à la corbeille : on ouvre son dossier.
            let app = g.install_dir.as_deref().unwrap_or(&g.launch.target);
            let dir = Path::new(app).parent().filter(|d| d.is_dir()).ok_or("Dossier du jeu introuvable.")?;
            Ok((dir.to_string_lossy().into_owned(), format!("Mets {name} à la corbeille depuis ce dossier.")))
        }
        _ => Ok((
            "ms-settings:appsfeatures".into(),
            format!("Désinstalle {name} depuis les Applications installées de Windows."),
        )),
    }
}

/// Où se met à jour un jeu : (cible à ouvrir, message). La cible réveille le launcher, que le
/// voile (`veil`) garde invisible : il télécharge la mise à jour en arrière-plan.
/// Les launchers sans page de mises à jour (Ubisoft, EA, Battle.net, Riot) mettent leurs jeux
/// à jour au lancement : on le dit.
pub fn update_target(g: &crate::model::Game) -> Result<(String, String), String> {
    let name = &g.name;
    let id = g.id.split_once(':').map(|(_, x)| x).unwrap_or("");
    let digits = !id.is_empty() && id.chars().all(|c| c.is_ascii_digit());
    match g.store.as_str() {
        "steam" => Ok((
            "steam://open/downloads".into(),
            if g.update_pending {
                format!("Steam met {name} à jour en arrière-plan.")
            } else {
                format!("{name} est à jour.")
            },
        )),
        "gog" if digits && g.launcher_name == "GOG Galaxy" => Ok((
            format!("goggalaxy://openGameView/{id}"),
            format!("GOG Galaxy met {name} à jour en arrière-plan."),
        )),
        "epic" => Ok((
            "com.epicgames.launcher://".into(),
            format!("Epic Games met {name} à jour en arrière-plan."),
        )),
        "xbox" if cfg!(windows) => Ok((
            "ms-windows-store://downloadsandupdates".into(),
            format!("Le Microsoft Store met {name} à jour en arrière-plan."),
        )),
        "ubisoft" | "ea" | "battlenet" | "riot" => {
            Err(format!("{} met {name} à jour au lancement : lance le jeu depuis Hangar.", g.launcher_name))
        }
        _ => Err(format!("{name} n'a pas de launcher : ses mises à jour se font hors de Hangar.")),
    }
}

pub fn update(g: &crate::model::Game) -> Result<String, String> {
    let (target, msg) = update_target(g)?;
    open(&target, "", None)?;
    Ok(msg)
}

/// Désinstalleur officiel d'un jeu GOG (Inno Setup), qui sait travailler sans fenêtre.
fn silent_uninstaller(g: &crate::model::Game) -> Option<String> {
    let exe = Path::new(g.install_dir.as_deref()?).join("unins000.exe");
    (g.store == "gog" && exe.is_file()).then(|| exe.to_string_lossy().into_owned())
}

/// `others` : dossiers des autres jeux connus, que la suppression ne doit jamais emporter.
pub fn uninstall(g: &crate::model::Game, others: &[std::path::PathBuf]) -> Result<String, String> {
    if cfg!(windows) {
        match g.store.as_str() {
            "steam" => return crate::manage::steam_uninstall(g, others),
            "epic" => return crate::manage::epic_uninstall(g, others),
            _ => {}
        }
    }
    if let Some(exe) = silent_uninstaller(g) {
        shell_open(&exe, "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART", None, "open")?;
        return Ok(format!("Désinstallation de {} en cours…", g.name));
    }
    let (target, msg) = uninstall_target(g)?;
    open(&target, "", None)?;
    Ok(msg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desinstallation_par_store() {
        use crate::model::{uri, Game};
        let s = Game::new("steam:620".into(), "Portal 2".into(), "steam", uri("steam://rungameid/620"));
        assert_eq!(uninstall_target(&s).unwrap().0, "steam://uninstall/620");
        let mut bad = s.clone();
        bad.id = "steam:620/../x".into();
        assert_ne!(uninstall_target(&bad).map(|t| t.0).unwrap_or_default(), "steam://uninstall/620/../x");
        let e = Game::new("epic:fn".into(), "Fortnite".into(), "epic", uri("x"));
        assert!(uninstall_target(&e).unwrap().0.starts_with("com.epicgames.launcher://"));
        if cfg!(windows) {
            let u = Game::new("ubisoft:1".into(), "AC".into(), "ubisoft", uri("uplay://launch/1/0"));
            assert_eq!(uninstall_target(&u).unwrap().0, "ms-settings:appsfeatures");
        }
    }

    #[test]
    fn desinstalleur_gog_silencieux() {
        use crate::model::{uri, Game};
        let dir = tempfile::tempdir().unwrap();
        let mut g = Game::new("gog:1".into(), "Jeu".into(), "gog", uri("x"));
        g.install_dir = Some(dir.path().to_string_lossy().into_owned());
        assert!(silent_uninstaller(&g).is_none(), "pas de désinstalleur");
        std::fs::write(dir.path().join("unins000.exe"), b"").unwrap();
        assert!(silent_uninstaller(&g).unwrap().ends_with("unins000.exe"));
        g.store = "local".into();
        assert!(silent_uninstaller(&g).is_none(), "seulement GOG");
    }

    #[test]
    fn mise_a_jour_par_store() {
        use crate::model::{uri, Game};
        let mut s = Game::new("steam:620".into(), "Portal 2".into(), "steam", uri("steam://rungameid/620"));
        s.update_pending = true;
        assert_eq!(update_target(&s).unwrap().0, "steam://open/downloads");
        let mut g = Game::new("gog:1207".into(), "Witcher".into(), "gog", uri("x"));
        g.launcher_name = "GOG Galaxy".into();
        assert_eq!(update_target(&g).unwrap().0, "goggalaxy://openGameView/1207");
        g.launcher_name = "l'exécutable du jeu".into();
        assert!(update_target(&g).is_err(), "GOG sans Galaxy");
        let u = Game::new("ubisoft:1".into(), "AC".into(), "ubisoft", uri("uplay://launch/1/0"));
        assert!(update_target(&u).unwrap_err().contains("Ubisoft Connect"));
        let l = Game::new("local:x".into(), "Jeu".into(), "local", uri("x"));
        assert!(update_target(&l).unwrap_err().contains("hors de Hangar"));
    }

    #[test]
    fn messages_francais() {
        assert!(shell_error(2, "x.exe").contains("introuvable"));
        assert!(shell_error(31, "uplay://").contains("launcher"));
        assert!(shell_error(99, "x").contains("code 99"));
    }

    #[test]
    fn exe_absent() {
        let l = Launch { kind: "exe".into(), target: r"Z:\absent\jeu.exe".into(), args: String::new(), cwd: None };
        assert!(launch(&l).unwrap_err().contains("introuvable"));
    }
}
