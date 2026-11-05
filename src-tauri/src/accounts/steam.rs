//! Steam : clé d'API Web personnelle + identifiant du compte lu sur l'appareil (`loginusers.vdf`).
//! API officielle `IPlayerService/GetOwnedGames` : tous les jeux du compte, avec le temps de jeu.

use super::{Fetched, Http};
use crate::model::{uri, Game};
use serde_json::Value;

/// Clé d'API Web Steam : 32 caractères hexadécimaux.
pub fn valid_key(k: &str) -> bool {
    k.len() == 32 && k.bytes().all(|b| b.is_ascii_hexdigit())
}

/// SteamID 64 bits du dernier compte utilisé sur cet appareil.
fn steam_id64() -> Option<u64> {
    let root = crate::scanner::steam::steam_root()?;
    let t = std::fs::read_to_string(root.join("config").join("loginusers.vdf")).ok()?;
    crate::scanner::stats::most_recent_account(&t).map(|acc| acc + crate::scanner::stats::STEAM_ID64_BASE)
}

pub fn fetch(http: &Http, key: &str) -> Result<Fetched, String> {
    let id = steam_id64().ok_or("Ouvre Steam une fois sur cet appareil avec ton compte, puis réessaie.")?;
    let url = format!(
        "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key={key}&steamid={id}&include_appinfo=1&include_played_free_games=1&format=json"
    );
    let v = http.get(&url, None)?;
    Ok(Fetched { user: None, games: parse_owned(&v), secret: None })
}

pub fn parse_owned(v: &Value) -> Vec<Game> {
    let games = v.pointer("/response/games").and_then(|g| g.as_array()).cloned().unwrap_or_default();
    games
        .iter()
        .filter_map(|g| {
            let id = u32::try_from(g.get("appid")?.as_u64()?).ok()?;
            let name = g.get("name")?.as_str()?.trim().to_string();
            if name.is_empty() || crate::scanner::steam::ignored(&name) {
                return None;
            }
            let mut out = Game::new(format!("steam:{id}"), name, "steam", uri(format!("steam://install/{id}")));
            out.steam_app_id = Some(id);
            out.not_installed = true;
            out.store_play_ms = g.get("playtime_forever").and_then(|m| m.as_u64()).filter(|m| *m > 0).map(|m| m * 60_000);
            out.store_last_played =
                g.get("rtime_last_played").and_then(|s| s.as_u64()).filter(|s| *s > 0).map(|s| s * 1000);
            Some(out)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cle() {
        assert!(valid_key("0123456789ABCDEFabcdef0123456789"));
        assert!(!valid_key("0123456789ABCDEF"));
        assert!(!valid_key("0123456789ABCDEFabcdef012345678Z"));
        assert!(!valid_key("0123456789ABCDEFabcdef01234567&x"));
    }

    #[test]
    fn jeux_possedes() {
        let v: Value = serde_json::from_str(
            r#"{ "response": { "game_count": 3, "games": [
                { "appid": 620, "name": "Portal 2", "playtime_forever": 214, "rtime_last_played": 1788704306 },
                { "appid": 570, "name": "Dota 2", "playtime_forever": 0 },
                { "appid": 1, "name": "Jeu - Soundtrack" }
            ] } }"#,
        )
        .unwrap();
        let g = parse_owned(&v);
        assert_eq!(g.len(), 2);
        assert_eq!(g[0].id, "steam:620");
        assert_eq!(g[0].launch.target, "steam://install/620");
        assert_eq!(g[0].store_play_ms, Some(214 * 60_000));
        assert_eq!(g[0].store_last_played, Some(1_788_704_306_000));
        assert_eq!(g[1].store_play_ms, None);
        assert!(parse_owned(&serde_json::json!({ "response": {} })).is_empty());
    }
}
