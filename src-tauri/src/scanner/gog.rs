//! GOG : registre `GOG.com\Games`, lancement via GOG Galaxy s'il est installé.
//! Jeux possédés non installés : base de GOG Galaxy.

use crate::model::Game;

#[cfg(windows)]
pub fn detect() -> Vec<Game> {
    use super::registry::{reg_str, subkeys, val, HKLM};
    use crate::model::{default_launcher, Launch};
    use std::path::{Path, PathBuf};

    let galaxy = reg_str(HKLM, r"SOFTWARE\WOW6432Node\GOG.com\GalaxyClient\paths", "client")
        .map(|d| Path::new(&d).join("GalaxyClient.exe"))
        .filter(|p| p.exists());
    let mut out = vec![];
    for (_, k) in subkeys(HKLM, r"SOFTWARE\WOW6432Node\GOG.com\Games") {
        let (Some(id), Some(name), Some(path)) = (val(&k, "gameID"), val(&k, "gameName"), val(&k, "path")) else {
            continue;
        };
        if val(&k, "dependsOn").is_some() || !Path::new(&path).exists() {
            continue; // DLC ou désinstallé
        }
        let game_exe = val(&k, "exe").map(PathBuf::from);
        let (launch, launcher) = if let Some(g) = &galaxy {
            (
                Launch {
                    kind: "exe".into(),
                    target: g.to_string_lossy().into_owned(),
                    args: format!("/command=runGame /gameId={id} /path=\"{path}\""),
                    cwd: None,
                },
                "GOG Galaxy",
            )
        } else if let Some(x) = &game_exe {
            (
                Launch {
                    kind: "exe".into(),
                    target: x.to_string_lossy().into_owned(),
                    args: val(&k, "launchParam").unwrap_or_default(),
                    cwd: val(&k, "workingDir").or_else(|| Some(path.clone())),
                },
                default_launcher("local"),
            )
        } else {
            continue;
        };
        let mut g = Game::new(format!("gog:{id}"), name, "gog", launch);
        g.launcher_name = launcher.to_string();
        g.install_dir = Some(path);
        g.exe_path = game_exe.map(|p| p.to_string_lossy().into_owned());
        g.version = val(&k, "buildId").filter(|b| !b.is_empty());
        out.push(g);
    }
    out
}

#[cfg(not(windows))]
pub fn detect() -> Vec<Game> {
    vec![]
}

/// GOG Galaxy est-il installé ? (sa base reste sur le disque après une désinstallation)
pub fn galaxy_installed() -> bool {
    #[cfg(windows)]
    {
        use super::registry::{reg_str, HKLM};
        reg_str(HKLM, r"SOFTWARE\WOW6432Node\GOG.com\GalaxyClient\paths", "client")
            .is_some_and(|d| std::path::Path::new(&d).join("GalaxyClient.exe").is_file())
    }
    #[cfg(not(windows))]
    {
        super::mac_app("GOG Galaxy")
    }
}

/// Jeux GOG du compte GOG Galaxy (le scan retire ensuite ceux qui sont installés).
/// Galaxy 2 garde la bibliothèque dans `galaxy-2.0.db` (aussi sous macOS, dans /Users/Shared).
pub fn owned() -> Vec<Game> {
    let db = super::stats::galaxy_db();
    if !galaxy_installed() || !db.is_file() {
        return vec![];
    }
    match read_owned(&db) {
        Ok(v) => v,
        Err(e) => {
            log::warn!("GOG Galaxy : bibliothèque illisible ({e})");
            vec![]
        }
    }
}

fn read_owned(db: &std::path::Path) -> rusqlite::Result<Vec<Game>> {
    use std::collections::{HashMap, HashSet};
    let conn = super::stats::open_galaxy(db)?;
    // Tables facultatives selon la version de Galaxy : absentes = pas de filtre.
    let keys = |sql: &str| -> Option<HashSet<String>> {
        let mut st = conn.prepare(sql).ok()?;
        let rows = st.query_map([], |r| r.get::<_, String>(0)).ok()?;
        Some(rows.flatten().collect())
    };
    let library = keys("SELECT releaseKey FROM LibraryReleases").filter(|s| !s.is_empty());
    let dlc = keys("SELECT releaseKey FROM ReleaseProperties WHERE isDlc = 1").unwrap_or_default();
    let mut st = conn.prepare(
        "SELECT p.releaseKey, p.value FROM GamePieces p JOIN GamePieceTypes t ON t.id = p.gamePieceTypeId \
         WHERE t.type = 'title'",
    )?;
    let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    let mut titles: HashMap<String, String> = HashMap::new();
    for (key, value) in rows.flatten() {
        if let Some(t) = title_of(&value) {
            titles.insert(key, t);
        }
    }
    Ok(titles
        .into_iter()
        .filter(|(k, _)| !dlc.contains(k) && library.as_ref().is_none_or(|l| l.contains(k)))
        .filter_map(|(k, name)| owned_game(&k, name))
        .collect())
}

/// Valeur d'une pièce `title` : `{"title":"..."}`.
fn title_of(value: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(value).ok()?;
    v.get("title")?.as_str().map(str::trim).filter(|t| !t.is_empty()).map(String::from)
}

/// `gog_<id>` -> jeu à installer via Galaxy ; les autres plateformes (steam_, epic_...) sont ignorées.
fn owned_game(release_key: &str, name: String) -> Option<Game> {
    let id = release_key.strip_prefix("gog_").filter(|id| id.chars().all(|c| c.is_ascii_digit()))?;
    let mut g = Game::new(format!("gog:{id}"), name, "gog", crate::model::uri(format!("goggalaxy://openGameView/{id}")));
    g.not_installed = true;
    Some(g)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bibliotheque_galaxy() {
        let d = tempfile::tempdir().unwrap();
        let db = d.path().join("galaxy-2.0.db");
        let c = rusqlite::Connection::open(&db).unwrap();
        c.execute_batch(
            r#"CREATE TABLE GamePieceTypes (id INTEGER, type TEXT);
               CREATE TABLE GamePieces (releaseKey TEXT, gamePieceTypeId INTEGER, userId INTEGER, value TEXT);
               CREATE TABLE ReleaseProperties (releaseKey TEXT, isDlc INTEGER);
               INSERT INTO GamePieceTypes VALUES (1, 'title'), (2, 'meta');
               INSERT INTO GamePieces VALUES ('gog_1207658924', 1, 1, '{"title":"The Witcher 3"}'),
                 ('gog_1207658924', 2, 1, '{"x":1}'), ('gog_2', 1, 1, '{"title":"Un DLC"}'),
                 ('steam_620', 1, 1, '{"title":"Portal 2"}'), ('gog_3', 1, 1, 'pas du json');
               INSERT INTO ReleaseProperties VALUES ('gog_1207658924', 0), ('gog_2', 1);"#,
        )
        .unwrap();
        drop(c);
        let games = read_owned(&db).unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].id, "gog:1207658924");
        assert_eq!(games[0].name, "The Witcher 3");
        assert_eq!(games[0].launch.target, "goggalaxy://openGameView/1207658924");
        assert!(games[0].not_installed);
    }
}
