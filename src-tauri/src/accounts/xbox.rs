//! Xbox (Windows) : connexion Microsoft avec l'application Microsoft de Hangar, par un code à
//! saisir sur microsoft.com/link, puis l'historique des jeux PC du compte et leur temps de jeu.
//!
//! Jetons : compte Microsoft -> jeton utilisateur Xbox Live -> jeton XSTS, envoyé en
//! `XBL3.0 x=<uhs>;<jeton>` aux services Xbox. Seul le jeton de rafraîchissement Microsoft est
//! gardé, dans le coffre du système.
//!
//! Pourquoi pas la fenêtre de connexion de GOG / Epic : les identifiants publics des apps Xbox
//! demandent désormais des requêtes signées par l'appareil (Xbox Live répond 403), et l'app de
//! Hangar n'a pas d'adresse de retour enregistrée ; le code à saisir marche sans.

use super::{lock, Fetched, Http};
use crate::model::{uri, Game};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Application Microsoft de Hangar (client public), fixée au build (`HANGAR_MS_CLIENT_ID`, secret
/// GitHub), jamais dans le dépôt. Absente : la connexion Xbox n'est pas proposée.
const CLIENT_ID: Option<&str> = option_env!("HANGAR_MS_CLIENT_ID");
const SCOPE: &str = "XboxLive.signin offline_access";
const DEVICE: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const TOKEN: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const XBL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const OFFLINE: &str = "Service injoignable, vérifie ta connexion.";

/// Code à saisir, envoyé au frontend.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCode {
    pub user_code: String,
    pub url: String,
}

struct Pending {
    device_code: String,
    interval: Duration,
    until: Instant,
}

static PENDING: Mutex<Option<Pending>> = Mutex::new(None);

fn client_id() -> Option<&'static str> {
    CLIENT_ID.map(str::trim).filter(|c| c.len() == 36 && c.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-'))
}

/// Connexion Xbox possible dans cette version (Windows, application Microsoft fixée au build).
pub fn available() -> bool {
    cfg!(windows) && client_id().is_some()
}

const UNAVAILABLE: &str = "La connexion Xbox n'est pas disponible dans cette version de Hangar.";

/// Étape 1 : demande un code à saisir sur microsoft.com/link.
pub fn start(http: &Http) -> Result<DeviceCode, String> {
    let id = client_id().ok_or(UNAVAILABLE)?;
    let r = http.post_raw(DEVICE, &[("client_id", id), ("scope", SCOPE)], None).map_err(|(c, b)| {
        log::warn!("Xbox : code refusé ({c} {})", b["error"].as_str().unwrap_or(""));
        "Connexion Microsoft impossible pour l'instant, réessaie plus tard.".to_string()
    })?;
    let (Some(device_code), Some(user_code)) = (r["device_code"].as_str(), r["user_code"].as_str()) else {
        return Err("Réponse illisible de Microsoft.".into());
    };
    *lock(&PENDING) = Some(Pending {
        device_code: device_code.into(),
        interval: Duration::from_secs(r["interval"].as_u64().unwrap_or(5).clamp(1, 30)),
        until: Instant::now() + Duration::from_secs(r["expires_in"].as_u64().unwrap_or(900).min(1800)),
    });
    log::info!("Xbox : code de connexion demandé");
    Ok(DeviceCode { user_code: user_code.into(), url: "https://www.microsoft.com/link".into() })
}

/// Abandonne l'attente (l'étape 2 s'arrête au prochain tour).
pub fn cancel() {
    *lock(&PENDING) = None;
}

/// Étape 2 : attend que le code soit saisi. Renvoie le jeton de rafraîchissement.
pub fn wait(http: &Http) -> Result<String, String> {
    let id = client_id().ok_or(UNAVAILABLE)?;
    loop {
        let (code, mut wait) = match lock(&PENDING).as_ref() {
            Some(p) if Instant::now() < p.until => (p.device_code.clone(), p.interval),
            Some(_) => return Err("Le code a expiré : recommence la connexion.".into()),
            None => return Err("Connexion annulée.".into()),
        };
        std::thread::sleep(wait);
        if lock(&PENDING).as_ref().map(|p| &p.device_code) != Some(&code) {
            return Err("Connexion annulée.".into());
        }
        let grant = "urn:ietf:params:oauth:grant-type:device_code";
        match http.post_raw(TOKEN, &[("grant_type", grant), ("client_id", id), ("device_code", &code)], None) {
            Ok(t) => {
                *lock(&PENDING) = None;
                return t["refresh_token"].as_str().map(String::from).ok_or_else(|| "Réponse illisible de Microsoft.".into());
            }
            Err((400, e)) => match e["error"].as_str() {
                Some("authorization_pending") => {}
                Some("slow_down") => {
                    wait += Duration::from_secs(5);
                    if let Some(p) = lock(&PENDING).as_mut() {
                        p.interval = wait;
                    }
                }
                Some("authorization_declined") => {
                    *lock(&PENDING) = None;
                    return Err("Connexion refusée sur la page Microsoft.".into());
                }
                other => {
                    log::warn!("Xbox : attente arrêtée ({})", other.unwrap_or(""));
                    *lock(&PENDING) = None;
                    return Err("Le code a expiré : recommence la connexion.".into());
                }
            },
            Err((0, _)) => return Err(OFFLINE.into()),
            Err((c, _)) => {
                *lock(&PENDING) = None;
                return Err(format!("Microsoft a répondu une erreur {c}, réessaie plus tard."));
            }
        }
    }
}

/// Jeton de rafraîchissement -> (accès, nouveau jeton de rafraîchissement).
fn tokens(http: &Http, refresh: &str) -> Result<(String, String), String> {
    let id = client_id().ok_or(UNAVAILABLE)?;
    let form = [("grant_type", "refresh_token"), ("client_id", id), ("refresh_token", refresh), ("scope", SCOPE)];
    let t = http.post_raw(TOKEN, &form, None).map_err(|(c, b)| match c {
        0 => OFFLINE.to_string(),
        _ => {
            log::warn!("Xbox : jeton Microsoft refusé ({c} {})", b["error"].as_str().unwrap_or(""));
            "Ta connexion Microsoft a expiré : reconnecte le compte Xbox.".to_string()
        }
    })?;
    match (t["access_token"].as_str(), t["refresh_token"].as_str()) {
        (Some(a), Some(r)) => Ok((a.into(), r.into())),
        _ => Err("Réponse illisible de Microsoft.".into()),
    }
}

/// Session Xbox Live : en-tête d'autorisation, identifiant du joueur (xuid) et pseudo.
struct Session {
    auth: String,
    xuid: String,
    gamertag: Option<String>,
}

fn xsts_error(code: Option<u64>) -> &'static str {
    match code {
        Some(2148916233) => "Ce compte Microsoft n'a pas de profil Xbox : crée-le sur xbox.com puis réessaie.",
        Some(2148916235) => "Xbox Live n'est pas disponible dans ton pays.",
        Some(2148916236 | 2148916237) => "Ce compte doit être vérifié comme adulte sur xbox.com.",
        Some(2148916238) => "Compte enfant : un adulte doit l'ajouter à une famille Microsoft.",
        _ => "Accès refusé par Xbox Live : reconnecte le compte.",
    }
}

fn session(http: &Http, access: &str) -> Result<Session, String> {
    let body = json!({
        "Properties": { "AuthMethod": "RPS", "SiteName": "user.auth.xboxlive.com", "RpsTicket": format!("d={access}") },
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT"
    });
    let xbl = http.post_raw(XBL, &[], Some(&body)).map_err(|(c, b)| {
        log::warn!("Xbox : jeton Xbox Live refusé ({c} {})", b["XErr"]);
        match c {
            0 => OFFLINE.to_string(),
            _ => "Xbox Live n'a pas accepté la connexion : reconnecte le compte.".to_string(),
        }
    })?;
    let user = xbl["Token"].as_str().ok_or("Réponse illisible de Xbox Live.")?;
    let body = json!({
        "Properties": { "SandboxId": "RETAIL", "UserTokens": [user] },
        "RelyingParty": "http://xboxlive.com",
        "TokenType": "JWT"
    });
    let v = http.post_raw(XSTS, &[], Some(&body)).map_err(|(c, b)| {
        log::warn!("Xbox : XSTS refusé ({c} {})", b["XErr"]);
        match c {
            0 => OFFLINE.to_string(),
            401 => xsts_error(b["XErr"].as_u64()).to_string(),
            _ => format!("Xbox Live a répondu une erreur {c}, réessaie plus tard."),
        }
    })?;
    parse_session(&v).ok_or_else(|| "Réponse illisible de Xbox Live.".into())
}

fn parse_session(v: &Value) -> Option<Session> {
    let token = v.get("Token")?.as_str()?;
    let xui = v.pointer("/DisplayClaims/xui/0")?;
    let uhs = xui.get("uhs")?.as_str()?;
    let xuid = xui.get("xid")?.as_str()?;
    if !xuid.bytes().all(|b| b.is_ascii_digit()) || xuid.is_empty() || xuid.len() > 32 {
        return None;
    }
    Some(Session {
        auth: format!("XBL3.0 x={uhs};{token}"),
        xuid: xuid.to_string(),
        gamertag: xui.get("gtg").and_then(|g| g.as_str()).map(String::from),
    })
}

pub fn fetch(http: &Http, refresh: &str) -> Result<Fetched, String> {
    let (access, refresh) = tokens(http, refresh)?;
    let s = session(http, &access)?;
    let url = format!(
        "https://titlehub.xboxlive.com/users/xuid({})/titles/titlehistory/decoration/achievement,detail",
        s.xuid
    );
    let headers = [("Authorization", s.auth.as_str()), ("x-xbl-contract-version", "2"), ("Accept-Language", "fr-FR")];
    let v = http.send("GET", &url, &headers, None).inspect_err(|e| log::warn!("Xbox : historique refusé ({e})"))?;
    let Parsed { mut games, ids, mut seen } = parse_titles(&v);
    let all = v.get("titles").and_then(|t| t.as_array()).map(|t| t.len()).unwrap_or(0);
    log::info!(
        "Xbox : {all} titre(s) dans l'historique, {} jeu(x) du Microsoft Store, {} jeu(x) PC d'autres stores",
        games.len(),
        seen.len()
    );
    let wanted: Vec<String> = ids.iter().chain(seen.iter().map(|x| &x.title_id)).cloned().collect();
    let minutes = minutes_played(http, &s, &wanted);
    log::info!("Xbox : temps de jeu de {} jeu(x)", minutes.values().filter(|m| **m > 0).count());
    let ms = |tid: &String| minutes.get(tid).map(|m| m * 60_000).filter(|m| *m > 0);
    for (g, tid) in games.iter_mut().zip(&ids) {
        g.store_play_ms = ms(tid);
    }
    for x in &mut seen {
        x.play_ms = ms(&x.title_id);
    }
    Ok(Fetched { user: s.gamertag, games, secret: Some(refresh), seen, ..Default::default() })
}

/// Famille de paquet sûre (`Editeur.Jeu_8wekyb3d8bbwe`).
fn safe_pfn(s: &str) -> bool {
    !s.is_empty() && s.len() <= 128 && s.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
}

/// Jeu PC d'un autre store (Steam, Epic, Riot...) que Xbox a vu tourner (Game Bar) : il complète
/// le jeu du même nom dans la bibliothèque.
#[derive(Serialize, serde::Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Seen {
    pub name: String,
    pub title_id: String,
    pub last_played: Option<u64>,
    pub play_ms: Option<u64>,
}

pub struct Parsed {
    /// Jeux du Microsoft Store (même id que le scan : `xbox:<famille de paquet>`).
    pub games: Vec<Game>,
    /// titleId de chaque jeu de `games`.
    pub ids: Vec<String>,
    pub seen: Vec<Seen>,
}

/// Genres du Microsoft Store (toujours en anglais) en français, comme ceux de Steam.
fn genre_fr(g: &str) -> Option<&'static str> {
    Some(match g {
        "Action & adventure" => "Action et aventure",
        "Card & board" => "Cartes et plateau",
        "Casino" => "Casino",
        "Classics" => "Classiques",
        "Educational" => "Éducatif",
        "Family & kids" => "Famille",
        "Fighting" => "Combat",
        "Kinect" => "Kinect",
        "Multi-Player Online Battle Arena" => "MOBA",
        "Music" => "Musique",
        "Platformer" => "Plateforme",
        "Puzzle & trivia" => "Réflexion",
        "Racing & flying" => "Course et vol",
        "Role playing" => "Jeu de rôle",
        "Shooter" => "Tir",
        "Simulation" => "Simulation",
        "Sports" => "Sport",
        "Strategy" => "Stratégie",
        "Word" => "Lettres",
        _ => return None,
    })
}

fn text(v: Option<&Value>) -> Option<String> {
    v.and_then(|x| x.as_str()).map(str::trim).filter(|x| !x.is_empty() && x.len() < 200).map(String::from)
}

/// Succès d'un titre : rien s'il n'en a pas.
fn achievements(t: &Value) -> Option<crate::model::Achievements> {
    let a = t.get("achievement")?;
    let n = |k: &str| a.get(k).and_then(|x| x.as_u64()).and_then(|x| u32::try_from(x).ok()).unwrap_or(0);
    let (unlocked, total, gs, gs_total) =
        (n("currentAchievements"), n("totalAchievements"), n("currentGamerscore"), n("totalGamerscore"));
    (total > 0 || gs_total > 0 || unlocked > 0).then_some(crate::model::Achievements {
        unlocked,
        total,
        gamerscore: (gs_total > 0).then_some(gs),
        gamerscore_total: (gs_total > 0).then_some(gs_total),
    })
}

/// Jeux de l'historique : ceux du Microsoft Store (PC, famille de paquet) avec genre, studio,
/// éditeur, sortie et succès ; les jeux PC d'autres stores à part (`Seen`). Consoles, mobiles : écartés.
pub fn parse_titles(v: &Value) -> Parsed {
    let mut out = Parsed { games: vec![], ids: vec![], seen: vec![] };
    for t in v.get("titles").and_then(|t| t.as_array()).into_iter().flatten() {
        let s = |k: &str| t.get(k).and_then(|x| x.as_str()).unwrap_or("");
        let on = |d: &str| t.get("devices").and_then(|x| x.as_array()).is_some_and(|x| x.iter().any(|y| y.as_str() == Some(d)));
        let (pfn, name, tid) = (s("pfn"), s("name").trim(), s("titleId"));
        if s("type") != "Game" || name.is_empty() || name.len() > 200 {
            continue;
        }
        let last = t.pointer("/titleHistory/lastTimePlayed").and_then(|l| l.as_str()).and_then(crate::scanner::stats::parse_date);
        if on("PC") && safe_pfn(pfn) {
            let mut g = Game::new(format!("xbox:{pfn}"), name.to_string(), "xbox", uri(format!("ms-windows-store://pdp/?PFN={pfn}")));
            g.not_installed = true;
            g.store_last_played = last;
            let d = t.get("detail");
            let genres: Vec<&str> = d
                .and_then(|d| d.get("genres"))
                .and_then(|x| x.as_array())
                .into_iter()
                .flatten()
                .filter_map(|x| x.as_str().and_then(genre_fr))
                .take(2)
                .collect();
            g.genre = (!genres.is_empty()).then(|| genres.join(", "));
            g.developer = text(d.and_then(|d| d.get("developerName")));
            g.publisher = text(d.and_then(|d| d.get("publisherName")));
            g.released = d.and_then(|d| d.get("releaseDate")).and_then(|x| x.as_str()).and_then(crate::scanner::stats::parse_date);
            g.achievements = achievements(t);
            out.games.push(g);
            out.ids.push(tid.to_string());
        } else if on("Win32") {
            out.seen.push(Seen { name: name.to_string(), title_id: tid.to_string(), last_played: last, play_ms: None });
        }
    }
    out
}

/// Nom comparable entre stores : lettres et chiffres en minuscules (« VALORANT » = « Valorant »).
pub fn name_key(name: &str) -> String {
    name.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect()
}

/// Reporte sur les jeux des autres stores ce que Xbox a vu : dernière session et temps de jeu
/// (le plus grand des deux). Renvoie le nombre de jeux complétés.
pub fn apply_seen(games: &mut [Game], seen: &[Seen]) -> usize {
    let by_name: HashMap<String, &Seen> = seen.iter().map(|x| (name_key(&x.name), x)).filter(|(k, _)| k.len() >= 3).collect();
    let mut n = 0;
    for g in games.iter_mut().filter(|g| g.store != "xbox") {
        let Some(x) = by_name.get(&name_key(&g.name)) else { continue };
        let before = (g.store_last_played, g.store_play_ms);
        g.store_last_played = g.store_last_played.max(x.last_played);
        g.store_play_ms = g.store_play_ms.max(x.play_ms);
        if (g.store_last_played, g.store_play_ms) != before {
            n += 1;
        }
    }
    n
}

/// Minutes jouées par titleId (statistique « MinutesPlayed »). Une erreur donne ce qui a été lu.
fn minutes_played(http: &Http, s: &Session, title_ids: &[String]) -> HashMap<String, u64> {
    let ids: Vec<&String> = title_ids.iter().filter(|t| !t.is_empty() && t.bytes().all(|b| b.is_ascii_digit())).collect();
    let headers = [("Authorization", s.auth.as_str()), ("x-xbl-contract-version", "2")];
    let mut out = HashMap::new();
    for chunk in ids.chunks(50) {
        let body = json!({
            "arrangebyfield": "xuid",
            "xuids": [s.xuid],
            "stats": chunk.iter().map(|t| json!({ "name": "MinutesPlayed", "titleId": t })).collect::<Vec<_>>()
        });
        match http.send("POST", "https://userstats.xboxlive.com/batch", &headers, Some(&body)) {
            Ok(v) => out.extend(parse_minutes(&v)),
            Err(e) => {
                log::info!("Xbox : statistiques indisponibles ({e})");
                break;
            }
        }
    }
    out
}

fn parse_minutes(v: &Value) -> HashMap<String, u64> {
    let mut out = HashMap::new();
    for list in v.get("statlistscollection").and_then(|l| l.as_array()).into_iter().flatten() {
        for st in list.get("stats").and_then(|s| s.as_array()).into_iter().flatten() {
            let s = |k: &str| st.get(k).and_then(|x| x.as_str());
            let (Some(tid), Some(val)) = (s("titleid").or(s("titleId")), s("value")) else { continue };
            if let Ok(m) = val.parse::<u64>() {
                out.insert(tid.to_string(), m);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adresses_autorisees() {
        for u in [DEVICE, TOKEN, XBL, XSTS] {
            assert!(super::super::allowed(u), "{u}");
        }
        assert!(xsts_error(Some(2148916233)).contains("profil Xbox"));
    }

    #[test]
    fn session_xsts() {
        let v = json!({ "Token": "jwt", "DisplayClaims": { "xui": [{ "uhs": "123", "xid": "2535400000000000", "gtg": "Joueur" }] } });
        let s = parse_session(&v).unwrap();
        assert_eq!(s.auth, "XBL3.0 x=123;jwt");
        assert_eq!(s.gamertag.as_deref(), Some("Joueur"));
        let bad = json!({ "Token": "jwt", "DisplayClaims": { "xui": [{ "uhs": "1", "xid": "../x" }] } });
        assert!(parse_session(&bad).is_none());
    }

    #[test]
    fn historique_et_minutes() {
        let v = json!({ "titles": [
            { "titleId": "1717113201", "pfn": "Microsoft.624F8B84B80_8wekyb3d8bbwe", "name": "Forza Horizon 5", "type": "Game",
              "devices": ["XboxOne", "XboxSeries", "PC"], "titleHistory": { "lastTimePlayed": "2026-11-01T20:30:00.123Z" },
              "achievement": { "currentAchievements": 11, "totalAchievements": 0, "currentGamerscore": 160, "totalGamerscore": 2980 },
              "detail": { "genres": ["Racing & flying", "Inconnu", "Action & adventure", "Sports"], "developerName": "Playground Games",
                          "publisherName": "", "releaseDate": "2021-11-09T00:00:00Z" } },
            { "titleId": "2", "pfn": "Console.Only_x", "name": "Console", "type": "Game", "devices": ["XboxOne"] },
            { "titleId": "3", "pfn": null, "name": "VALORANT", "type": "Game", "devices": ["Win32"],
              "titleHistory": { "lastTimePlayed": "2021-05-22T14:00:41Z" } },
            { "titleId": "4", "pfn": "Microsoft.App_x", "name": "Une app", "type": "App", "devices": ["PC"] },
            { "titleId": "5", "pfn": "../x", "name": "Piège", "type": "Game", "devices": ["PC"] },
            { "titleId": "6", "pfn": null, "name": "Minecraft pour Android", "type": "Game", "devices": ["Android"] }
        ] });
        let Parsed { games, ids, seen } = parse_titles(&v);
        assert_eq!(games.len(), 1);
        let g = &games[0];
        assert_eq!(g.id, "xbox:Microsoft.624F8B84B80_8wekyb3d8bbwe");
        assert_eq!(g.launch.target, "ms-windows-store://pdp/?PFN=Microsoft.624F8B84B80_8wekyb3d8bbwe");
        assert!(g.not_installed);
        assert_eq!(g.store_last_played, crate::scanner::stats::parse_date("2026-11-01 20:30:00"));
        assert_eq!(g.genre.as_deref(), Some("Course et vol, Action et aventure"));
        assert_eq!((g.developer.as_deref(), g.publisher.as_deref()), (Some("Playground Games"), None));
        assert_eq!(g.released, crate::scanner::stats::parse_date("2021-11-09"));
        let a = g.achievements.unwrap();
        assert_eq!((a.unlocked, a.total, a.gamerscore, a.gamerscore_total), (11, 0, Some(160), Some(2980)));
        assert_eq!(ids, vec!["1717113201"]);
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].name, "VALORANT");

        // Le jeu Riot du même nom reçoit la dernière session vue par Xbox, jamais une plus ancienne.
        let mut lib = vec![
            Game::new("riot:valorant".into(), "Valorant".into(), "riot", uri("x")),
            Game::new("steam:1".into(), "Autre".into(), "steam", uri("y")),
        ];
        assert_eq!(apply_seen(&mut lib, &seen), 1);
        assert_eq!(lib[0].store_last_played, seen[0].last_played);
        assert_eq!(lib[1].store_last_played, None);
        lib[0].store_last_played = Some(u64::MAX);
        assert_eq!(apply_seen(&mut lib, &seen), 0);

        let m = parse_minutes(&json!({ "statlistscollection": [{ "stats": [
            { "titleid": "1717113201", "name": "MinutesPlayed", "value": "754" },
            { "titleid": "9", "name": "MinutesPlayed", "value": "abc" }
        ] }] }));
        assert_eq!(m.get("1717113201"), Some(&754));
        assert_eq!(m.len(), 1);
    }
}
