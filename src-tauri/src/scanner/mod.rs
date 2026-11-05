//! Détection des jeux installés : Steam, Epic, GOG, Ubisoft, EA, Battle.net,
//! Riot, Xbox / Microsoft Store, jeux installés hors store et dossiers locaux.
//!
//! Chaque détecteur renvoie une liste vide en cas d'erreur (store absent, clé
//! de registre manquante, fichier corrompu) et journalise la raison.

pub mod appinfo;
pub mod battlenet;
pub mod ea;
pub mod epic;
pub mod exe;
pub mod gog;
pub mod installed;
pub mod local;
pub mod macapps;
pub mod registry;
pub mod riot;
pub mod stats;
pub mod steam;
pub mod ubisoft;
pub mod vdf;
pub mod xbox;

use crate::model::Game;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Priorité de dédoublonnage (un même dossier détecté par deux sources).
pub const STORE_PRIORITY: &[&str] = &[
    "steam", "epic", "gog", "ubisoft", "ea", "battlenet", "riot", "xbox", "local", "manual",
];

/// Données partagées des launchers : `%PROGRAMDATA%` sous Windows, `/Users/Shared` sous macOS.
pub fn program_data() -> PathBuf {
    if cfg!(target_os = "macos") {
        return PathBuf::from("/Users/Shared");
    }
    std::env::var("PROGRAMDATA").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from(r"C:\ProgramData"))
}

/// `~/Library/Application Support` (macOS).
pub fn mac_support() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default()).join("Library").join("Application Support")
}

/// Chemin écrit avec des `/` (fichiers des launchers) vers le séparateur du système.
pub fn native_sep(s: &str) -> String {
    if cfg!(windows) {
        s.replace('/', "\\")
    } else {
        s.to_string()
    }
}

/// Normalise un nom pour les comparaisons (alphanumérique, minuscules).
pub fn norm(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric()).collect::<String>().to_lowercase()
}

/// Clé de dédoublonnage : dossier d'installation en minuscules sans séparateur final.
pub fn dir_key(g: &Game) -> String {
    g.install_dir
        .as_ref()
        .map(|d| d.replace('/', "\\").trim_end_matches('\\').to_lowercase())
        .filter(|d| !d.is_empty())
        .unwrap_or_else(|| g.id.clone())
}

fn priority(store: &str) -> usize {
    STORE_PRIORITY.iter().position(|s| *s == store).unwrap_or(STORE_PRIORITY.len())
}

/// Garde un seul jeu par dossier (et par id), selon STORE_PRIORITY, puis trie par nom.
pub fn dedupe(mut games: Vec<Game>) -> Vec<Game> {
    games.sort_by_key(|g| priority(&g.store));
    let mut dirs = HashSet::new();
    let mut ids = HashSet::new();
    games.retain(|g| {
        let fresh_dir = dirs.insert(dir_key(g));
        let fresh_id = ids.insert(g.id.clone());
        fresh_dir && fresh_id
    });
    games.sort_by_key(|g| g.name.to_lowercase());
    games
}

/// Complète les champs dérivés : noms de processus à partir de l'exe principal.
pub fn finalize(mut g: Game) -> Game {
    if let Some(x) = &g.exe_path {
        if let Some(f) = Path::new(x).file_name() {
            let f = f.to_string_lossy().into_owned();
            if f.to_lowercase().ends_with(".exe")
                && !crate::tracker::is_launcher_process(&f)
                && !g.process_names.iter().any(|p| p.eq_ignore_ascii_case(&f))
            {
                g.process_names.push(f);
            }
        }
    }
    g
}

type Detector = fn() -> Vec<Game>;

fn run_detector(name: &str, f: Detector) -> Vec<Game> {
    let t = std::time::Instant::now();
    let out = std::panic::catch_unwind(f).unwrap_or_else(|_| {
        log::error!("détecteur {name} : panique, ignoré");
        vec![]
    });
    log::info!("détecteur {name} : {} jeu(x) en {} ms", out.len(), t.elapsed().as_millis());
    out
}

/// Scan rapide : tous les détecteurs sauf Xbox (PowerShell, lent), en parallèle.
pub fn scan_fast(local_folders: &[String]) -> Vec<Game> {
    let detectors: Vec<(&str, Detector)> = vec![
        ("steam", steam::detect),
        ("epic", epic::detect),
        ("gog", gog::detect),
        ("ubisoft", ubisoft::detect),
        ("ea", ea::detect),
        ("battlenet", battlenet::detect),
        ("riot", riot::detect),
        ("installés", installed::detect),
        // Jeux possédés non installés : après les détecteurs ci-dessus, pour que
        // dedupe (tri stable) garde la version installée d'un même id.
        ("steam (non installés)", steam::owned),
        ("epic (non installés)", epic::owned),
        ("gog (non installés)", gog::owned),
        ("riot (non installés)", riot::owned),
    ];
    let mut games: Vec<Game> = std::thread::scope(|s| {
        let handles: Vec<_> = detectors
            .into_iter()
            .map(|(name, f)| s.spawn(move || run_detector(name, f)))
            .collect();
        let folders: Vec<_> = local_folders
            .iter()
            .map(|f| s.spawn(move || local::detect_folder(Path::new(f))))
            .collect();
        handles
            .into_iter()
            .chain(folders)
            .flat_map(|h| h.join().unwrap_or_default())
            .collect()
    });
    games = games.into_iter().map(finalize).collect();
    let mut games = dedupe(installed::drop_nested(games));
    stats::enrich(&mut games);
    games
}

/// Scan Xbox (lent) : à lancer en tâche de fond. Écarte les dossiers déjà connus
/// par une source prioritaire.
pub fn scan_xbox(known: &[Game]) -> Vec<Game> {
    let taken: HashSet<String> =
        known.iter().filter(|g| priority(&g.store) < priority("xbox")).map(dir_key).collect();
    let games = run_detector("xbox", xbox::detect);
    let mut games: Vec<Game> = games.into_iter().filter(|g| !taken.contains(&dir_key(g))).map(finalize).collect();
    stats::enrich(&mut games);
    games
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::uri;

    fn g(id: &str, store: &str, dir: &str) -> Game {
        let mut x = Game::new(id.into(), id.into(), store, uri("x"));
        x.install_dir = Some(dir.into());
        x
    }

    #[test]
    fn dedupe_garde_la_source_prioritaire() {
        let out = dedupe(vec![
            g("local:a", "local", r"C:\Jeux\A\"),
            g("steam:1", "steam", r"c:\jeux\a"),
            g("xbox:b", "xbox", r"C:\XboxGames\B\Content"),
            g("epic:b", "epic", r"C:/XboxGames/B/Content/"),
        ]);
        let ids: Vec<_> = out.iter().map(|x| x.id.as_str()).collect();
        assert_eq!(ids, vec!["epic:b", "steam:1"]);
    }

    #[test]
    fn dedupe_garde_le_jeu_installe() {
        let mut owned = g("steam:1", "steam", "");
        owned.install_dir = None;
        owned.not_installed = true;
        let out = dedupe(vec![g("steam:1", "steam", r"C:\Jeux\A"), owned]);
        assert_eq!(out.len(), 1);
        assert!(!out[0].not_installed);
    }

    #[test]
    fn dedupe_sans_dossier_utilise_l_id() {
        let mut a = g("manual:1", "manual", "");
        a.install_dir = None;
        let mut b = a.clone();
        b.id = "manual:2".into();
        assert_eq!(dedupe(vec![a, b]).len(), 2);
    }

    #[test]
    #[cfg(windows)] // chemin Windows : sous macOS `C:\...` n'a pas de séparateur
    fn finalize_ajoute_le_nom_de_l_exe() {
        let mut x = g("local:a", "local", r"C:\Jeux\A");
        x.exe_path = Some(r"C:\Jeux\A\Game.exe".into());
        assert_eq!(finalize(x).process_names, vec!["Game.exe".to_string()]);
    }
}

#[cfg(test)]
mod reel {
    /// Scan de la machine courante : `cargo test reel -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn scan_de_cette_machine() {
        let t = std::time::Instant::now();
        let games = super::scan_fast(&[]);
        println!("scan rapide : {} jeux en {} ms", games.len(), t.elapsed().as_millis());
        for g in &games {
            println!("  {:<10} {:<40} {} {:?}", g.store, g.name, if g.not_installed { "[à installer]" } else { "" }, g.process_names);
        }
        let t = std::time::Instant::now();
        let xbox = super::scan_xbox(&games);
        println!("xbox : {} jeux en {} ms", xbox.len(), t.elapsed().as_millis());
    }
}
