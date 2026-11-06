//! Mises à jour disponibles hors Steam (Steam l'écrit dans ses manifestes, lu par le scanner).
//! - Epic : dernière version de chaque jeu (`assets`), lue avec le compte connecté pendant sa synchro.
//! - GOG : liste publique des versions d'un jeu (`content-system.gog.com`), sans compte.
//!
//! Une version locale inconnue du service ne compte jamais comme une mise à jour.

use super::{safe_id, Http};
use crate::model::Game;
use serde_json::Value;
use std::collections::HashMap;

/// Dernière version publiée par Epic : AppName -> buildVersion.
pub fn epic_assets(v: &Value) -> HashMap<String, String> {
    v.as_array()
        .into_iter()
        .flatten()
        .filter_map(|a| {
            let s = |k: &str| a.get(k).and_then(|x| x.as_str()).filter(|x| !x.is_empty()).map(String::from);
            Some((s("appName")?, s("buildVersion")?))
        })
        .collect()
}

pub fn epic_url() -> String {
    let platform = if cfg!(target_os = "macos") { "Mac" } else { "Windows" };
    format!("https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/public/assets/{platform}?label=Live")
}

/// GOG : `Some(true)` si la version installée est connue et n'est pas la plus récente de la
/// branche principale, `Some(false)` si elle est à jour, `None` si on ne la trouve pas.
pub fn gog_pending(v: &Value, local: &str) -> Option<bool> {
    let items = v.get("items")?.as_array()?;
    let id = |b: &Value| match b.get("build_id") {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    };
    if !items.iter().any(|b| id(b) == local) {
        return None;
    }
    // Dates ISO 8601 : l'ordre des chaînes est l'ordre chronologique.
    let newest = items
        .iter()
        .filter(|b| b.get("branch").is_none_or(|x| x.is_null()) && b.get("public").and_then(|x| x.as_bool()) != Some(false))
        .max_by_key(|b| b.get("date_published").and_then(|x| x.as_str()).unwrap_or(""))?;
    Some(id(newest) != local)
}

/// Vérifie les jeux GOG installés dont la version est connue. Renvoie id du jeu -> à mettre à jour.
pub fn check_gog(http: &Http, games: &[Game]) -> HashMap<String, bool> {
    let os = if cfg!(target_os = "macos") { "osx" } else { "windows" };
    let mut out = HashMap::new();
    for g in games.iter().filter(|g| g.store == "gog" && !g.not_installed).take(300) {
        let (Some(pid), Some(local)) = (g.id.strip_prefix("gog:"), g.version.as_deref()) else { continue };
        if !pid.bytes().all(|b| b.is_ascii_digit()) || !safe_id(pid, 20) {
            continue;
        }
        let found = [2, 1].iter().find_map(|gen| {
            let url = format!("https://content-system.gog.com/products/{pid}/os/{os}/builds?generation={gen}");
            match http.get(&url, None) {
                Ok(v) => gog_pending(&v, local),
                Err(e) => {
                    log::debug!("GOG : versions de {pid} indisponibles ({e})");
                    None
                }
            }
        });
        if let Some(p) = found {
            out.insert(g.id.clone(), p);
        }
    }
    out
}

/// Marque les jeux installés dont une version plus récente existe.
pub fn apply(games: &mut [Game], epic: &HashMap<String, String>, gog: &HashMap<String, bool>) {
    for g in games.iter_mut().filter(|g| !g.not_installed && !g.update_pending) {
        g.update_pending = match g.store.as_str() {
            "epic" => g
                .id
                .strip_prefix("epic:")
                .and_then(|app| epic.get(app))
                .zip(g.version.as_deref())
                .is_some_and(|(latest, local)| latest != local),
            "gog" => gog.get(&g.id).copied().unwrap_or(false),
            _ => false,
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{uri, Game};
    use serde_json::json;

    #[test]
    fn epic_derniere_version() {
        let v = json!([
            {"appName": "Fortnite", "labelName": "Live", "buildVersion": "++Fortnite+Release-44.00-CL-1-Windows"},
            {"appName": "Ovenbird", "buildVersion": ""},
            {"buildVersion": "x"}
        ]);
        let m = epic_assets(&v);
        assert_eq!(m.len(), 1);
        let mut f = Game::new("epic:Fortnite".into(), "Fortnite".into(), "epic", uri("x"));
        f.version = Some("++Fortnite+Release-43.00-CL-59596594-Windows".into());
        let mut o = Game::new("epic:Ovenbird".into(), "Surviving Mars".into(), "epic", uri("x"));
        o.version = Some("1.5".into());
        let mut gs = vec![f, o];
        apply(&mut gs, &m, &HashMap::new());
        assert!(gs[0].update_pending);
        assert!(!gs[1].update_pending, "version distante inconnue");
    }

    #[test]
    fn gog_versions() {
        let v = json!({"items": [
            {"build_id": "300", "branch": null, "public": true, "date_published": "2026-10-01T10:00:00+0000"},
            {"build_id": "250", "branch": "beta", "public": true, "date_published": "2026-11-01T10:00:00+0000"},
            {"build_id": "200", "branch": null, "public": true, "date_published": "2026-05-01T10:00:00+0000"}
        ]});
        assert_eq!(gog_pending(&v, "200"), Some(true));
        assert_eq!(gog_pending(&v, "300"), Some(false));
        assert_eq!(gog_pending(&v, "999"), None, "version locale inconnue");
        let mut g = Game::new("gog:1".into(), "Jeu".into(), "gog", uri("x"));
        let mut gs = vec![g.clone()];
        apply(&mut gs, &HashMap::new(), &HashMap::from([("gog:1".to_string(), true)]));
        assert!(gs[0].update_pending);
        g.not_installed = true;
        let mut gs = vec![g];
        apply(&mut gs, &HashMap::new(), &HashMap::from([("gog:1".to_string(), true)]));
        assert!(!gs[0].update_pending);
    }
}
