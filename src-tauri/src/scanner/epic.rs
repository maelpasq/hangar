//! Epic Games : `%PROGRAMDATA%\Epic\EpicGamesLauncher\Data\Manifests\*.item` (JSON).

use crate::model::{uri, Game};
use serde::Deserialize;
use std::fs;
use std::path::Path;

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct EpicItem {
    display_name: Option<String>,
    install_location: Option<String>,
    launch_executable: Option<String>,
    catalog_namespace: Option<String>,
    catalog_item_id: Option<String>,
    app_name: Option<String>,
    #[serde(default)]
    app_categories: Vec<String>,
    #[serde(default, rename = "bIsIncompleteInstall")]
    incomplete: bool,
    #[serde(default, rename = "MainGameAppName")]
    main_game_app_name: Option<String>,
    #[serde(default)]
    install_size: Option<u64>,
}

/// Lit un manifeste `.item`. Ignore les installations incomplètes, les DLC et les non-jeux.
pub fn parse_manifest(text: &str) -> Option<Game> {
    let it = serde_json::from_str::<EpicItem>(text).ok()?;
    if it.incomplete {
        return None;
    }
    if !it.app_categories.is_empty() && !it.app_categories.iter().any(|c| c == "games") {
        return None;
    }
    // Les DLC ont un MainGameAppName différent de leur AppName (vide = jeu principal)
    if let (Some(m), Some(a)) = (&it.main_game_app_name, &it.app_name) {
        if !m.is_empty() && m != a {
            return None;
        }
    }
    let (Some(name), Some(ns), Some(cid), Some(app)) =
        (it.display_name, it.catalog_namespace, it.catalog_item_id, it.app_name)
    else {
        return None;
    };
    let exe_path = match (&it.install_location, &it.launch_executable) {
        (Some(l), Some(x)) if !x.is_empty() => Some(Path::new(l).join(x).to_string_lossy().into_owned()),
        _ => None,
    };
    let mut g = Game::new(
        format!("epic:{app}"),
        name,
        "epic",
        uri(format!("com.epicgames.launcher://apps/{ns}%3A{cid}%3A{app}?action=launch&silent=true")),
    );
    g.install_dir = it.install_location;
    g.exe_path = exe_path;
    g.size_bytes = it.install_size.filter(|s| *s > 0);
    Some(g)
}

pub fn detect() -> Vec<Game> {
    let dir = if cfg!(target_os = "macos") {
        super::mac_support().join("Epic/EpicGamesLauncher/Data/Manifests")
    } else {
        super::program_data().join(r"Epic\EpicGamesLauncher\Data\Manifests")
    };
    let Ok(rd) = fs::read_dir(&dir) else {
        log::info!("Epic : pas de manifestes ({})", dir.display());
        return vec![];
    };
    let mut out = vec![];
    for e in rd.flatten() {
        if !e.path().extension().map(|x| x.eq_ignore_ascii_case("item")).unwrap_or(false) {
            continue;
        }
        let Ok(t) = fs::read_to_string(e.path()) else { continue };
        match parse_manifest(&t) {
            Some(g) => out.push(g),
            None => log::debug!("Epic : manifeste ignoré {}", e.path().display()),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const ITEM: &str = r#"{
        "FormatVersion": 0,
        "bIsIncompleteInstall": false,
        "LaunchExecutable": "FortniteGame/Binaries/Win64/FortniteLauncher.exe",
        "DisplayName": "Fortnite",
        "InstallLocation": "C:\\Program Files\\Epic Games\\Fortnite",
        "CatalogNamespace": "fn",
        "CatalogItemId": "4fe75bbc5a674f4f9b356b5c90567da5",
        "AppName": "Fortnite",
        "MainGameAppName": "Fortnite",
        "AppCategories": ["public", "games", "applications"],
        "InstallSize": 32212254720
    }"#;

    #[test]
    fn jeu_complet() {
        let g = parse_manifest(ITEM).unwrap();
        assert_eq!(g.id, "epic:Fortnite");
        assert_eq!(g.name, "Fortnite");
        assert_eq!(
            g.launch.target,
            "com.epicgames.launcher://apps/fn%3A4fe75bbc5a674f4f9b356b5c90567da5%3AFortnite?action=launch&silent=true"
        );
        assert!(g.exe_path.unwrap().ends_with("FortniteLauncher.exe"));
        assert_eq!(g.launcher_name, "Epic Games Launcher");
        assert_eq!(g.size_bytes, Some(32_212_254_720));
    }

    #[test]
    fn main_game_app_name_vide_est_un_jeu() {
        // Cas réel : les manifestes récents laissent MainGameAppName vide.
        let g = parse_manifest(&ITEM.replace("\"MainGameAppName\": \"Fortnite\"", "\"MainGameAppName\": \"\""));
        assert_eq!(g.unwrap().id, "epic:Fortnite");
    }

    #[test]
    fn ignore_dlc_incomplet_et_non_jeux() {
        assert!(parse_manifest(&ITEM.replace("\"MainGameAppName\": \"Fortnite\"", "\"MainGameAppName\": \"Autre\"")).is_none());
        assert!(parse_manifest(&ITEM.replace("\"bIsIncompleteInstall\": false", "\"bIsIncompleteInstall\": true")).is_none());
        assert!(parse_manifest(&ITEM.replace("\"games\", ", "")).is_none());
        assert!(parse_manifest("{ pas du json").is_none());
    }
}
