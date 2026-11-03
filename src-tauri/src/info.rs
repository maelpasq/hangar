//! Informations complémentaires d'un jeu (genre), via l'API `appdetails` de Steam.
//! Cache disque `cache\info.json` : un succès est gardé, un échec est retenté au bout de 7 jours.

use crate::art::Art;
use crate::artwork::Artworks;
use crate::model::Game;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

const RETRY_MS: u64 = 7 * 86_400_000;

#[derive(Serialize, Default, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GameInfo {
    pub genre: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Entry {
    /// None après un échec (réseau, appid inconnu de l'API).
    ok: bool,
    genre: Option<String>,
    at: u64,
}

pub struct Infos {
    art: Arc<Art>,
    artwork: Arc<Artworks>,
    file: PathBuf,
    cache: Mutex<HashMap<u32, Entry>>,
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Genres en clair d'une réponse `appdetails` (les deux premiers, joints par « , »).
pub fn parse_genres(v: &Value, appid: u32) -> Option<Option<String>> {
    let app = v.get(appid.to_string())?;
    if !app.get("success").and_then(Value::as_bool).unwrap_or(false) {
        return None;
    }
    let genres: Vec<&str> = app
        .pointer("/data/genres")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|g| g.get("description").and_then(Value::as_str)).map(str::trim).collect())
        .unwrap_or_default();
    let genres: Vec<&str> = genres.into_iter().filter(|g| !g.is_empty()).take(2).collect();
    Some((!genres.is_empty()).then(|| genres.join(", ")))
}

impl Infos {
    pub fn new(art: Arc<Art>, artwork: Arc<Artworks>, cache_dir: &Path) -> Infos {
        let file = cache_dir.join("info.json");
        let cache = fs::read_to_string(&file).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        Infos { art, artwork, file, cache: Mutex::new(cache) }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<u32, Entry>> {
        self.cache.lock().unwrap_or_else(|p| p.into_inner())
    }

    fn persist(&self, c: &HashMap<u32, Entry>) {
        let Ok(bytes) = serde_json::to_vec(c) else { return };
        let tmp = self.file.with_extension(format!("{}.tmp", now()));
        if fs::write(&tmp, bytes).is_ok() && fs::rename(&tmp, &self.file).is_err() {
            let _ = fs::remove_file(&tmp);
        }
    }

    /// Genre d'un jeu : appid natif, sinon celui retrouvé par le nom (cache d'artwork.rs).
    pub fn get(&self, game: &Game) -> GameInfo {
        let appid = game.steam_app_id.or_else(|| self.artwork.steam_id(&game.name));
        let Some(appid) = appid else { return GameInfo::default() };
        if let Some(e) = self.lock().get(&appid).cloned() {
            if e.ok || now().saturating_sub(e.at) < RETRY_MS {
                return GameInfo { genre: e.genre };
            }
        }
        let url = format!("https://store.steampowered.com/api/appdetails?appids={appid}&l=french&filters=genres");
        let parsed = match self.art.get_json(&url, None) {
            Ok(v) => parse_genres(&v, appid),
            Err(code) => {
                log::warn!("appdetails {appid} : erreur {code}");
                None
            }
        };
        let entry = Entry { ok: parsed.is_some(), genre: parsed.clone().flatten(), at: now() };
        let mut c = self.lock();
        c.insert(appid, entry);
        self.persist(&c);
        GameInfo { genre: parsed.flatten() }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn genres_appdetails() {
        let v = json!({ "526870": { "success": true, "data": { "genres": [
            { "id": "1", "description": "Action" },
            { "id": "28", "description": "Simulation" },
            { "id": "2", "description": "Stratégie" }
        ] } } });
        assert_eq!(parse_genres(&v, 526870), Some(Some("Action, Simulation".to_string())));
    }

    #[test]
    fn appdetails_sans_genre_ou_en_echec() {
        let v = json!({ "1": { "success": true, "data": [] } });
        assert_eq!(parse_genres(&v, 1), Some(None), "succès sans genre : mis en cache");
        let v = json!({ "1": { "success": false } });
        assert_eq!(parse_genres(&v, 1), None);
        assert_eq!(parse_genres(&json!({}), 1), None);
    }
}

#[cfg(test)]
mod reel {
    /// Statistiques réelles de la machine : `cargo test reel_stats -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn reel_stats() {
        use std::sync::Arc;
        let d = tempfile::tempdir().unwrap();
        let art = Arc::new(crate::art::Art::new(d.path()));
        let aw = Arc::new(crate::artwork::Artworks::new(art.clone(), d.path()));
        let infos = super::Infos::new(art, aw, d.path());
        let t = std::time::Instant::now();
        let mut games = crate::scanner::scan_fast(&[]);
        let fast = t.elapsed().as_millis();
        let xbox = crate::scanner::scan_xbox(&games);
        games.extend(xbox);
        println!("scan (stats comprises) : {} jeux, {fast} ms hors Xbox", games.len());
        let date = |ms: Option<u64>| {
            ms.map(|m| {
                let days = (m / 86_400_000) as i64;
                // Date civile depuis les jours epoch (algorithme de Howard Hinnant).
                let z = days + 719_468;
                let era = z.div_euclid(146_097);
                let doe = z - era * 146_097;
                let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
                let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
                let mp = (5 * doy + 2) / 153;
                let d = doy - (153 * mp + 2) / 5 + 1;
                let m = if mp < 10 { mp + 3 } else { mp - 9 };
                let y = yoe + era * 400 + i64::from(m <= 2);
                format!("{y:04}-{m:02}-{d:02}")
            })
            .unwrap_or_else(|| "-".into())
        };
        println!("| Jeu | Store | Temps (h) | Dernière session | Taille | Installé | Genre |");
        println!("|---|---|---|---|---|---|---|");
        for g in &games {
            let genre = infos.get(g).genre.unwrap_or_else(|| "-".into());
            println!(
                "| {} | {} | {} | {} | {} | {} | {} |",
                g.name,
                g.store,
                g.store_play_ms.map(|m| format!("{:.1}", m as f64 / 3_600_000.0)).unwrap_or_else(|| "-".into()),
                date(g.store_last_played),
                g.size_bytes.map(|b| format!("{:.1} Go", b as f64 / 1e9)).unwrap_or_else(|| "-".into()),
                date(g.installed_at),
                genre
            );
        }
    }
}
