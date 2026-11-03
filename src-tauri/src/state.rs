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

/// Écrit un fichier de façon atomique : fichier temporaire puis renommage.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(d) = path.parent() {
        fs::create_dir_all(d).map_err(|e| format!("Impossible de créer {} : {e}", d.display()))?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(|e| format!("Écriture impossible : {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("Enregistrement impossible : {e}"))
}

/// Lit state.json. Absent : `{}`. Corrompu : mis de côté (jamais supprimé) puis `{}`.
pub fn load_state(file: &Path) -> serde_json::Value {
    let empty = serde_json::json!({});
    let Ok(text) = fs::read_to_string(file) else { return empty };
    match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(v) if v.is_object() => v,
        _ => {
            let backup = file.with_extension(format!("corrompu-{}.json", crate::tracker::now_ms()));
            log::error!("state.json illisible, copie de côté dans {}", backup.display());
            let _ = fs::rename(file, backup);
            empty
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

    pub fn get(&self, id: &str) -> Option<Game> {
        if let Some(g) = self.manual.lock().unwrap_or_else(|p| p.into_inner()).get(id) {
            return Some(g.clone());
        }
        self.scanned.lock().unwrap_or_else(|p| p.into_inner()).get(id).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn etat_atomique_et_corrompu() {
        let t = tempfile::tempdir().unwrap();
        let f = t.path().join("state.json");
        assert_eq!(load_state(&f), serde_json::json!({}));
        save_state(&f, &serde_json::json!({ "version": 1, "favorites": ["steam:1"] })).unwrap();
        assert_eq!(load_state(&f)["favorites"][0], "steam:1");
        assert!(!f.with_extension("tmp").exists());
        fs::write(&f, "{ cassé").unwrap();
        assert_eq!(load_state(&f), serde_json::json!({}));
        // Le fichier corrompu est mis de côté, pas supprimé.
        assert_eq!(fs::read_dir(t.path()).unwrap().count(), 1);
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
    }
}
