//! Epic Games : `%PROGRAMDATA%\Epic\EpicGamesLauncher\Data\Manifests\*.item` (JSON).
//! Jeux possédés non installés : catalogue local du launcher (`catcache.bin`).

use crate::model::{uri, Game};
use base64::Engine;
use serde::Deserialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

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

/// macOS : les données d'Epic restent après la suppression de l'app, on exige l'app elle-même.
pub fn launcher_installed() -> bool {
    !cfg!(target_os = "macos") || super::mac_app("Epic Games Launcher")
}

pub fn detect() -> Vec<Game> {
    if !launcher_installed() {
        log::info!("Epic : launcher absent");
        return vec![];
    }
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

/// Emplacements possibles de `catcache.bin` (catalogue des produits du compte, JSON en base64).
pub fn catcache_paths() -> Vec<PathBuf> {
    if cfg!(target_os = "macos") {
        return vec![super::mac_support().join("Epic/EpicGamesLauncher/Data/Catalog/catcache.bin")];
    }
    let mut paths = vec![super::program_data().join(r"Epic\EpicGamesLauncher\Data\Catalog\catcache.bin")];
    if let Ok(l) = std::env::var("LOCALAPPDATA") {
        paths.push(Path::new(&l).join(r"EpicGamesLauncher\Saved\Data\Catalog\catcache.bin"));
    }
    paths
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct CatPath {
    path: String,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct CatRef {
    id: String,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct CatRelease {
    app_id: String,
    platform: Vec<String>,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct CatItem {
    id: String,
    namespace: String,
    title: String,
    categories: Vec<CatPath>,
    main_game_item: Option<CatRef>,
    release_info: Vec<CatRelease>,
}

/// Jeux du catalogue local : catégorie « games », pas un DLC, disponibles sur ce système.
pub fn parse_catalog_games(raw: &[u8]) -> Vec<Game> {
    let clean: Vec<u8> = raw.iter().copied().filter(|c| !c.is_ascii_whitespace()).collect();
    let Ok(json) = base64::engine::general_purpose::STANDARD.decode(&clean) else { return vec![] };
    let Ok(items) = serde_json::from_slice::<Vec<CatItem>>(&json) else { return vec![] };
    games_from_items(items)
}

/// Entrées du catalogue Epic (local ou API) -> jeux à installer.
pub fn games_from_items(items: Vec<CatItem>) -> Vec<Game> {
    let platform = if cfg!(target_os = "macos") { "Mac" } else { "Windows" };
    let mut seen = HashSet::new();
    items
        .into_iter()
        .filter(|it| it.categories.iter().any(|c| c.path == "games"))
        .filter(|it| it.main_game_item.as_ref().is_none_or(|m| m.id.is_empty()))
        .filter_map(|it| {
            let rel = it.release_info.iter().find(|r| r.platform.iter().any(|p| p == platform))?;
            // Identifiants placés dans l'URI du launcher : rien d'autre qu'alphanumérique, - et _.
            let safe = [&it.namespace, &it.id, &rel.app_id].iter().all(|x| crate::accounts::safe_id(x, 128));
            if it.title.is_empty() || !safe || !seen.insert(rel.app_id.clone()) {
                return None;
            }
            let mut g = Game::new(
                format!("epic:{}", rel.app_id),
                it.title.clone(),
                "epic",
                uri(format!("com.epicgames.launcher://apps/{}%3A{}%3A{}?action=install", it.namespace, it.id, rel.app_id)),
            );
            g.not_installed = true;
            Some(g)
        })
        .collect()
}

/// Jeux du compte Epic (le scan retire ensuite ceux qui sont installés).
pub fn owned() -> Vec<Game> {
    if !launcher_installed() {
        return vec![];
    }
    for p in catcache_paths() {
        if let Ok(raw) = fs::read(&p) {
            return parse_catalog_games(&raw);
        }
    }
    log::info!("Epic : pas de catalogue local");
    vec![]
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
    fn catalogue_des_jeux_possedes() {
        let items = r#"[
            { "id": "cid", "namespace": "calluna", "title": "Control",
              "categories": [{ "path": "games" }, { "path": "applications" }],
              "mainGameItem": { "namespace": "", "id": "" },
              "releaseInfo": [{ "appId": "Calluna", "platform": ["Windows", "Mac"] }] },
            { "id": "dlc", "namespace": "calluna", "title": "Control - DLC",
              "categories": [{ "path": "games" }], "mainGameItem": { "id": "cid" },
              "releaseInfo": [{ "appId": "CallunaDlc", "platform": ["Windows", "Mac"] }] },
            { "id": "tm", "namespace": "poodle", "title": "Twinmotion",
              "categories": [{ "path": "software" }],
              "releaseInfo": [{ "appId": "Tw", "platform": ["Windows", "Mac"] }] },
            { "id": "na", "namespace": "x", "title": "Sans release", "categories": [{ "path": "games" }] }
        ]"#;
        let raw = base64::engine::general_purpose::STANDARD.encode(items);
        let games = parse_catalog_games(raw.as_bytes());
        assert_eq!(games.len(), 1);
        let g = &games[0];
        assert_eq!(g.id, "epic:Calluna");
        assert!(g.not_installed);
        assert_eq!(g.launch.target, "com.epicgames.launcher://apps/calluna%3Acid%3ACalluna?action=install");
        assert_eq!(crate::artwork::epic_ids(&g.launch.target), Some(("cid".into(), "Calluna".into())));
        assert!(parse_catalog_games(b"pas du base64 !").is_empty());
    }

    #[test]
    fn ignore_dlc_incomplet_et_non_jeux() {
        assert!(parse_manifest(&ITEM.replace("\"MainGameAppName\": \"Fortnite\"", "\"MainGameAppName\": \"Autre\"")).is_none());
        assert!(parse_manifest(&ITEM.replace("\"bIsIncompleteInstall\": false", "\"bIsIncompleteInstall\": true")).is_none());
        assert!(parse_manifest(&ITEM.replace("\"games\", ", "")).is_none());
        assert!(parse_manifest("{ pas du json").is_none());
    }
}
