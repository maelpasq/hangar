//! macOS : applications de la catégorie Jeux (`LSApplicationCategoryType` de `Info.plist`)
//! dans `/Applications` et un niveau de sous-dossiers (`/Applications/World of Warcraft/...`).
//! Les jeux GOG (offline ou Galaxy) sont reconnus à leur `goggame-<id>.info`.
//! Compilé partout (tests sous Windows), appelé seulement hors Windows.
#![cfg_attr(windows, allow(dead_code))]

use crate::model::{default_launcher, exe, Game};
use std::fs;
use std::path::Path;

/// Launchers rangés eux aussi dans la catégorie Jeux : ce ne sont pas des jeux.
const LAUNCHERS: &[&str] = &[
    "steam", "epic games launcher", "battle.net", "riot client", "gog galaxy", "ubisoft connect", "ea app",
];

/// Lit le `Info.plist` d'un paquet `.app` et renvoie un jeu si c'en est un.
pub fn parse_app(app: &Path) -> Option<Game> {
    let info = plist::Value::from_file(app.join("Contents").join("Info.plist")).ok()?;
    let d = info.as_dictionary()?;
    let s = |k: &str| d.get(k).and_then(|v| v.as_string()).filter(|v| !v.trim().is_empty());
    // public.app-category.games et ses sous-catégories (public.app-category.action-games...)
    if !s("LSApplicationCategoryType")?.ends_with("games") {
        return None;
    }
    let stem = app.file_stem()?.to_string_lossy().into_owned();
    let name = s("CFBundleDisplayName").or(s("CFBundleName")).map(str::to_string).unwrap_or(stem);
    if LAUNCHERS.contains(&name.to_lowercase().as_str()) {
        return None;
    }
    let path = app.to_string_lossy().into_owned();
    let gog_id = fs::read_dir(app.join("Contents").join("Resources")).ok().and_then(|rd| {
        rd.flatten().find_map(|e| {
            let f = e.file_name().to_string_lossy().into_owned();
            f.strip_prefix("goggame-")?.strip_suffix(".info").map(str::to_string)
        })
    });
    let mut g = match gog_id {
        Some(id) => {
            let mut g = Game::new(format!("gog:{id}"), name, "gog", exe(app, ""));
            g.launcher_name = default_launcher("local").to_string();
            g
        }
        None => Game::new(format!("local:{}", path.to_lowercase()), name, "local", exe(app, "")),
    };
    if let Some(bin) = s("CFBundleExecutable") {
        g.exe_path = Some(app.join("Contents").join("MacOS").join(bin).to_string_lossy().into_owned());
        g.process_names.push(bin.to_string());
    }
    g.install_dir = Some(path);
    Some(g)
}

fn apps_in(dir: &Path, depth: u32, out: &mut Vec<Game>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if !p.is_dir() {
            continue;
        }
        if p.extension().is_some_and(|x| x.eq_ignore_ascii_case("app")) {
            out.extend(parse_app(&p));
        } else if depth > 0 {
            apps_in(&p, depth - 1, out);
        }
    }
}

/// Détecteur macOS (vide ailleurs).
pub fn detect() -> Vec<Game> {
    let mut out = vec![];
    if cfg!(target_os = "macos") {
        apps_in(Path::new("/Applications"), 1, &mut out);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app(root: &Path, name: &str, plist: &str, gog: Option<&str>) -> std::path::PathBuf {
        let p = root.join(format!("{name}.app"));
        fs::create_dir_all(p.join("Contents/Resources")).unwrap();
        fs::write(p.join("Contents/Info.plist"), format!(
            r#"<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>{plist}</dict></plist>"#
        )).unwrap();
        if let Some(id) = gog {
            fs::write(p.join(format!("Contents/Resources/goggame-{id}.info")), "{}").unwrap();
        }
        p
    }

    const JEU: &str = "<key>LSApplicationCategoryType</key><string>public.app-category.action-games</string>\
        <key>CFBundleName</key><string>Mon Jeu</string><key>CFBundleExecutable</key><string>MonJeu</string>";

    #[test]
    fn jeu_local_et_gog() {
        let t = tempfile::tempdir().unwrap();
        let g = parse_app(&app(t.path(), "MonJeu", JEU, None)).unwrap();
        assert_eq!((g.name.as_str(), g.store.as_str()), ("Mon Jeu", "local"));
        assert_eq!(g.process_names, vec!["MonJeu".to_string()]);
        assert!(g.exe_path.unwrap().ends_with("MonJeu"));
        let g = parse_app(&app(t.path(), "Gog", JEU, Some("1207658924"))).unwrap();
        assert_eq!((g.id.as_str(), g.store.as_str()), ("gog:1207658924", "gog"));
    }

    #[test]
    fn ignore_non_jeux_et_launchers() {
        let t = tempfile::tempdir().unwrap();
        let notes = "<key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>";
        assert!(parse_app(&app(t.path(), "Notes", notes, None)).is_none());
        let steam = "<key>LSApplicationCategoryType</key><string>public.app-category.games</string>";
        assert!(parse_app(&app(t.path(), "Steam", steam, None)).is_none());
        assert!(parse_app(&t.path().join("Absent.app")).is_none());
    }
}
