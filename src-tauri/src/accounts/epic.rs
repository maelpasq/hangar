//! Epic Games : connexion sur la page officielle (identifiants publics du client du launcher
//! Epic, comme Legendary et Heroic), puis la bibliothèque du compte et son catalogue.

use super::{enc, safe_id, Fetched, Http};
use crate::scanner::epic::{games_from_items, CatItem};
use base64::Engine;
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};

const CLIENT_ID: &str = "34a02cf8f4414e29b15921876da36f9a";
// Secret public du client du launcher Epic (le même dans tous les outils libres) : pas un secret de Hangar.
const CLIENT_SECRET: &str = "daafbccc737745039dffe53d94fc76cf";
const TOKEN_URL: &str = "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token";
const REDIRECT_API: &str = "https://www.epicgames.com/id/api/redirect";

pub fn login_url() -> String {
    let redirect = format!("{REDIRECT_API}?clientId={CLIENT_ID}&responseType=code");
    format!("https://www.epicgames.com/id/login?redirectUrl={}", enc(&redirect))
}

/// Injecté dans la fenêtre de connexion : la page de retour d'Epic affiche le code en JSON ;
/// le script le transmet par une navigation vers une adresse réservée (.invalid) que Rust
/// intercepte et annule. Aucune IPC n'est ouverte à la page.
pub const CAPTURE_SCRIPT: &str = r#"(function () {
  if (location.origin !== 'https://www.epicgames.com' || location.pathname !== '/id/api/redirect') return;
  document.addEventListener('DOMContentLoaded', function () {
    try {
      var j = JSON.parse(document.body.innerText);
      if (j && typeof j.authorizationCode === 'string') {
        location.replace('https://hangar.invalid/epic?code=' + encodeURIComponent(j.authorizationCode));
      }
    } catch (e) {}
  });
})();"#;

pub fn capture(u: &tauri::Url) -> Option<String> {
    if u.scheme() != "https" || u.host_str() != Some("hangar.invalid") || u.path() != "/epic" {
        return None;
    }
    u.query_pairs().find(|(k, _)| k == "code").map(|(_, v)| v.into_owned()).filter(|c| safe_id(c, 256))
}

fn basic() -> String {
    base64::engine::general_purpose::STANDARD.encode(format!("{CLIENT_ID}:{CLIENT_SECRET}"))
}

struct Tokens {
    access: String,
    refresh: String,
    user: Option<String>,
}

fn tokens(http: &Http, form: &[(&str, &str)]) -> Result<Tokens, String> {
    let v = http.post_form(TOKEN_URL, Some(&basic()), form)?;
    let s = |k: &str| v.get(k).and_then(|x| x.as_str()).map(String::from);
    match (s("access_token"), s("refresh_token")) {
        (Some(access), Some(refresh)) => Ok(Tokens { access, refresh, user: s("displayName") }),
        _ => Err("Epic n'a pas accepté la connexion, réessaie.".into()),
    }
}

pub fn exchange(http: &Http, code: &str) -> Result<String, String> {
    tokens(http, &[("grant_type", "authorization_code"), ("code", code), ("token_type", "eg1")]).map(|t| t.refresh)
}

pub fn fetch(http: &Http, refresh: &str) -> Result<Fetched, String> {
    let t = tokens(http, &[("grant_type", "refresh_token"), ("refresh_token", refresh), ("token_type", "eg1")])?;
    // 1. Bibliothèque : identifiants catalogue par namespace (pages de 100 environ).
    let mut by_ns: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut cursor: Option<String> = None;
    for _ in 0..100 {
        let mut url = "https://library-service.live.use1a.on.epicgames.com/library/api/public/items?includeMetadata=true".to_string();
        if let Some(c) = &cursor {
            url.push_str(&format!("&cursor={}", enc(c)));
        }
        let v = http.get(&url, Some(&t.access))?;
        collect_records(&v, &mut by_ns);
        cursor = v.pointer("/responseMetadata/nextCursor").and_then(|c| c.as_str()).map(String::from);
        if cursor.is_none() {
            break;
        }
    }
    // 2. Catalogue : titre, catégories et DLC, par lots de 50 identifiants.
    let mut items: Vec<CatItem> = vec![];
    for (ns, ids) in by_ns.iter().take(1000) {
        for chunk in ids.chunks(50) {
            let url = format!(
                "https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/{ns}/bulk/items?id={}&includeDLCDetails=true&includeMainGameDetails=true&country=FR&locale=fr",
                chunk.join(",")
            );
            match http.get(&url, Some(&t.access)) {
                Ok(v) => items.extend(serde_json::from_value::<HashMap<String, CatItem>>(v).unwrap_or_default().into_values()),
                Err(e) => log::debug!("Epic : catalogue {ns} indisponible ({e})"),
            }
        }
    }
    // 3. Dernière version de chaque jeu, pour signaler les mises à jour.
    let latest = match http.get(&super::updates::epic_url(), Some(&t.access)) {
        Ok(v) => super::updates::epic_assets(&v),
        Err(e) => {
            log::debug!("Epic : versions indisponibles ({e})");
            HashMap::new()
        }
    };
    Ok(Fetched { user: t.user, games: games_from_items(items), secret: Some(t.refresh), latest })
}

/// Entrées de la bibliothèque : on ignore les contenus Unreal Engine (`ue`) et tout identifiant
/// qui ne peut pas entrer tel quel dans une URL.
fn collect_records(v: &Value, by_ns: &mut BTreeMap<String, Vec<String>>) {
    for r in v.get("records").and_then(|r| r.as_array()).into_iter().flatten() {
        let (Some(ns), Some(id)) = (r.get("namespace").and_then(|x| x.as_str()), r.get("catalogItemId").and_then(|x| x.as_str()))
        else {
            continue;
        };
        if ns == "ue" || !safe_id(ns, 128) || !safe_id(id, 128) {
            continue;
        }
        let ids = by_ns.entry(ns.to_string()).or_default();
        if !ids.iter().any(|x| x == id) {
            ids.push(id.to_string());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_de_retour() {
        let ok = tauri::Url::parse("https://hangar.invalid/epic?code=0123abcd").unwrap();
        assert_eq!(capture(&ok), Some("0123abcd".into()));
        for bad in [
            "https://www.epicgames.com/epic?code=x",
            "http://hangar.invalid/epic?code=x",
            "https://hangar.invalid/autre?code=x",
            "https://hangar.invalid/epic?code=%22%3E",
        ] {
            assert_eq!(capture(&tauri::Url::parse(bad).unwrap()), None, "{bad}");
        }
        assert!(login_url().starts_with("https://www.epicgames.com/id/login?redirectUrl=https%3A%2F%2Fwww.epicgames.com"));
    }

    #[test]
    fn bibliotheque() {
        let v: Value = serde_json::from_str(
            r#"{ "records": [
                { "namespace": "calluna", "catalogItemId": "cid1", "appName": "Calluna" },
                { "namespace": "calluna", "catalogItemId": "cid1", "appName": "Calluna" },
                { "namespace": "ue", "catalogItemId": "asset", "appName": "x" },
                { "namespace": "../x", "catalogItemId": "y" },
                { "namespace": "fn", "catalogItemId": "cid2" }
            ], "responseMetadata": {} }"#,
        )
        .unwrap();
        let mut m = BTreeMap::new();
        collect_records(&v, &mut m);
        assert_eq!(m.len(), 2);
        assert_eq!(m["calluna"], vec!["cid1".to_string()]);
    }
}
