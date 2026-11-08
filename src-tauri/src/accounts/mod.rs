//! Comptes des launchers (Steam, GOG, Epic) : liste complète des jeux possédés.
//!
//! Sécurité (code public) :
//! - clés et jetons uniquement dans le coffre du système (keyring) : jamais dans les fichiers de
//!   Hangar, les logs ni le frontend, qui ne reçoit que l'état de chaque compte ;
//! - HTTPS vers une liste fermée d'hôtes, sans suivre de redirection ; les messages d'erreur ne
//!   contiennent jamais l'URL (la clé Steam est dans la requête) ;
//! - connexion GOG / Epic dans une fenêtre à part sans aucune permission Tauri (pas d'IPC), en
//!   navigation privée ; le code d'autorisation est intercepté à la navigation, côté Rust ;
//! - les identifiants venus des API sont validés avant d'entrer dans une URL.

pub mod epic;
pub mod gog;
pub mod microsoft;
pub mod steam;
pub mod updates;

use crate::model::Game;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

/// Launchers dont le compte peut être connecté.
pub const CONNECTABLE: &[&str] = &["steam", "gog", "epic"];
/// Stores affichés dans les Paramètres (tag « Détecté »).
const ALL_STORES: &[&str] = &["steam", "epic", "gog", "ubisoft", "ea", "battlenet", "riot", "xbox"];
/// Resynchronisation automatique au plus toutes les 6 h (au moment d'un scan).
const SYNC_EVERY_MS: u64 = 6 * 3_600_000;

/// Seuls hôtes joignables par ce module (HTTPS).
const API_HOSTS: &[&str] = &[
    "api.steampowered.com",
    "auth.gog.com",
    "embed.gog.com",
    "account-public-service-prod03.ol.epicgames.com",
    "library-service.live.use1a.on.epicgames.com",
    "catalog-public-service-prod06.ol.epicgames.com",
    // Mises à jour des jeux : versions Epic (compte connecté) et GOG (public).
    "launcher-public-service-prod06.ol.epicgames.com",
    "content-system.gog.com",
    // Hangar MC : compte Microsoft, Xbox Live, profil Minecraft.
    "login.microsoftonline.com",
    "user.auth.xboxlive.com",
    "xsts.auth.xboxlive.com",
    "api.minecraftservices.com",
];

pub fn allowed(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    !host.contains(['@', ':']) && API_HOSTS.contains(&host)
}

/// Encodage d'un paramètre d'URL (tout sauf les caractères non réservés).
pub fn enc(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// Identifiant sûr à placer dans une URL (alphanumérique, `-`, `_`).
pub fn safe_id(s: &str, max: usize) -> bool {
    !s.is_empty() && s.len() <= max && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|p| p.into_inner())
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

// ─────────────────────────── HTTP ───────────────────────────

pub struct Http {
    agent: ureq::Agent,
}

fn http_error(e: ureq::Error) -> String {
    match e {
        ureq::Error::Status(401 | 403, _) => "Accès refusé par le service : reconnecte le compte.".into(),
        ureq::Error::Status(code, _) => format!("Le service a répondu une erreur {code}, réessaie plus tard."),
        ureq::Error::Transport(_) => "Service injoignable, vérifie ta connexion.".into(),
    }
}

impl Http {
    pub fn new() -> Self {
        let agent = ureq::AgentBuilder::new()
            .timeout(Duration::from_secs(20))
            .redirects(0) // pas de redirection : un jeton ne part jamais vers un autre hôte
            .user_agent("Hangar")
            .build();
        Http { agent }
    }

    fn check(url: &str) -> Result<(), String> {
        if allowed(url) {
            Ok(())
        } else {
            log::warn!("comptes : hôte refusé");
            Err("Adresse non autorisée.".into())
        }
    }

    pub fn get(&self, url: &str, bearer: Option<&str>) -> Result<Value, String> {
        Self::check(url)?;
        let mut req = self.agent.get(url).set("Accept", "application/json");
        if let Some(t) = bearer {
            req = req.set("Authorization", &format!("Bearer {t}"));
        }
        req.call().map_err(http_error)?.into_json().map_err(|_| "Réponse illisible du service.".into())
    }

    /// POST `application/x-www-form-urlencoded`, avec une authentification Basic facultative.
    pub fn post_form(&self, url: &str, basic: Option<&str>, form: &[(&str, &str)]) -> Result<Value, String> {
        Self::check(url)?;
        let mut req = self.agent.post(url).set("Accept", "application/json");
        if let Some(b) = basic {
            req = req.set("Authorization", &format!("Basic {b}"));
        }
        req.send_form(form).map_err(http_error)?.into_json().map_err(|_| "Réponse illisible du service.".into())
    }
}

// ─────────────────────────── Coffre du système ───────────────────────────

/// Nom du coffre : « Hangar », ou « Hangar Test » dans l'environnement de test (jamais les
/// comptes de l'app installée).
static VAULT: std::sync::OnceLock<&'static str> = std::sync::OnceLock::new();

pub fn set_vault(name: &'static str) {
    let _ = VAULT.set(name);
}

fn entry(store: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(VAULT.get().copied().unwrap_or("Hangar"), &format!("compte-{store}"))
        .map_err(|_| "Le coffre d'identifiants du système est indisponible.".into())
}

fn secret(store: &str) -> Option<String> {
    entry(store).ok()?.get_password().ok().filter(|s| !s.is_empty())
}

fn set_secret(store: &str, value: &str) -> Result<(), String> {
    entry(store)?.set_password(value).map_err(|_| "Impossible d'enregistrer dans le coffre du système.".into())
}

fn delete_secret(store: &str) {
    if let Ok(e) = entry(store) {
        let _ = e.delete_credential();
    }
}

// ─────────────────────────── Comptes ───────────────────────────

/// Résultat d'une synchronisation. `secret` : nouveau jeton de rafraîchissement à garder.
#[derive(Default)]
pub struct Fetched {
    pub user: Option<String>,
    pub games: Vec<Game>,
    pub secret: Option<String>,
    /// Dernière version de chaque jeu (Epic : AppName -> buildVersion).
    pub latest: HashMap<String, String>,
}

/// Ce que Hangar garde sur disque d'un compte connecté (rien de secret).
#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase", default)]
struct Synced {
    user: Option<String>,
    games: Vec<Game>,
    synced_at: u64,
    error: Option<String>,
    latest: HashMap<String, String>,
}

/// Résultat de la dernière vérification GOG (`updates.json`).
#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct GogChecked {
    checked_at: u64,
    pending: HashMap<String, bool>,
}

/// État envoyé au frontend.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub store: String,
    /// Launcher trouvé sur cet appareil.
    pub detected: bool,
    pub connectable: bool,
    pub connected: bool,
    pub user: Option<String>,
    pub games: usize,
    pub synced_at: Option<u64>,
    pub error: Option<String>,
}

pub struct Accounts {
    file: PathBuf,
    data: Mutex<HashMap<String, Synced>>,
    http: Http,
    busy: AtomicBool,
    gog_file: PathBuf,
    gog: Mutex<GogChecked>,
    gog_busy: AtomicBool,
}

impl Accounts {
    pub fn new(config_dir: &Path) -> Self {
        let file = config_dir.join("accounts.json");
        let data = std::fs::read(&file).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        let gog_file = config_dir.join("updates.json");
        let gog = std::fs::read(&gog_file).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        Accounts {
            file,
            data: Mutex::new(data),
            http: Http::new(),
            busy: AtomicBool::new(false),
            gog_file,
            gog: Mutex::new(gog),
            gog_busy: AtomicBool::new(false),
        }
    }

    /// Marque les jeux qui ont une mise à jour (versions Epic du compte, vérification GOG).
    pub fn apply_updates(&self, games: &mut [Game]) {
        let epic = lock(&self.data).get("epic").map(|s| s.latest.clone()).unwrap_or_default();
        updates::apply(games, &epic, &lock(&self.gog).pending);
    }

    /// Vrai si des jeux GOG installés n'ont pas été vérifiés depuis 6 h.
    pub fn gog_stale(&self, games: &[Game]) -> bool {
        games.iter().any(|g| g.store == "gog" && g.version.is_some())
            && now_ms().saturating_sub(lock(&self.gog).checked_at) > SYNC_EVERY_MS
    }

    /// Vérifie les versions GOG (une vérification à la fois). Vrai si elle a eu lieu.
    pub fn check_gog(&self, games: &[Game]) -> bool {
        if self.gog_busy.swap(true, Ordering::SeqCst) {
            return false;
        }
        let pending = updates::check_gog(&self.http, games);
        log::info!("GOG : {} jeu(x) vérifié(s), {} à mettre à jour", pending.len(), pending.values().filter(|p| **p).count());
        let bytes = {
            let mut g = lock(&self.gog);
            *g = GogChecked { checked_at: now_ms(), pending };
            serde_json::to_vec(&*g).unwrap_or_default()
        };
        if let Err(e) = crate::state::write_atomic(&self.gog_file, &bytes) {
            log::warn!("mises à jour GOG : enregistrement impossible ({e})");
        }
        self.gog_busy.store(false, Ordering::SeqCst);
        true
    }

    fn save(&self) {
        let bytes = serde_json::to_vec(&*lock(&self.data)).unwrap_or_default();
        if let Err(e) = crate::state::write_atomic(&self.file, &bytes) {
            log::warn!("comptes : enregistrement impossible ({e})");
        }
    }

    /// Jeux possédés venus des comptes connectés.
    pub fn games(&self) -> Vec<Game> {
        lock(&self.data).values().flat_map(|s| s.games.iter().cloned()).collect()
    }

    pub fn status(&self) -> Vec<Status> {
        let data = lock(&self.data);
        ALL_STORES
            .iter()
            .map(|&s| {
                let d = data.get(s);
                Status {
                    store: s.to_string(),
                    detected: crate::scanner::launcher_present(s),
                    connectable: CONNECTABLE.contains(&s),
                    connected: d.is_some(),
                    user: d.and_then(|d| d.user.clone()),
                    games: d.map(|d| d.games.len()).unwrap_or(0),
                    synced_at: d.map(|d| d.synced_at).filter(|t| *t > 0),
                    error: d.and_then(|d| d.error.clone()),
                }
            })
            .collect()
    }

    /// Vrai si un compte connecté n'a pas été synchronisé depuis 6 h.
    pub fn stale(&self) -> bool {
        let now = now_ms();
        lock(&self.data).values().any(|s| now.saturating_sub(s.synced_at) > SYNC_EVERY_MS)
    }

    fn fetch(&self, store: &str, secret: &str) -> Result<Fetched, String> {
        match store {
            "steam" => steam::fetch(&self.http, secret),
            "gog" => gog::fetch(&self.http, secret),
            "epic" => epic::fetch(&self.http, secret),
            _ => Err("Ce launcher ne propose pas de connexion.".into()),
        }
    }

    /// Synchronise un compte connecté. Une erreur garde la dernière liste connue.
    fn sync(&self, store: &str) {
        let Some(sec) = secret(store) else {
            // Jeton effacé du coffre hors de Hangar : le compte n'est plus connecté.
            lock(&self.data).remove(store);
            return;
        };
        let r = self.fetch(store, &sec);
        let mut data = lock(&self.data);
        let Some(entry) = data.get_mut(store) else { return }; // déconnecté pendant la synchro
        entry.synced_at = now_ms();
        match r {
            Ok(f) => {
                if let Some(s) = f.secret {
                    if let Err(e) = set_secret(store, &s) {
                        log::warn!("compte {store} : {e}");
                    }
                }
                log::info!("compte {store} : {} jeu(x)", f.games.len());
                entry.user = f.user.or(entry.user.take());
                entry.games = f.games;
                entry.latest = f.latest;
                entry.error = None;
            }
            Err(e) => {
                log::warn!("compte {store} : {e}");
                entry.error = Some(e);
            }
        }
    }

    /// Synchronise tous les comptes (une seule synchro à la fois). Vrai si elle a eu lieu.
    pub fn sync_all(&self) -> bool {
        if self.busy.swap(true, Ordering::SeqCst) {
            return false;
        }
        let stores: Vec<String> = lock(&self.data).keys().cloned().collect();
        for s in stores {
            self.sync(&s);
        }
        self.save();
        self.busy.store(false, Ordering::SeqCst);
        true
    }

    /// Premier enregistrement : le secret n'est gardé que si la liste a pu être lue.
    fn connect(&self, store: &str, sec: &str) -> Result<usize, String> {
        let f = self.fetch(store, sec)?;
        set_secret(store, f.secret.as_deref().unwrap_or(sec))?;
        let n = f.games.len();
        lock(&self.data).insert(
            store.to_string(),
            Synced { user: f.user, games: f.games, synced_at: now_ms(), error: None, latest: f.latest },
        );
        self.save();
        log::info!("compte {store} connecté : {n} jeu(x)");
        Ok(n)
    }

    pub fn connect_steam(&self, key: &str) -> Result<usize, String> {
        let key = key.trim();
        if !steam::valid_key(key) {
            return Err("Clé invalide : une clé Steam fait 32 caractères (chiffres et lettres A à F).".into());
        }
        self.connect("steam", key)
    }

    /// Fin de connexion GOG / Epic : échange le code d'autorisation contre un jeton.
    pub fn finish_login(&self, store: &str, code: &str) -> Result<usize, String> {
        let refresh = match store {
            "gog" => gog::exchange(&self.http, code)?,
            "epic" => epic::exchange(&self.http, code)?,
            _ => return Err("Ce launcher ne propose pas de connexion.".into()),
        };
        self.connect(store, &refresh)
    }

    pub fn disconnect(&self, store: &str) {
        delete_secret(store);
        lock(&self.data).remove(store);
        self.save();
        log::info!("compte {store} déconnecté");
    }
}

/// Ajoute aux jeux du scan ceux des comptes qui manquent (même id = même jeu), et complète
/// le temps de jeu inconnu. Trie par nom.
pub fn merge(games: &mut Vec<Game>, extra: Vec<Game>) {
    let mut index: HashMap<String, usize> = games.iter().enumerate().map(|(i, g)| (g.id.clone(), i)).collect();
    let mut seen = HashSet::new();
    for g in extra {
        if !seen.insert(g.id.clone()) {
            continue;
        }
        match index.get(&g.id) {
            Some(&i) => {
                let cur = &mut games[i];
                cur.store_play_ms = cur.store_play_ms.max(g.store_play_ms);
                cur.store_last_played = cur.store_last_played.max(g.store_last_played);
            }
            None => {
                index.insert(g.id.clone(), games.len());
                games.push(g);
            }
        }
    }
    games.sort_by_key(|g| g.name.to_lowercase());
}

// ─────────────────────────── Fenêtre de connexion ───────────────────────────

/// Ouvre la page de connexion officielle du launcher et attend le code d'autorisation.
/// La fenêtre n'a aucune permission Tauri : la page ne peut rien demander à Hangar.
pub fn login(app: &tauri::AppHandle, store: &str) -> Result<String, String> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
    let (url, title, script) = match store {
        "gog" => (gog::login_url(), "Connexion à GOG", None),
        "epic" => (epic::login_url(), "Connexion à Epic Games", Some(epic::CAPTURE_SCRIPT)),
        _ => return Err("Ce launcher ne propose pas de connexion.".into()),
    };
    let label = format!("login-{store}");
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.set_focus();
        return Err("Une connexion est déjà en cours.".into());
    }
    let url = url.parse().map_err(|_| "Adresse de connexion invalide.".to_string())?;
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let slot = Arc::new(Mutex::new(Some(tx)));
    let nav = slot.clone();
    let st = store.to_string();
    let mut b = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url))
        .title(title)
        .inner_size(520.0, 760.0)
        .center()
        .incognito(true)
        .on_navigation(move |u| {
            let code = if st == "gog" { gog::capture(u) } else { epic::capture(u) };
            if let Some(c) = code {
                if let Some(tx) = lock(&nav).take() {
                    let _ = tx.send(c);
                }
                return false;
            }
            u.scheme() == "https"
        })
        // Une page de connexion n'a rien à télécharger.
        .on_download(|_, _| false);
    if let Some(s) = script {
        b = b.initialization_script(s);
    }
    let w = b.build().map_err(|_| "Impossible d'ouvrir la fenêtre de connexion.".to_string())?;
    let closed = slot.clone();
    w.on_window_event(move |e| {
        if matches!(e, tauri::WindowEvent::Destroyed) {
            lock(&closed).take(); // plus d'émetteur : l'attente se termine
        }
    });
    let r = rx.recv_timeout(Duration::from_secs(900));
    let _ = w.destroy();
    r.map_err(|_| "Connexion annulée.".into())
}

#[cfg(test)]
mod reel {
    /// Coffre du système réel : `cargo test coffre -- --ignored`.
    #[test]
    #[ignore]
    fn coffre_aller_retour() {
        super::set_secret("test", "valeur").unwrap();
        assert_eq!(super::secret("test").as_deref(), Some("valeur"));
        super::delete_secret("test");
        assert_eq!(super::secret("test"), None);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::uri;

    #[test]
    fn hotes_autorises() {
        assert!(allowed("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=x"));
        assert!(allowed("https://embed.gog.com/user/data/games"));
        assert!(!allowed("http://api.steampowered.com/x"));
        assert!(!allowed("https://api.steampowered.com.evil.io/x"));
        assert!(!allowed("https://user@api.steampowered.com/x"));
        assert!(!allowed("https://api.steampowered.com:444/x"));
        assert!(!allowed("https://cdn1.epicgames.com/x"));
    }

    #[test]
    fn encodage_et_identifiants() {
        assert_eq!(enc("a b&c=d/é"), "a%20b%26c%3Dd%2F%C3%A9");
        assert!(safe_id("fn-4fe75bbc_5a", 64));
        assert!(!safe_id("../x", 64));
        assert!(!safe_id("a?b", 64));
        assert!(!safe_id("", 64));
    }

    #[test]
    fn fusion_garde_le_scan_et_ajoute_le_reste() {
        let mut a = Game::new("steam:1".into(), "B".into(), "steam", uri("x"));
        a.store_play_ms = Some(10);
        let mut games = vec![a];
        let mut b = Game::new("steam:1".into(), "B (API)".into(), "steam", uri("y"));
        b.store_play_ms = Some(99);
        let c = Game::new("gog:2".into(), "A".into(), "gog", uri("z"));
        merge(&mut games, vec![b, c.clone(), c]);
        assert_eq!(games.len(), 2);
        assert_eq!(games[0].id, "gog:2", "trié par nom");
        assert_eq!(games[1].name, "B");
        assert_eq!(games[1].launch.target, "x");
        assert_eq!(games[1].store_play_ms, Some(99));
    }
}
