//! Fichiers de l'app : state.json (écriture atomique), cache de bibliothèque,
//! et liste des jeux connus (seuls ceux-ci peuvent être lancés).

use crate::model::Game;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Dossiers de l'app.
pub struct Paths {
    /// %APPDATA%\studio.pamal.hangar (state.json)
    pub config: PathBuf,
    /// %APPDATA%\studio.pamal.hangar\covers
    pub covers: PathBuf,
    /// %LOCALAPPDATA%\studio.pamal.hangar\cache
    pub cache: PathBuf,
}

impl Paths {
    pub fn state_file(&self) -> PathBuf {
        self.config.join("state.json")
    }
    pub fn library_file(&self) -> PathBuf {
        self.cache.join("library.json")
    }
}

/// Écrit un fichier de façon atomique : fichier temporaire propre à cette écriture, forcé sur
/// le disque, puis renommage. Le nom du temporaire reprend le nom complet du fichier (deux
/// fichiers `java.dll` et `java.exe` écrits en même temps ne partagent pas `java.tmp`) et un
/// compteur (deux écritures du même fichier en même temps ne se mélangent pas).
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    if let Some(d) = path.parent() {
        fs::create_dir_all(d).map_err(|e| format!("Impossible de créer {} : {e}", d.display()))?;
    }
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let tmp = path.with_file_name(format!("{name}.{}-{}.tmp", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
    let written = fs::File::create(&tmp).and_then(|mut f| {
        f.write_all(bytes)?;
        f.sync_all()
    });
    if let Err(e) = written {
        let _ = fs::remove_file(&tmp);
        return Err(format!("Écriture impossible : {e}"));
    }
    // Sous Windows, le renommage échoue un instant si le fichier visé est ouvert ailleurs
    // (antivirus, autre écriture du même fichier) : quelques nouveaux essais.
    let mut tries = 0;
    loop {
        match fs::rename(&tmp, path) {
            Ok(()) => return Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied && tries < 20 => {
                tries += 1;
                std::thread::sleep(std::time::Duration::from_millis(25));
            }
            Err(e) => {
                let _ = fs::remove_file(&tmp);
                return Err(format!("Enregistrement impossible : {e}"));
            }
        }
    }
}

/// Copie de secours de state.json : le dernier état lu sans erreur.
fn state_backup(file: &Path) -> PathBuf {
    file.with_extension("json.bak")
}

fn parse_state(text: &str) -> Option<serde_json::Value> {
    serde_json::from_str::<serde_json::Value>(text).ok().filter(|v| v.is_object())
}

/// Lit state.json.
/// - Absent : la copie de secours si elle existe, sinon `{}` (première ouverture).
/// - Illisible (verrouillé par un antivirus, OneDrive...) : nouvel essai pendant quelques
///   secondes, puis une erreur. Jamais `{}` : le frontend croirait à une première ouverture et
///   sa prochaine sauvegarde écraserait les vraies données.
/// - Corrompu : mis de côté (jamais supprimé), puis la copie de secours, sinon `{}`.
///
/// Un état lu sans erreur devient la nouvelle copie de secours.
pub fn load_state(file: &Path) -> Result<serde_json::Value, String> {
    let backup = || {
        let v = fs::read_to_string(state_backup(file)).ok().and_then(|t| parse_state(&t));
        if v.is_some() {
            log::warn!("state.json repris depuis sa copie de secours");
        }
        v.unwrap_or_else(|| serde_json::json!({}))
    };
    let mut tries = 0;
    let text = loop {
        match fs::read(file) {
            Ok(bytes) => break bytes,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(backup()),
            Err(e) if tries >= 10 => {
                log::error!("state.json illisible : {e}");
                return Err("Tes données Hangar n'ont pas pu être lues (fichier bloqué par un autre programme). Rien ne sera enregistré avant le prochain démarrage de Hangar.".into());
            }
            Err(_) => {
                tries += 1;
                std::thread::sleep(std::time::Duration::from_millis(300));
            }
        }
    };
    match std::str::from_utf8(&text).ok().and_then(parse_state) {
        Some(v) => {
            if let Err(e) = write_atomic(&state_backup(file), &text) {
                log::warn!("copie de secours de state.json impossible : {e}");
            }
            Ok(v)
        }
        None => {
            let aside = file.with_extension(format!("corrompu-{}.json", crate::tracker::now_ms()));
            log::error!("state.json illisible, copie de côté dans {}", aside.display());
            let _ = fs::rename(file, aside);
            Ok(backup())
        }
    }
}

pub fn save_state(file: &Path, state: &serde_json::Value) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(state).map_err(|e| e.to_string())?;
    write_atomic(file, &bytes)
}

pub fn load_library(file: &Path) -> Vec<Game> {
    fs::read_to_string(file).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

pub fn save_library(file: &Path, games: &[Game]) -> Result<(), String> {
    let bytes = serde_json::to_vec(games).map_err(|e| e.to_string())?;
    write_atomic(file, &bytes)
}

/// Jeux connus du backend : détectés et ajoutés à la main.
#[derive(Default)]
pub struct Known {
    scanned: Mutex<HashMap<String, Game>>,
    manual: Mutex<HashMap<String, Game>>,
}

impl Known {
    /// Ajoute ou remplace des jeux détectés.
    pub fn add_scanned(&self, games: &[Game]) {
        let mut m = self.scanned.lock().unwrap_or_else(|p| p.into_inner());
        for g in games {
            m.insert(g.id.clone(), g.clone());
        }
    }

    /// Remplace les jeux d'un scan complet (hors Xbox, qui arrive à part).
    pub fn replace_scanned(&self, games: &[Game]) {
        let mut m = self.scanned.lock().unwrap_or_else(|p| p.into_inner());
        m.retain(|_, g| g.store == "xbox");
        for g in games {
            m.insert(g.id.clone(), g.clone());
        }
    }

    /// Les jeux manuels viennent du champ `manualGames` de state.json.
    pub fn set_manual_from_state(&self, state: &serde_json::Value) {
        let games: Vec<Game> = state
            .get("manualGames")
            .and_then(|v| serde_json::from_value::<Vec<serde_json::Value>>(v.clone()).ok())
            .unwrap_or_default()
            .into_iter()
            .filter_map(|v| serde_json::from_value::<Game>(v).ok())
            .filter(|g| g.id.starts_with("manual:") && g.launch.kind == "exe")
            .collect();
        let mut m = self.manual.lock().unwrap_or_else(|p| p.into_inner());
        m.clear();
        for mut g in games {
            g.store = "manual".into();
            m.insert(g.id.clone(), g);
        }
    }

    /// Le chemin appartient-il à un jeu connu (dossier, exe, logo) ? Les commandes qui
    /// reçoivent un chemin du frontend s'y limitent : pas de lecture ailleurs sur le disque
    /// (ni de chemin réseau `\\serveur\...` qui enverrait l'identité Windows).
    pub fn knows_path(&self, path: &str) -> bool {
        let want = norm_path(path);
        if want.is_empty() {
            return false;
        }
        let owns = |g: &Game| {
            [g.install_dir.as_deref(), g.exe_path.as_deref(), g.logo.as_deref()]
                .into_iter()
                .flatten()
                .chain((g.launch.kind == "exe").then_some(g.launch.target.as_str()))
                .any(|p| norm_path(p) == want)
        };
        let manual = self.manual.lock().unwrap_or_else(|p| p.into_inner());
        let scanned = self.scanned.lock().unwrap_or_else(|p| p.into_inner());
        manual.values().chain(scanned.values()).any(owns)
    }

    /// Dossiers d'installation de tous les jeux connus sauf `except` : une désinstallation ne
    /// doit jamais supprimer un dossier qui en contient un.
    pub fn install_dirs_except(&self, except: &str) -> Vec<std::path::PathBuf> {
        let manual = self.manual.lock().unwrap_or_else(|p| p.into_inner());
        let scanned = self.scanned.lock().unwrap_or_else(|p| p.into_inner());
        manual
            .values()
            .chain(scanned.values())
            .filter(|g| g.id != except)
            .filter_map(|g| g.install_dir.as_deref())
            .filter(|d| !d.trim().is_empty())
            .map(std::path::PathBuf::from)
            .collect()
    }

    pub fn get(&self, id: &str) -> Option<Game> {
        if let Some(g) = self.manual.lock().unwrap_or_else(|p| p.into_inner()).get(id) {
            return Some(g.clone());
        }
        self.scanned.lock().unwrap_or_else(|p| p.into_inner()).get(id).cloned()
    }
}

/// Chemin comparable : séparateurs `\`, minuscules, sans séparateur final.
fn norm_path(p: &str) -> String {
    p.trim().replace('/', "\\").trim_end_matches('\\').to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn etat_atomique_et_corrompu() {
        let t = tempfile::tempdir().unwrap();
        let f = t.path().join("state.json");
        assert_eq!(load_state(&f).unwrap(), serde_json::json!({}));
        save_state(&f, &serde_json::json!({ "version": 1, "favorites": ["steam:1"] })).unwrap();
        assert_eq!(load_state(&f).unwrap()["favorites"][0], "steam:1");
        let names = || {
            let mut v: Vec<String> =
                fs::read_dir(t.path()).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
            v.sort();
            v
        };
        // Aucun temporaire ne traîne, et l'état lu est devenu la copie de secours.
        assert_eq!(names(), ["state.json", "state.json.bak"]);
        fs::write(&f, "{ cassé").unwrap();
        // Corrompu : mis de côté (pas supprimé), et la copie de secours reprend la main.
        assert_eq!(load_state(&f).unwrap()["favorites"][0], "steam:1");
        assert_eq!(names().len(), 2);
        assert!(names().iter().any(|n| n.contains("corrompu")));
        // Absent mais copie de secours présente : on la reprend aussi.
        assert_eq!(load_state(&f).unwrap()["favorites"][0], "steam:1");
    }

    #[test]
    fn etat_illisible_jamais_vide() {
        let t = tempfile::tempdir().unwrap();
        // Un dossier à la place du fichier : la lecture échoue sans que le fichier soit absent.
        let f = t.path().join("state.json");
        fs::create_dir(&f).unwrap();
        assert!(load_state(&f).is_err());
    }

    #[test]
    fn ecritures_simultanees() {
        let t = tempfile::tempdir().unwrap();
        let dir = t.path().to_path_buf();
        let handles: Vec<_> = (0..16)
            .map(|i| {
                let dir = dir.clone();
                std::thread::spawn(move || {
                    let name = if i % 2 == 0 { "java.dll" } else { "java.exe" };
                    write_atomic(&dir.join(name), name.as_bytes()).unwrap();
                })
            })
            .collect();
        handles.into_iter().for_each(|h| h.join().unwrap());
        assert_eq!(fs::read_to_string(dir.join("java.dll")).unwrap(), "java.dll");
        assert_eq!(fs::read_to_string(dir.join("java.exe")).unwrap(), "java.exe");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 2, "aucun temporaire ne reste");
    }

    #[test]
    fn jeux_manuels_connus() {
        let k = Known::default();
        k.set_manual_from_state(&serde_json::json!({
            "manualGames": [
                { "id": "manual:c:\\a.exe", "name": "A", "store": "manual",
                  "launch": { "kind": "exe", "target": "C:\\a.exe", "args": "" } },
                { "id": "steam:1", "name": "Intrus", "store": "manual",
                  "launch": { "kind": "uri", "target": "steam://x", "args": "" } },
                { "pas": "un jeu" }
            ]
        }));
        assert!(k.get("manual:c:\\a.exe").is_some());
        assert!(k.get("steam:1").is_none());
        assert!(k.knows_path("c:/A.exe"));
        assert!(!k.knows_path(r"\\serveur\partage"));
        assert!(!k.knows_path(""));
    }
}
