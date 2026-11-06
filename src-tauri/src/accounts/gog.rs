//! GOG : connexion OAuth sur la page officielle (identifiants publics du client GOG Galaxy,
//! comme Heroic et lgogdownloader), puis la liste des jeux du compte.

use super::{enc, safe_id, Fetched, Http};
use crate::model::{uri, Game};
use serde_json::Value;

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
    Ok(Fetched { user, games, secret: Some(refresh), ..Default::default() })
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
                { "id": 1207658924, "title": "The Witcher 3", "isGame": true },
                { "id": 5, "title": "Un film", "isGame": false },
                { "id": 6, "title": "" }
            ] }"#,
        )
        .unwrap();
        let g = parse_products(&v);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].id, "gog:1207658924");
        assert_eq!(g[0].launch.target, "goggalaxy://openGameView/1207658924");
    }
}
