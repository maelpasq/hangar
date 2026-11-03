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
pub fn shell_open(target: &str, args: &str, _cwd: Option<&str>, _verb: &str) -> Result<(), String> {
    log::info!("[hors Windows] lancement simulé : {target} {args}");
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

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
