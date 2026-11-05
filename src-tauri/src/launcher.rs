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

/// macOS : un binaire est lancé directement, le reste (URI, `.app`, dossier) passe par `open`.
/// Compilé partout pour être vérifié par `cargo clippy` sous Windows.
#[cfg_attr(windows, allow(dead_code))]
fn unix_open(target: &str, args: &str, cwd: Option<&str>) -> Result<(), String> {
    use std::process::Command;
    // shortcut: arguments découpés aux espaces (pas de guillemets), suffisant pour Riot et les jeux locaux.
    let args: Vec<&str> = args.split_whitespace().collect();
    if Path::new(target).is_file() {
        let mut c = Command::new(target);
        c.args(&args);
        if let Some(d) = cwd.filter(|d| Path::new(d).is_dir()) {
            c.current_dir(d);
        }
        return c.spawn().map(|_| ()).map_err(|e| format!("Impossible de lancer le jeu : {e}"));
    }
    let mut c = Command::new("open");
    c.arg(target);
    if !args.is_empty() {
        c.arg("--args").args(&args);
    }
    match c.status() {
        Ok(s) if s.success() => Ok(()),
        Ok(_) => Err("Aucune application n'est associée à ce lien : le launcher du jeu est-il installé ?".into()),
        Err(e) => Err(format!("Impossible de lancer le jeu : {e}")),
    }
}

/// Lance un jeu selon sa description de lancement.
pub fn launch(l: &Launch) -> Result<(), String> {
    if l.target.trim().is_empty() {
        return Err("Ce jeu n'a pas de cible de lancement.".into());
    }
    if l.kind == "exe" && !Path::new(&l.target).exists() {
        return Err(format!("Exécutable introuvable : {}", l.target));
    }
    shell_open(&l.target, &l.args, l.cwd.as_deref(), "open")
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
        "steam" if digits => Ok((format!("steam://uninstall/{id}"), format!("Steam s'ouvre pour désinstaller {name}."))),
        "gog" if digits && g.launcher_name == "GOG Galaxy" => Ok((
            format!("goggalaxy://openGameView/{id}"),
            format!("Désinstalle {name} depuis sa page dans GOG Galaxy (menu Gérer)."),
        )),
        "epic" => Ok(("com.epicgames.launcher://".into(), format!("Désinstalle {name} depuis la bibliothèque d'Epic Games."))),
        _ if cfg!(target_os = "macos") => {
            // Une app macOS se désinstalle en la mettant à la corbeille : on ouvre son dossier.
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

pub fn uninstall(g: &crate::model::Game) -> Result<String, String> {
    let (target, msg) = uninstall_target(g)?;
    shell_open(&target, "", None, "open")?;
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
