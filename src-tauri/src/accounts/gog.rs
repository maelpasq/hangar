//! GOG : connexion OAuth sur la page officielle (identifiants publics du client GOG Galaxy,
//! comme Heroic et lgogdownloader), puis la liste des jeux du compte.

use super::{enc, safe_id, Fetched, Http};
use crate::model::{uri, Game};
use serde_json::Value;
use std::collections::HashMap;

const CLIENT_ID: &str = "46899977096215655";
// Secret public du client GOG Galaxy (le même dans tous les outils libres) : pas un secret de Hangar.
const CLIENT_SECRET: &str = "9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9";
const REDIRECT: &str = "https://embed.gog.com/on_login_success?origin=client";

pub fn login_url() -> String {
    format!(
        "https://auth.gog.com/auth?client_id={CLIENT_ID}&redirect_uri={}&response_type=code&layout=client2",
        enc(REDIRECT)
    )
}

/// Code d'autorisation dans l'adresse de retour `embed.gog.com/on_login_success?code=...`.
pub fn capture(u: &tauri::Url) -> Option<String> {
    if u.scheme() != "https" || u.host_str() != Some("embed.gog.com") || u.path() != "/on_login_success" {
        return None;
    }
    u.query_pairs().find(|(k, _)| k == "code").map(|(_, v)| v.into_owned()).filter(|c| safe_id(c, 1024))
}

/// Jetons (accès, rafraîchissement) pour un code d'autorisation ou un jeton de rafraîchissement.
fn tokens(http: &Http, grant: &str) -> Result<(String, String), String> {
    let url = format!("https://auth.gog.com/token?client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}&{grant}");
    let v = http.get(&url, None)?;
    let s = |k: &str| v.get(k).and_then(|x| x.as_str()).map(String::from);
    match (s("access_token"), s("refresh_token")) {
        (Some(a), Some(r)) => Ok((a, r)),
        _ => Err("GOG n'a pas accepté la connexion, réessaie.".into()),
    }
}

/// Code d'autorisation -> jeton de rafraîchissement (le seul gardé, dans le coffre du système).
pub fn exchange(http: &Http, code: &str) -> Result<String, String> {
    let grant = format!("grant_type=authorization_code&code={}&redirect_uri={}", enc(code), enc(REDIRECT));
    tokens(http, &grant).map(|(_, r)| r)
}

pub fn fetch(http: &Http, refresh: &str) -> Result<Fetched, String> {
    let (access, refresh) = tokens(http, &format!("grant_type=refresh_token&refresh_token={}", enc(refresh)))?;
    let user = http
        .get("https://embed.gog.com/userData.json", Some(&access))
        .ok()
        .and_then(|v| v.get("username").and_then(|u| u.as_str()).map(String::from));
    let mut games = vec![];
    let mut page = 1;
    loop {
        let url = format!("https://embed.gog.com/account/getFilteredProducts?mediaType=1&page={page}");
        let v = http.get(&url, Some(&access))?;
        games.extend(parse_products(&v));
        let total = v.get("totalPages").and_then(|t| t.as_u64()).unwrap_or(1);
        page += 1;
        if page > total || page > 100 {
            break;
        }
    }
    // Temps de jeu et dernière session, depuis la page de statistiques du profil.
    if let Some(name) = user.as_deref().filter(|u| safe_id(u, 64)) {
        let times = stats(http, &access, name);
        log::info!("GOG : temps de jeu de {} jeu(x)", times.len());
        apply_stats(&mut games, &times);
    }
    Ok(Fetched { user, games, secret: Some(refresh), ..Default::default() })
}

/// Pages de `u/<pseudo>/games/stats` (comme Playnite). Une erreur donne ce qui a déjà été lu.
fn stats(http: &Http, access: &str, name: &str) -> HashMap<String, (u64, Option<u64>)> {
    let mut out = HashMap::new();
    for page in 1..=100 {
        let url = format!("https://embed.gog.com/u/{name}/games/stats?sort=recent_playtime&order=desc&page={page}");
        let v = match http.get(&url, Some(access)) {
            Ok(v) => v,
            Err(e) => {
                log::info!("GOG : statistiques indisponibles ({e})");
                break;
            }
        };
        out.extend(parse_stats(&v));
        if page >= v.get("pages").and_then(|p| p.as_u64()).unwrap_or(1) {
            break;
        }
    }
    out
}

/// Id du jeu -> (temps de jeu en ms, dernière session en ms). `stats` est un objet par compte
/// quand le jeu a été joué, un tableau vide sinon. `playtime` est en minutes.
fn parse_stats(v: &Value) -> HashMap<String, (u64, Option<u64>)> {
    let mut out = HashMap::new();
    for it in v.pointer("/_embedded/items").and_then(|i| i.as_array()).into_iter().flatten() {
        let id = match it.pointer("/game/id") {
            Some(Value::String(s)) => s.clone(),
            Some(Value::Number(n)) => n.to_string(),
            _ => continue,
        };
        let Some(st) = it.get("stats").and_then(|s| s.as_object()).and_then(|m| m.values().next()) else { continue };
        let ms = st.get("playtime").and_then(|p| p.as_u64()).unwrap_or(0) * 60_000;
        let last = st.get("lastSession").and_then(|l| l.as_str()).and_then(crate::scanner::stats::parse_date);
        if ms > 0 || last.is_some() {
            out.insert(id, (ms, last));
        }
    }
    out
}

/// Reporte les statistiques sur les jeux du compte (id `gog:<id>`).
fn apply_stats(games: &mut [Game], times: &HashMap<String, (u64, Option<u64>)>) {
    for g in games {
        if let Some((ms, last)) = g.id.strip_prefix("gog:").and_then(|id| times.get(id)) {
            g.store_play_ms = Some(*ms).filter(|m| *m > 0);
            g.store_last_played = *last;
        }
    }
}

pub fn parse_products(v: &Value) -> Vec<Game> {
    let list = v.get("products").and_then(|p| p.as_array()).cloned().unwrap_or_default();
    list.iter()
        .filter(|p| p.get("isGame").and_then(|g| g.as_bool()) != Some(false))
        .filter_map(|p| {
            let id = p.get("id")?.as_u64()?;
            let title = p.get("title")?.as_str()?.trim().to_string();
            if title.is_empty() {
                return None;
            }
            let mut g = Game::new(format!("gog:{id}"), title, "gog", uri(format!("goggalaxy://openGameView/{id}")));
            g.not_installed = true;
            g.linux = p.pointer("/worksOn/Linux").and_then(|l| l.as_bool()) == Some(true);
            Some(g)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_de_retour() {
        let ok = tauri::Url::parse("https://embed.gog.com/on_login_success?origin=client&code=AbC-12_x").unwrap();
        assert_eq!(capture(&ok), Some("AbC-12_x".into()));
        for bad in [
            "https://embed.gog.com.evil.io/on_login_success?code=x",
            "http://embed.gog.com/on_login_success?code=x",
            "https://embed.gog.com/autre?code=x",
            "https://embed.gog.com/on_login_success?code=a%26b",
            "https://embed.gog.com/on_login_success",
        ] {
            assert_eq!(capture(&tauri::Url::parse(bad).unwrap()), None, "{bad}");
        }
        assert!(login_url().starts_with("https://auth.gog.com/auth?client_id="));
    }

    #[test]
    fn produits() {
        let v: Value = serde_json::from_str(
            r#"{ "totalPages": 1, "products": [
                { "id": 1207658924, "title": "The Witcher 3", "isGame": true, "worksOn": { "Windows": true, "Linux": false } },
                { "id": 1, "title": "Stardew Valley", "worksOn": { "Windows": true, "Linux": true } },
                { "id": 5, "title": "Un film", "isGame": false },
                { "id": 6, "title": "" }
            ] }"#,
        )
        .unwrap();
        let g = parse_products(&v);
        assert_eq!(g.len(), 2);
        assert_eq!(g[0].id, "gog:1207658924");
        assert_eq!(g[0].launch.target, "goggalaxy://openGameView/1207658924");
        assert_eq!((g[0].linux, g[1].linux), (false, true));
    }

    #[test]
    fn statistiques() {
        let v: Value = serde_json::from_str(
            r#"{ "pages": 1, "_embedded": { "items": [
                { "game": { "id": "1207658924" }, "stats": { "4800": { "playtime": 90, "lastSession": "2026-11-01T20:30:00+00:00" } } },
                { "game": { "id": 1 }, "stats": [] },
                { "game": { "id": 2 }, "stats": { "4800": { "playtime": 0, "lastSession": null } } },
                { "stats": { "4800": { "playtime": 5 } } }
            ] } }"#,
        )
        .unwrap();
        let t = parse_stats(&v);
        assert_eq!(t.len(), 1);
        let mut games = parse_products(&serde_json::json!({ "products": [
            { "id": 1207658924, "title": "The Witcher 3" }, { "id": 1, "title": "Stardew Valley" }
        ] }));
        apply_stats(&mut games, &t);
        assert_eq!(games[0].store_play_ms, Some(90 * 60_000));
        assert_eq!(games[0].store_last_played, crate::scanner::stats::parse_date("2026-11-01 20:30:00"));
        assert_eq!(games[1].store_play_ms, None);
        assert!(parse_stats(&serde_json::json!([])).is_empty());
    }
}
