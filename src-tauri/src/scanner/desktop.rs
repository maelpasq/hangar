//! Linux : raccourcis `.desktop` de la catégorie Game (jeux de la distribution, Heroic, Lutris,
//! Bottles, itch, Flatpak...). Le jeu se lance par son raccourci (`gio launch`).
//! Compilé partout (tests sous Windows), appelé seulement sous Linux.
#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use crate::model::{exe, Game};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

/// Launchers et outils rangés eux aussi dans la catégorie Game : ce ne sont pas des jeux.
const LAUNCHERS: &[&str] = &[
    "steam", "steam (runtime)", "steam native", "heroic games launcher", "heroic", "lutris", "bottles", "itch",
    "hangar", "hangar test", "protonup-qt", "protonplus", "gamehub", "minigalaxy", "playonlinux", "winetricks",
    "legendary", "mangojuice", "goverlay",
];

/// Commandes qui enveloppent le vrai programme : le nom de processus est ailleurs.
const WRAPPERS: &[&str] = &["env", "sh", "bash", "flatpak", "xdg-open", "gio", "gtk-launch", "wine", "umu-run", "gamemoderun"];

/// Lit un `.desktop` et renvoie un jeu si c'en est un.
pub fn parse_entry(text: &str, path: &Path) -> Option<Game> {
    let mut kv: HashMap<&str, &str> = HashMap::new();
    let mut in_entry = false;
    for l in text.lines().map(str::trim) {
        if l.starts_with('[') {
            in_entry = l == "[Desktop Entry]";
        } else if let Some((k, v)) = l.split_once('=').filter(|_| in_entry) {
            kv.entry(k.trim()).or_insert(v.trim());
        }
    }
    let get = |k: &str| kv.get(k).copied().filter(|v| !v.is_empty());
    let yes = |k: &str| get(k).is_some_and(|v| v.eq_ignore_ascii_case("true"));
    if get("Type") != Some("Application") || yes("NoDisplay") || yes("Hidden") {
        return None;
    }
    if !get("Categories")?.split(';').any(|c| c == "Game") {
        return None;
    }
    let exec = get("Exec")?;
    // Raccourci d'un jeu Steam : déjà trouvé par le détecteur Steam.
    if exec.contains("steam://") {
        return None;
    }
    let name = get("Name[fr]").or(get("Name"))?.to_string();
    if LAUNCHERS.contains(&name.to_lowercase().as_str()) {
        return None;
    }
    let p = path.to_string_lossy().into_owned();
    let mut g = Game::new(format!("local:{}", p.to_lowercase()), name, "local", exe(path, ""));
    // Suivi du temps de jeu : le programme lancé, quand le raccourci ne passe pas par un intermédiaire.
    let first = exec.split_whitespace().next().unwrap_or_default().trim_matches('"');
    let bin = Path::new(first).file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_default();
    if !bin.is_empty() && !WRAPPERS.contains(&bin.as_str()) {
        g.process_names.push(bin);
    }
    Some(g)
}

/// Dossiers `applications` du système, du plus prioritaire au moins prioritaire (XDG).
fn dirs() -> Vec<PathBuf> {
    let home = PathBuf::from(std::env::var("HOME").unwrap_or_default());
    let data_home =
        std::env::var("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|_| home.join(".local/share"));
    let data_dirs = std::env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
    let mut out = vec![data_home.join("applications"), data_home.join("flatpak/exports/share/applications")];
    out.extend(data_dirs.split(':').filter(|d| !d.is_empty()).map(|d| Path::new(d).join("applications")));
    out.push(PathBuf::from("/var/lib/flatpak/exports/share/applications"));
    out
}

fn entries_in(dir: &Path, depth: u32, seen: &mut HashSet<String>, out: &mut Vec<Game>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            if depth > 0 {
                entries_in(&p, depth - 1, seen, out);
            }
            continue;
        }
        if !p.extension().is_some_and(|x| x == "desktop") {
            continue;
        }
        // Même nom de fichier : le raccourci de l'utilisateur remplace celui du système (XDG).
        if !seen.insert(e.file_name().to_string_lossy().into_owned()) {
            continue;
        }
        if let Some(g) = fs::read_to_string(&p).ok().and_then(|t| parse_entry(&t, &p)) {
            out.push(g);
        }
    }
}

/// Détecteur Linux (vide ailleurs).
pub fn detect() -> Vec<Game> {
    let mut out = vec![];
    if cfg!(target_os = "linux") {
        let mut seen = HashSet::new();
        for d in dirs() {
            entries_in(&d, 2, &mut seen, &mut out);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(text: &str) -> Option<Game> {
        parse_entry(text, Path::new("/home/u/.local/share/applications/jeu.desktop"))
    }

    #[test]
    fn jeu_de_la_categorie_game() {
        let g = parse(
            "[Desktop Entry]\nType=Application\nName=SuperTuxKart\nName[fr]=SuperTuxKart FR\nExec=/usr/bin/supertuxkart %U\nCategories=Game;ArcadeGame;\n\n[Desktop Action Window]\nName=Autre\nExec=x",
        )
        .unwrap();
        assert_eq!(g.name, "SuperTuxKart FR");
        assert_eq!(g.store, "local");
        assert!(g.launch.target.ends_with("jeu.desktop"));
        assert_eq!(g.process_names, vec!["supertuxkart"]);
    }

    #[test]
    fn raccourcis_ignores() {
        let base = "[Desktop Entry]\nType=Application\nCategories=Game;\n";
        assert!(parse(&format!("{base}Name=Portal 2\nExec=steam steam://rungameid/620")).is_none(), "jeu Steam");
        assert!(parse(&format!("{base}Name=Steam\nExec=/usr/bin/steam %U")).is_none(), "launcher");
        assert!(parse(&format!("{base}Name=Caché\nExec=x\nNoDisplay=true")).is_none());
        assert!(parse("[Desktop Entry]\nType=Application\nName=Gimp\nExec=gimp\nCategories=Graphics;").is_none());
        let heroic = parse(&format!("{base}Name=Hades\nExec=xdg-open heroic://launch/legendary/abc")).unwrap();
        assert!(heroic.process_names.is_empty(), "lancé par un intermédiaire");
    }
}
