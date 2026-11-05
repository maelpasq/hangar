//! Données réelles des stores, lues en local pendant le scan (aucun réseau) :
//! temps de jeu et dernière session (Steam, GOG Galaxy), taille et date d'installation
//! (manifestes, clés de désinstallation, date de création du dossier).

use super::vdf::{self, Vdf};
use crate::model::Game;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Temps de jeu (ms) et dernière session (ms epoch) connus d'un store.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Stat {
    pub play_ms: u64,
    pub last: u64,
}

impl Stat {
    fn merge(self, o: Stat) -> Stat {
        Stat { play_ms: self.play_ms.max(o.play_ms), last: self.last.max(o.last) }
    }
}

const STEAM_ID64_BASE: u64 = 76_561_197_960_265_728;

/// Temps de jeu par appid dans un `localconfig.vdf` (Playtime en minutes, LastPlayed en secondes).
pub fn parse_localconfig(text: &str) -> HashMap<u32, Stat> {
    let root = vdf::parse(text);
    let Some(apps) = root.path(&["UserLocalConfigStore", "Software", "Valve", "Steam", "apps"]) else {
        return HashMap::new();
    };
    apps.entries()
        .iter()
        .filter_map(|(k, v)| {
            let id: u32 = k.parse().ok()?;
            let s = Stat {
                play_ms: v.get_u64("Playtime").unwrap_or(0) * 60_000,
                last: v.get_u64("LastPlayed").unwrap_or(0) * 1000,
            };
            (s.play_ms > 0 || s.last > 0).then_some((id, s))
        })
        .collect()
}

/// Compte Steam le plus récemment utilisé (`loginusers.vdf`), en identifiant de compte 32 bits.
pub fn most_recent_account(loginusers: &str) -> Option<u64> {
    let root = vdf::parse(loginusers);
    let users = root.get("users")?;
    let pick = |(id, u): &(String, Vdf)| {
        let recent = u.get_str("MostRecent") == Some("1");
        Some((recent, u.get_u64("Timestamp").unwrap_or(0), id.parse::<u64>().ok()?))
    };
    users
        .entries()
        .iter()
        .filter_map(pick)
        .max_by_key(|(recent, ts, _)| (*recent, *ts))
        .map(|(_, _, id64)| id64.saturating_sub(STEAM_ID64_BASE))
}

/// Temps de jeu Steam : compte le plus récent, sinon le maximum sur tous les comptes.
pub fn steam_playtimes(root: &Path) -> HashMap<u32, Stat> {
    let userdata = root.join("userdata");
    let read = |acc: &str| fs::read_to_string(userdata.join(acc).join("config").join("localconfig.vdf")).ok();
    if let Some(acc) = fs::read_to_string(root.join("config").join("loginusers.vdf"))
        .ok()
        .and_then(|t| most_recent_account(&t))
    {
        if let Some(t) = read(&acc.to_string()) {
            return parse_localconfig(&t);
        }
    }
    let mut out: HashMap<u32, Stat> = HashMap::new();
    for e in fs::read_dir(&userdata).into_iter().flatten().flatten() {
        let Some(t) = read(&e.file_name().to_string_lossy()) else { continue };
        for (id, s) in parse_localconfig(&t) {
            let cur = out.entry(id).or_default();
            *cur = cur.merge(s);
        }
    }
    out
}

/// Date `AAAA-MM-JJ HH:MM:SS` (UTC) ou `AAAAMMJJ` vers ms epoch.
pub fn parse_date(s: &str) -> Option<u64> {
    let digits: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() < 8 {
        return None;
    }
    let n = |a: usize, b: usize| digits.get(a..b).and_then(|x| x.parse::<i64>().ok());
    let (y, m, d) = (n(0, 4)?, n(4, 6)?, n(6, 8)?);
    if !(1990..=2200).contains(&y) || !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let (hh, mm, ss) = (n(8, 10).unwrap_or(0), n(10, 12).unwrap_or(0), n(12, 14).unwrap_or(0));
    // Jours depuis 1970 (algorithme de Howard Hinnant).
    let yy = if m <= 2 { y - 1 } else { y };
    let era = yy.div_euclid(400);
    let yoe = yy - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let secs = days * 86_400 + hh * 3600 + mm * 60 + ss;
    u64::try_from(secs).ok().map(|s| s * 1000)
}

/// GOG Galaxy : temps de jeu par `releaseKey` (`gog_<id>`, `steam_<appid>`...).
pub fn gog_galaxy(db: &Path) -> HashMap<String, Stat> {
    match read_galaxy(db) {
        Ok(m) => m,
        Err(e) => {
            log::warn!("GOG Galaxy : base illisible ({e})");
            HashMap::new()
        }
    }
}

/// Ouvre la base de GOG Galaxy en lecture seule, même si Galaxy la tient ouverte.
pub fn open_galaxy(db: &Path) -> rusqlite::Result<rusqlite::Connection> {
    use rusqlite::{Connection, OpenFlags};
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX | OpenFlags::SQLITE_OPEN_URI;
    // immutable=1 : aucune prise de verrou, la base peut rester ouverte par Galaxy.
    let uri = format!("file:{}?immutable=1", db.to_string_lossy().replace('\\', "/").replace('?', "%3f"));
    match Connection::open_with_flags(&uri, flags) {
        Ok(c) => Ok(c),
        Err(_) => {
            let tmp = std::env::temp_dir().join(format!("hangar-galaxy-{}.db", std::process::id()));
            fs::copy(db, &tmp).map_err(|_| rusqlite::Error::InvalidPath(db.to_path_buf()))?;
            Connection::open_with_flags(&tmp, OpenFlags::SQLITE_OPEN_READ_ONLY)
        }
    }
}

fn read_galaxy(db: &Path) -> rusqlite::Result<HashMap<String, Stat>> {
    let conn = open_galaxy(db)?;
    let mut out: HashMap<String, Stat> = HashMap::new();
    if let Ok(mut st) = conn.prepare("SELECT releaseKey, MAX(minutesInGame) FROM GameTimes GROUP BY releaseKey") {
        let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<i64>>(1)?)))?;
        for (k, min) in rows.flatten() {
            out.entry(k).or_default().play_ms = (min.unwrap_or(0).max(0) as u64) * 60_000;
        }
    }
    if let Ok(mut st) =
        conn.prepare("SELECT gameReleaseKey, MAX(lastPlayedDate) FROM LastPlayedDates GROUP BY gameReleaseKey")
    {
        let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)))?;
        for (k, d) in rows.flatten() {
            if let Some(ms) = d.as_deref().and_then(parse_date) {
                out.entry(k).or_default().last = ms;
            }
        }
    }
    out.retain(|_, s| s.play_ms > 0 || s.last > 0);
    Ok(out)
}

/// Date de création d'un dossier ou d'un fichier, en ms epoch.
pub fn created_ms(p: &Path) -> Option<u64> {
    let t = fs::metadata(p).ok()?.created().ok()?;
    let ms = t.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as u64;
    (ms > 0).then_some(ms)
}

fn dir_norm(d: &str) -> String {
    d.replace('/', "\\").trim_matches('"').trim_end_matches('\\').to_lowercase()
}

/// Infos des clés de désinstallation par dossier : (date d'installation, taille en octets).
#[cfg(windows)]
fn uninstall_index() -> HashMap<String, (Option<u64>, Option<u64>)> {
    use super::registry::{uninstall_entries, val};
    let mut out = HashMap::new();
    for k in uninstall_entries() {
        let Some(loc) = val(&k, "InstallLocation").map(|d| dir_norm(&d)).filter(|d| d.len() > 3) else {
            continue;
        };
        let date = val(&k, "InstallDate").and_then(|d| parse_date(&d));
        let size = k.get_value::<u32, _>("EstimatedSize").ok().filter(|kb| *kb > 0).map(|kb| kb as u64 * 1024);
        let e = out.entry(loc).or_insert((None, None));
        e.0 = e.0.or(date);
        e.1 = e.1.or(size);
    }
    out
}

#[cfg(not(windows))]
fn uninstall_index() -> HashMap<String, (Option<u64>, Option<u64>)> {
    HashMap::new()
}

pub fn galaxy_db() -> PathBuf {
    super::program_data().join("GOG.com").join("Galaxy").join("storage").join("galaxy-2.0.db")
}

/// Sources réunies pour compléter les jeux d'un scan.
#[derive(Default)]
pub struct Sources {
    pub steam: HashMap<u32, Stat>,
    pub galaxy: HashMap<String, Stat>,
    pub uninstall: HashMap<String, (Option<u64>, Option<u64>)>,
}

impl Sources {
    pub fn load(games: &[Game]) -> Sources {
        let t = std::time::Instant::now();
        let steam = if games.iter().any(|g| g.store == "steam") {
            super::steam::steam_root().map(|r| steam_playtimes(&r)).unwrap_or_default()
        } else {
            HashMap::new()
        };
        let db = galaxy_db();
        let galaxy = if db.is_file() { gog_galaxy(&db) } else { HashMap::new() };
        let s = Sources { steam, galaxy, uninstall: uninstall_index() };
        log::info!(
            "statistiques des stores : {} Steam, {} GOG Galaxy, {} clés en {} ms",
            s.steam.len(),
            s.galaxy.len(),
            s.uninstall.len(),
            t.elapsed().as_millis()
        );
        s
    }

    /// Remplit storePlayMs, storeLastPlayed, sizeBytes et installedAt quand c'est possible.
    pub fn apply(&self, g: &mut Game) {
        let mut stat: Option<Stat> = None;
        let mut add = |s: Option<&Stat>| {
            if let Some(s) = s {
                stat = Some(stat.unwrap_or_default().merge(*s));
            }
        };
        if let Some(id) = g.steam_app_id {
            add(self.steam.get(&id));
            add(self.galaxy.get(&format!("steam_{id}")));
        }
        if let Some(id) = g.id.strip_prefix("gog:") {
            add(self.galaxy.get(&format!("gog_{id}")));
        }
        if let Some(s) = stat {
            g.store_play_ms = (s.play_ms > 0).then_some(s.play_ms);
            g.store_last_played = (s.last > 0).then_some(s.last);
        }
        let reg = g.install_dir.as_deref().and_then(|d| self.uninstall.get(&dir_norm(d)));
        if g.size_bytes.is_none() {
            g.size_bytes = reg.and_then(|r| r.1);
        }
        if g.installed_at.is_none() {
            g.installed_at = reg
                .and_then(|r| r.0)
                .or_else(|| g.install_dir.as_deref().and_then(|d| created_ms(Path::new(d))))
                .or_else(|| g.exe_path.as_deref().and_then(|x| created_ms(Path::new(x))));
        }
    }
}

/// Complète tous les jeux d'un scan.
pub fn enrich(games: &mut [Game]) {
    let src = Sources::load(games);
    for g in games.iter_mut() {
        src.apply(g);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::uri;

    const LOCALCONFIG: &str = include_str!("../../tests/fixtures/localconfig.vdf");

    #[test]
    fn temps_de_jeu_steam() {
        let m = parse_localconfig(LOCALCONFIG);
        assert_eq!(m.len(), 2, "l'app 7 sans temps de jeu est ignorée");
        assert_eq!(m[&526870], Stat { play_ms: 12840 * 60_000, last: 1_793_682_000_000 });
        assert_eq!(m[&284160].play_ms, 8160 * 60_000);
    }

    #[test]
    fn compte_steam_le_plus_recent() {
        let t = r#""users" {
            "76561198000000001" { "AccountName" "a" "MostRecent" "0" "Timestamp" "1800000000" }
            "76561198841866022" { "AccountName" "b" "MostRecent" "1" "Timestamp" "1700000000" }
        }"#;
        assert_eq!(most_recent_account(t), Some(881_600_294));
        let sans = t.replace("\"MostRecent\" \"1\"", "\"MostRecent\" \"0\"");
        assert_eq!(most_recent_account(&sans), Some(39_734_273));
    }

    #[test]
    fn userdata_complet() {
        let d = tempfile::tempdir().unwrap();
        let cfg = d.path().join("userdata").join("881600294").join("config");
        fs::create_dir_all(&cfg).unwrap();
        fs::write(cfg.join("localconfig.vdf"), LOCALCONFIG).unwrap();
        // Pas de loginusers.vdf : on prend tous les comptes.
        assert_eq!(steam_playtimes(d.path()).len(), 2);
    }

    #[test]
    fn dates() {
        assert_eq!(parse_date("19700101"), None, "date hors plage plausible");
        assert_eq!(parse_date("20240115"), Some(1_705_276_800_000));
        assert_eq!(parse_date("2021-05-12 18:30:12"), Some(1_620_844_212_000));
        assert_eq!(parse_date("pas une date"), None);
        assert_eq!(parse_date("20241345"), None);
    }

    #[test]
    fn base_gog_galaxy() {
        let d = tempfile::tempdir().unwrap();
        let db = d.path().join("galaxy-2.0.db");
        {
            let c = rusqlite::Connection::open(&db).unwrap();
            c.execute_batch(
                "CREATE TABLE GameTimes (userId INTEGER, releaseKey TEXT, minutesInGame INTEGER);
                 CREATE TABLE LastPlayedDates (userId INTEGER, gameReleaseKey TEXT, lastPlayedDate TEXT);
                 INSERT INTO GameTimes VALUES (1, 'gog_1207658924', 600), (1, 'steam_620', 30), (1, 'gog_1', 0);
                 INSERT INTO LastPlayedDates VALUES (1, 'gog_1207658924', '2021-05-12 18:30:12');",
            )
            .unwrap();
        }
        let m = gog_galaxy(&db);
        assert_eq!(m["gog_1207658924"], Stat { play_ms: 36_000_000, last: 1_620_844_212_000 });
        assert_eq!(m["steam_620"].play_ms, 1_800_000);
        assert!(!m.contains_key("gog_1"), "aucune donnée utile");
        assert!(gog_galaxy(&d.path().join("absente.db")).is_empty());
    }

    #[test]
    fn application_aux_jeux() {
        let d = tempfile::tempdir().unwrap();
        let mut src = Sources::default();
        src.steam.insert(620, Stat { play_ms: 100, last: 5 });
        src.galaxy.insert("steam_620".into(), Stat { play_ms: 300, last: 2 });
        src.galaxy.insert("gog_7".into(), Stat { play_ms: 60_000, last: 0 });
        let dir = d.path().to_string_lossy().into_owned();
        src.uninstall.insert(dir_norm(&dir), (Some(1000), Some(2048)));

        let mut steam = Game::new("steam:620".into(), "Portal 2".into(), "steam", uri("x"));
        steam.steam_app_id = Some(620);
        steam.size_bytes = Some(42);
        src.apply(&mut steam);
        assert_eq!((steam.store_play_ms, steam.store_last_played), (Some(300), Some(5)));
        assert_eq!(steam.size_bytes, Some(42), "la taille du manifeste est gardée");
        assert!(steam.installed_at.is_none());

        let mut gog = Game::new("gog:7".into(), "Jeu".into(), "gog", uri("x"));
        gog.install_dir = Some(format!("{dir}\\"));
        src.apply(&mut gog);
        assert_eq!((gog.store_play_ms, gog.store_last_played), (Some(60_000), None));
        assert_eq!((gog.size_bytes, gog.installed_at), (Some(2048), Some(1000)));

        let mut local = Game::new("local:x".into(), "X".into(), "local", uri("x"));
        local.install_dir = Some(d.path().join("sous").to_string_lossy().into_owned());
        fs::create_dir_all(local.install_dir.as_ref().unwrap()).unwrap();
        src.apply(&mut local);
        assert!(local.store_play_ms.is_none());
        assert!(local.installed_at.is_some(), "date de création du dossier");
    }
}
