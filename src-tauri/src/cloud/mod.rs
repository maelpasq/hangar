//! Compte Hangar (facultatif) : connexion, état du compte et postes (voir docs/COMPTE.md).
//!
//! Sécurité (code public) :
//! - une seule adresse joignable, l'API du compte (`hangar-api.pamalstudio.fr`, ou
//!   `hangar-api-test` pour Hangar Test), en HTTPS, sans suivre de redirection ;
//! - connexion dans le navigateur de la personne, retour par une adresse locale
//!   `http://127.0.0.1:<port>` ouverte le temps de la connexion, avec PKCE et un `state` ;
//! - le jeton du poste va dans le coffre du système, jamais dans les fichiers, les journaux ni le
//!   frontend, qui ne reçoit que l'état du compte.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
mod social;
pub use social::{live, notify};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::{ErrorKind, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

const PROD: &str = "https://hangar-api.pamalstudio.fr";
const TEST: &str = "https://hangar-api-test.pamalstudio.fr";
/// Nom de l'entrée du coffre (`compte-hangar`, dans le coffre « Hangar » ou « Hangar Test »).
const VAULT_KEY: &str = "hangar";
/// Temps laissé pour se connecter dans le navigateur.
const LOGIN_WAIT: Duration = Duration::from_secs(10 * 60);
const OFFLINE: &str = "Serveur du compte injoignable, vérifie ta connexion.";

static API: OnceLock<&'static str> = OnceLock::new();
static LOGIN_BUSY: AtomicBool = AtomicBool::new(false);
static LOGIN_CANCEL: AtomicBool = AtomicBool::new(false);

/// Hangar Test parle à son propre serveur (base et Worker séparés).
pub fn set_test_env(test: bool) {
    let _ = API.set(if test { TEST } else { PROD });
}

pub(crate) fn api() -> &'static str {
    API.get().copied().unwrap_or(PROD)
}

// ─────────────────────────── État envoyé au frontend ───────────────────────────

#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct User {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub email: String,
    /// Avatar en `data:` (petite image carrée), gardé en cache tant que sa version ne change pas.
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub avatar_version: Option<String>,
    /// Création du compte (ms depuis 1970, 0 si inconnue) : bienvenue après l'inscription.
    #[serde(default)]
    pub created_at: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub created_at: u64,
    #[serde(default)]
    pub last_seen: u64,
    #[serde(default)]
    pub connected: bool,
    #[serde(default)]
    pub current: bool,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub connected: bool,
    /// Connecté, mais le serveur ne répond pas : dernier état connu.
    #[serde(default, skip_deserializing)]
    pub offline: bool,
    /// Le serveur a refusé le jeton (poste déconnecté à distance) : on vient de repasser en anonyme.
    #[serde(default, skip_deserializing)]
    pub revoked: bool,
    pub user: Option<User>,
    #[serde(default)]
    pub devices: Vec<Device>,
}

/// Un élément synchronisé (`value` absente : supprimé). Contenu vérifié par le frontend et l'API.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub key: String,
    pub value: Option<String>,
    pub updated_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
}

/// Une page de changements reçus du compte.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub cursor: u64,
    #[serde(default)]
    pub more: bool,
    #[serde(default)]
    pub changes: Vec<Change>,
}

/// Une session de jeu du compte (identifiant de jeu portable, dates en ms).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlaySession {
    pub id: String,
    pub game_id: String,
    pub start: u64,
    pub end: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
}

/// Une page de sessions reçues du compte.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionPage {
    pub cursor: u64,
    #[serde(default)]
    pub more: bool,
    #[serde(default)]
    pub sessions: Vec<PlaySession>,
}

/// Changements par envoi (limite de l'API).
const MAX_CHANGES: usize = 1000;

// ─────────────────────────── HTTP ───────────────────────────

#[derive(Debug, PartialEq)]
enum CallError {
    /// Jeton refusé (401).
    Unauthorized,
    /// Réseau ou réponse illisible.
    Offline,
    /// Autre refus du serveur (code HTTP).
    Status(u16),
}

impl CallError {
    fn message(&self) -> String {
        match self {
            CallError::Unauthorized => "Ce poste n'est plus connecté au compte.".into(),
            CallError::Offline => OFFLINE.into(),
            CallError::Status(c) => format!("Le serveur du compte a répondu une erreur {c}, réessaie plus tard."),
        }
    }
}

fn agent() -> &'static ureq::Agent {
    static AGENT: OnceLock<ureq::Agent> = OnceLock::new();
    AGENT.get_or_init(|| {
        ureq::AgentBuilder::new()
            .timeout(Duration::from_secs(20))
            .redirects(0)
            .user_agent("Hangar")
            .build()
    })
}

fn request(method: &str, path: &str, token: Option<&str>) -> ureq::Request {
    let req = agent().request(method, &format!("{}{path}", api()));
    match token {
        Some(t) => req.set("Authorization", &format!("Bearer {t}")),
        None => req,
    }
}

fn call_error(path: &str, e: ureq::Error) -> CallError {
    match e {
        ureq::Error::Status(401, _) => CallError::Unauthorized,
        ureq::Error::Status(c, _) => {
            if c != 404 {
                log::warn!("compte Hangar : réponse {c} sur {path}");
            }
            CallError::Status(c)
        }
        ureq::Error::Transport(t) => {
            log::warn!("compte Hangar : serveur injoignable ({})", t.kind());
            CallError::Offline
        }
    }
}

fn call(method: &str, path: &str, token: Option<&str>, body: Option<&Value>) -> Result<Value, CallError> {
    let req = request(method, path, token).set("Accept", "application/json");
    let res = match body {
        Some(b) => req.send_json(b),
        None => req.call(),
    };
    match res {
        Ok(r) => r.into_json().map_err(|_| CallError::Offline),
        Err(e) => Err(call_error(path, e)),
    }
}

// ─────────────────────────── Avatar ───────────────────────────

/// Taille maximale d'un avatar (limite de l'API).
const AVATAR_MAX: usize = 512 * 1024;
/// Jaquette envoyée au compte : au plus 4 Mo (même limite que l'API).
const COVER_MAX: usize = 4 * 1024 * 1024;

fn sha_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

fn is_hex64(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Jaquette copiée par Hangar dans son dossier : contenu et type, si elle peut aller sur le compte.
fn read_cover(covers: &Path, path: &str) -> Option<(Vec<u8>, &'static str)> {
    let dir = std::fs::canonicalize(covers).ok()?;
    let file = std::fs::canonicalize(path).ok()?;
    if !file.starts_with(&dir) || std::fs::metadata(&file).ok()?.len() > COVER_MAX as u64 {
        return None;
    }
    let bytes = std::fs::read(&file).ok()?;
    let kind = image_type(&bytes).filter(|k| *k != "image/gif")?;
    Some((bytes, kind))
}

fn cover_ext(kind: &str) -> &'static str {
    match kind {
        "image/png" => "png",
        "image/webp" => "webp",
        _ => "jpg",
    }
}

/// Type d'une image d'après ses premiers octets (comme l'API).
fn image_type(b: &[u8]) -> Option<&'static str> {
    if b.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        Some("image/png")
    } else if b.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if b.len() >= 12 && b.starts_with(b"RIFF") && &b[8..12] == b"WEBP" {
        Some("image/webp")
    } else if b.starts_with(b"GIF8") {
        Some("image/gif")
    } else {
        None
    }
}

/// Avatar du compte en `data:` (rien si le compte n'en a pas, ou s'il est illisible).
fn fetch_avatar(token: &str) -> Option<String> {
    let res = request("GET", "/me/avatar", Some(token)).call().map_err(|e| call_error("/me/avatar", e)).ok()?;
    let mut bytes = Vec::new();
    res.into_reader().take(AVATAR_MAX as u64 + 1).read_to_end(&mut bytes).ok()?;
    if bytes.len() > AVATAR_MAX {
        return None;
    }
    let kind = image_type(&bytes)?;
    Some(format!("data:{kind};base64,{}", base64::engine::general_purpose::STANDARD.encode(&bytes)))
}

/// Pseudo nettoyé (espaces réduits), 2 à 32 caractères, sans caractère de contrôle (comme l'API).
fn clean_name(name: &str) -> Option<String> {
    let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
    let n = name.chars().count();
    ((2..=32).contains(&n) && !name.chars().any(|c| c.is_control())).then_some(name)
}

/// Identifiant de compte sûr dans une adresse (celui de Better Auth).
fn safe_user_id(id: &str) -> bool {
    (8..=64).contains(&id.len()) && safe_token(id)
}

// ─────────────────────────── PKCE ───────────────────────────

/// Octets aléatoires du système (générateur cryptographique de l'OS).
#[cfg(windows)]
fn os_random(buf: &mut [u8]) -> bool {
    use windows_sys::Win32::Security::Cryptography::{BCryptGenRandom, BCRYPT_USE_SYSTEM_PREFERRED_RNG};
    // SAFETY : tampon valide de la longueur annoncée, pas d'algorithme ouvert (RNG du système).
    unsafe { BCryptGenRandom(std::ptr::null_mut(), buf.as_mut_ptr(), buf.len() as u32, BCRYPT_USE_SYSTEM_PREFERRED_RNG) == 0 }
}

#[cfg(not(windows))]
fn os_random(buf: &mut [u8]) -> bool {
    std::fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(buf)).is_ok()
}

fn random_b64(bytes: usize) -> Result<String, String> {
    let mut buf = vec![0u8; bytes];
    if !os_random(&mut buf) {
        return Err("Tirage aléatoire impossible.".into());
    }
    Ok(URL_SAFE_NO_PAD.encode(buf))
}

fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn is_hex32(s: &str) -> bool {
    s.len() == 32 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn safe_token(s: &str) -> bool {
    !s.is_empty() && s.len() <= 128 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Nom proposé pour ce poste : le nom du PC.
pub fn default_device_name() -> String {
    let n = sysinfo::System::host_name().unwrap_or_default();
    let n: String = n.trim().chars().take(60).collect();
    if n.is_empty() {
        "PC".into()
    } else {
        n
    }
}

// ─────────────────────────── Retour par 127.0.0.1 ───────────────────────────

/// Code et `state` d'une requête `GET /?code=...&state=...` reçue sur l'adresse locale.
fn parse_callback(request: &str) -> Option<(String, String)> {
    let line = request.lines().next()?;
    let mut parts = line.split(' ');
    if parts.next()? != "GET" {
        return None;
    }
    let target = parts.next()?;
    if !target.starts_with("/?") {
        return None;
    }
    let url = url::Url::parse(&format!("http://127.0.0.1{target}")).ok()?;
    let get = |k: &str| url.query_pairs().find(|(n, _)| n == k).map(|(_, v)| v.into_owned());
    Some((get("code")?, get("state")?))
}

/// Répond au navigateur. Avec `end`, le renvoie vers la page de fin de l'API (« done » ou
/// « refused »), qui a la même présentation que la page de connexion ; l'adresse locale et son
/// code quittent ainsi la barre d'adresse.
fn respond(stream: &mut TcpStream, end: Option<&str>) {
    let head = match end {
        Some(end) => format!(
            "HTTP/1.1 302 Found\r\nLocation: {}/login/{end}\r\nContent-Length: 0\r\n\
Cache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n",
            api()
        ),
        None => "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string(),
    };
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.flush();
}

fn read_request(stream: &mut TcpStream) -> String {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut buf = Vec::new();
    let mut chunk = [0u8; 1024];
    while buf.len() < 8192 {
        match stream.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                buf.extend_from_slice(&chunk[..n]);
                if buf.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
        }
    }
    String::from_utf8_lossy(&buf).into_owned()
}

/// Attend le retour du navigateur ; rend le code à usage unique.
fn wait_code(listener: &TcpListener, state: &str) -> Result<String, String> {
    let deadline = Instant::now() + LOGIN_WAIT;
    loop {
        if LOGIN_CANCEL.load(Ordering::SeqCst) {
            return Err(String::new());
        }
        if Instant::now() > deadline {
            return Err("Connexion trop longue, recommence.".into());
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                let req = read_request(&mut stream);
                match parse_callback(&req) {
                    Some((code, st)) if st == state && safe_token(&code) => {
                        respond(&mut stream, Some("done"));
                        return Ok(code);
                    }
                    Some(_) => respond(&mut stream, Some("refused")),
                    None => respond(&mut stream, None),
                }
            }
            Err(e) if e.kind() == ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(150)),
            Err(_) => std::thread::sleep(Duration::from_millis(150)),
        }
    }
}

// ─────────────────────────── Compte ───────────────────────────

pub struct Cloud {
    cache: PathBuf,
}

struct BusyGuard;
impl Drop for BusyGuard {
    fn drop(&mut self) {
        LOGIN_BUSY.store(false, Ordering::SeqCst);
    }
}

impl Cloud {
    pub fn new(config: &Path) -> Self {
        Cloud { cache: config.join("compte.json") }
    }

    fn read_cache(&self) -> Option<Status> {
        serde_json::from_str(&std::fs::read_to_string(&self.cache).ok()?).ok()
    }

    fn write_cache(&self, s: &Status) {
        if let Ok(text) = serde_json::to_string(s) {
            let _ = std::fs::write(&self.cache, text);
        }
    }

    fn forget(&self) {
        crate::accounts::delete_secret(VAULT_KEY);
        let _ = std::fs::remove_file(&self.cache);
    }

    fn from_me(me: &Value) -> Status {
        let u = &me["user"];
        let s = |v: &Value| v.as_str().unwrap_or("").to_string();
        Status {
            connected: true,
            user: Some(User {
                id: s(&u["id"]),
                name: s(&u["name"]),
                email: s(&u["email"]),
                avatar: None,
                avatar_version: u["avatar"].as_str().filter(|v| !v.is_empty()).map(String::from),
                created_at: u["createdAt"].as_u64().unwrap_or(0),
            }),
            devices: serde_json::from_value(me["devices"].clone()).unwrap_or_default(),
            ..Status::default()
        }
    }

    /// Avatar : celui du cache tant que sa version ne change pas, sinon téléchargé une fois.
    fn fill_avatar(&self, s: &mut Status, token: &str) {
        let Some(u) = s.user.as_mut() else { return };
        let Some(version) = u.avatar_version.clone() else { return };
        let cached = self
            .read_cache()
            .and_then(|c| c.user)
            .filter(|c| c.avatar_version.as_deref() == Some(version.as_str()))
            .and_then(|c| c.avatar);
        u.avatar = cached.or_else(|| fetch_avatar(token));
        if u.avatar.is_none() {
            // Nouvel essai à la prochaine demande.
            u.avatar_version = None;
        }
    }

    /// État du compte (demande `GET /me` au serveur si un jeton est rangé).
    pub fn status(&self) -> Status {
        let Some(token) = crate::accounts::secret(VAULT_KEY) else {
            let _ = std::fs::remove_file(&self.cache);
            return Status::default();
        };
        match call("GET", "/me", Some(&token), None) {
            Ok(me) => {
                let mut s = Self::from_me(&me);
                self.fill_avatar(&mut s, &token);
                self.write_cache(&s);
                s
            }
            Err(CallError::Unauthorized) => {
                log::info!("compte Hangar : jeton refusé, retour en anonyme");
                self.forget();
                Status { revoked: true, ..Status::default() }
            }
            Err(_) => {
                let mut s = self.read_cache().unwrap_or_default();
                s.connected = true;
                s.offline = true;
                s
            }
        }
    }

    /// Connexion : ouvre le navigateur sur la page du compte et attend le retour sur 127.0.0.1.
    pub fn login(&self, device_id: &str) -> Result<Status, String> {
        if !is_hex32(device_id) {
            return Err("Identifiant de poste invalide.".into());
        }
        if LOGIN_BUSY.swap(true, Ordering::SeqCst) {
            return Err("Une connexion est déjà en cours.".into());
        }
        let _guard = BusyGuard;
        LOGIN_CANCEL.store(false, Ordering::SeqCst);

        let verifier = random_b64(32)?;
        let state = random_b64(24)?;
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|_| "Impossible d'ouvrir l'adresse locale de connexion.".to_string())?;
        listener.set_nonblocking(true).map_err(|_| "Impossible d'ouvrir l'adresse locale de connexion.".to_string())?;
        let port = listener.local_addr().map_err(|_| "Adresse locale indisponible.".to_string())?.port();

        let url = format!("{}/login?port={port}&challenge={}&state={state}", api(), challenge(&verifier));
        crate::launcher::shell_open(&url, "", None, "open")?;
        log::info!("compte Hangar : connexion ouverte dans le navigateur");

        let code = wait_code(&listener, &state)?;
        drop(listener);

        let body = json!({ "code": code, "verifier": verifier, "deviceId": device_id, "deviceName": default_device_name() });
        let res = call("POST", "/desktop/token", None, Some(&body)).map_err(|e| match e {
            CallError::Unauthorized => "Code de connexion expiré, recommence.".to_string(),
            e => e.message(),
        })?;
        let token = res["token"].as_str().filter(|t| safe_token(t)).ok_or("Réponse illisible du serveur du compte.")?;
        crate::accounts::set_secret(VAULT_KEY, token)?;
        log::info!("compte Hangar : poste connecté");
        Ok(self.status())
    }

    pub fn cancel_login() {
        LOGIN_CANCEL.store(true, Ordering::SeqCst);
    }

    /// Déconnecte ce poste. Ses données restent sur le poste et sur le compte.
    pub fn logout(&self) {
        if let Some(token) = crate::accounts::secret(VAULT_KEY) {
            // Au mieux : hors ligne, le jeton est quand même oublié ici.
            let _ = call("POST", "/logout", Some(&token), Some(&json!({})));
        }
        self.forget();
        log::info!("compte Hangar : poste déconnecté");
    }

    fn with_token(&self, f: impl FnOnce(&str) -> Result<Value, CallError>) -> Result<Status, String> {
        self.with_token_or("", f)
    }

    /// Comme `with_token`, avec le message à montrer si le serveur refuse la requête (400).
    fn with_token_or(&self, refused: &str, f: impl FnOnce(&str) -> Result<Value, CallError>) -> Result<Status, String> {
        let token = crate::accounts::secret(VAULT_KEY).ok_or("Ce poste n'est pas connecté au compte.")?;
        match f(&token) {
            Ok(_) => Ok(self.status()),
            Err(CallError::Unauthorized) => {
                self.forget();
                Err(CallError::Unauthorized.message())
            }
            Err(CallError::Status(400)) if !refused.is_empty() => Err(refused.into()),
            Err(e) => Err(e.message()),
        }
    }

    /// Appel avec le jeton du poste ; jeton refusé : retour en anonyme.
    fn authed(&self, f: impl FnOnce(&str) -> Result<Value, CallError>) -> Result<Value, String> {
        let token = crate::accounts::secret(VAULT_KEY).ok_or("Ce poste n'est pas connecté au compte.")?;
        f(&token).map_err(|e| {
            if e == CallError::Unauthorized {
                log::info!("compte Hangar : jeton refusé, retour en anonyme");
                self.forget();
            }
            e.message()
        })
    }

    /// Changements du compte depuis le curseur `since` (une page).
    pub fn pull(&self, since: u64) -> Result<Page, String> {
        let v = self.authed(|t| call("GET", &format!("/sync?since={since}"), Some(t), None))?;
        serde_json::from_value(v).map_err(|_| "Réponse illisible du serveur du compte.".into())
    }

    /// Envoi groupé des changements de ce poste.
    pub fn push(&self, changes: Vec<Change>) -> Result<(), String> {
        if changes.len() > MAX_CHANGES {
            return Err("Trop de changements d'un coup.".into());
        }
        let list: Vec<Value> = changes
            .into_iter()
            .map(|c| json!({ "key": c.key, "value": c.value, "updatedAt": c.updated_at }))
            .collect();
        self.authed(|t| call("POST", "/sync", Some(t), Some(&json!({ "changes": list }))))?;
        Ok(())
    }

    /// Sessions de jeu de tous les postes depuis le curseur `since` (une page).
    pub fn pull_sessions(&self, since: u64) -> Result<SessionPage, String> {
        let v = self.authed(|t| call("GET", &format!("/sessions?since={since}"), Some(t), None))?;
        serde_json::from_value(v).map_err(|_| "Réponse illisible du serveur du compte.".into())
    }

    /// Envoi des sessions finies de ce poste (ajout seulement ; le serveur ignore celles qu'il a).
    pub fn push_sessions(&self, sessions: Vec<PlaySession>) -> Result<(), String> {
        if sessions.len() > MAX_CHANGES {
            return Err("Trop de sessions d'un coup.".into());
        }
        let list: Vec<Value> = sessions
            .into_iter()
            .map(|s| json!({ "id": s.id, "gameId": s.game_id, "start": s.start, "end": s.end }))
            .collect();
        self.authed(|t| call("POST", "/sessions", Some(t), Some(&json!({ "sessions": list }))))?;
        Ok(())
    }

    /// Clé SteamGridDB : récupérée du compte (nouveau poste, ou changée ailleurs). À la première
    /// synchro, celle de ce poste est envoyée si le compte n'en a pas. Rend vrai si ce poste a une clé.
    pub fn sync_steamgriddb(&self, first: bool) -> Result<bool, String> {
        let local = crate::accounts::steamgriddb_key();
        let token = crate::accounts::secret(VAULT_KEY).ok_or("Ce poste n'est pas connecté au compte.")?;
        match call("GET", "/secrets/steamgriddb", Some(&token), None) {
            Ok(v) => {
                let remote = v["value"].as_str().unwrap_or("").trim();
                if !remote.is_empty() && local.as_deref() != Some(remote) && crate::accounts::set_steamgriddb_key(remote).is_ok() {
                    log::info!("compte Hangar : clé SteamGridDB récupérée du compte");
                    return Ok(true);
                }
                Ok(local.is_some())
            }
            Err(CallError::Status(404)) => {
                if let (true, Some(k)) = (first, &local) {
                    let _ = call("PUT", "/secrets/steamgriddb", Some(&token), Some(&json!({ "value": k })));
                }
                Ok(local.is_some())
            }
            Err(CallError::Unauthorized) => {
                self.forget();
                Err(CallError::Unauthorized.message())
            }
            Err(e) => Err(e.message()),
        }
    }

    /// Clé SteamGridDB saisie, changée ou retirée ici : le compte suit (au mieux ; hors ligne, rien).
    pub fn share_steamgriddb(&self, key: &str) {
        let Some(token) = crate::accounts::secret(VAULT_KEY) else { return };
        let res = if key.is_empty() {
            call("DELETE", "/secrets/steamgriddb", Some(&token), None)
        } else {
            call("PUT", "/secrets/steamgriddb", Some(&token), Some(&json!({ "value": key })))
        };
        if res.is_err() {
            log::warn!("compte Hangar : clé SteamGridDB pas envoyée au compte");
        }
    }

    pub fn rename_device(&self, id: &str, name: &str) -> Result<Status, String> {
        let name = name.trim();
        if !is_hex32(id) || name.is_empty() || name.chars().count() > 60 {
            return Err("Nom de poste invalide (60 caractères au plus).".into());
        }
        self.with_token(|t| call("PUT", &format!("/devices/{id}"), Some(t), Some(&json!({ "name": name }))))
    }

    /// Déconnecte un autre poste à distance.
    pub fn forget_device(&self, id: &str) -> Result<Status, String> {
        if !is_hex32(id) {
            return Err("Poste inconnu.".into());
        }
        self.with_token(|t| call("DELETE", &format!("/devices/{id}"), Some(t), None))
    }

    /// Nouveau pseudo.
    pub fn set_profile(&self, name: String) -> Result<Status, String> {
        let n = clean_name(&name).ok_or("Pseudo invalide : entre 2 et 32 caractères.")?;
        let body = json!({ "name": n });
        self.with_token_or("Ce pseudo n'est pas accepté.", |t| call("PUT", "/me", Some(t), Some(&body)))
    }

    /// Nouvel avatar : image déjà réduite par l'app (carré de 256 px), PNG, JPEG ou WebP.
    pub fn set_avatar(&self, bytes: Vec<u8>) -> Result<Status, String> {
        if bytes.len() > AVATAR_MAX {
            return Err("Image trop lourde (512 Ko au plus).".into());
        }
        let kind = image_type(&bytes).filter(|k| *k != "image/gif").ok_or("Image illisible : choisis un PNG, un JPEG ou un WebP.")?;
        self.with_token_or("Image refusée : choisis un PNG, un JPEG ou un WebP.", |t| {
            let res = request("PUT", "/me/avatar", Some(t)).set("Content-Type", kind).send_bytes(&bytes);
            res.map_err(|e| call_error("/me/avatar", e))?.into_json().map_err(|_| CallError::Offline)
        })
    }

    pub fn remove_avatar(&self) -> Result<Status, String> {
        self.with_token(|t| call("DELETE", "/me/avatar", Some(t), None))
    }

    // --- Jaquettes en fichier local (docs/COMPTE.md, section 3) ---

    /// Empreinte d'une jaquette du dossier de Hangar ; None : absente, trop lourde ou illisible.
    pub fn cover_hash(covers: &Path, path: &str) -> Option<String> {
        read_cover(covers, path).map(|(bytes, _)| sha_hex(&bytes))
    }

    /// Envoie une jaquette au compte. Faux : refusée par le serveur (compte plein, image refusée).
    pub fn upload_cover(&self, covers: &Path, path: &str, hash: &str) -> Result<bool, String> {
        let (bytes, kind) = read_cover(covers, path).ok_or("Jaquette introuvable.")?;
        if !is_hex64(hash) || sha_hex(&bytes) != hash {
            return Err("La jaquette a changé, nouvel essai à la prochaine synchro.".into());
        }
        let route = format!("/covers/{hash}");
        let sent = self.authed(|t| match request("PUT", &route, Some(t)).set("Content-Type", kind).send_bytes(&bytes) {
            Ok(_) => Ok(Value::Bool(true)),
            Err(e) => match call_error(&route, e) {
                CallError::Status(400 | 413) => Ok(Value::Bool(false)),
                e => Err(e),
            },
        })?;
        Ok(sent == Value::Bool(true))
    }

    /// Télécharge une jaquette du compte dans le dossier de Hangar. None : plus sur le compte.
    pub fn fetch_cover(&self, covers: &Path, hash: &str) -> Result<Option<String>, String> {
        if !is_hex64(hash) {
            return Ok(None);
        }
        for ext in ["png", "jpg", "webp"] {
            let p = covers.join(format!("compte-{hash}.{ext}"));
            if p.is_file() {
                return Ok(Some(p.to_string_lossy().into_owned()));
            }
        }
        let route = format!("/covers/{hash}");
        let token = crate::accounts::secret(VAULT_KEY).ok_or("Ce poste n'est pas connecté au compte.")?;
        let res = match request("GET", &route, Some(&token)).call() {
            Ok(r) => r,
            Err(e) => {
                return match call_error(&route, e) {
                    CallError::Status(404) => Ok(None),
                    CallError::Unauthorized => {
                        self.forget();
                        Err(CallError::Unauthorized.message())
                    }
                    e => Err(e.message()),
                }
            }
        };
        let mut bytes = Vec::new();
        res.into_reader().take(COVER_MAX as u64 + 1).read_to_end(&mut bytes).map_err(|_| OFFLINE.to_string())?;
        let kind = image_type(&bytes).filter(|k| *k != "image/gif");
        let (Some(kind), true) = (kind, bytes.len() <= COVER_MAX && sha_hex(&bytes) == hash) else {
            return Ok(None);
        };
        std::fs::create_dir_all(covers).map_err(|_| "Dossier des jaquettes inaccessible.".to_string())?;
        let dest = covers.join(format!("compte-{hash}.{}", cover_ext(kind)));
        std::fs::write(&dest, &bytes).map_err(|_| "Impossible d'enregistrer la jaquette.".to_string())?;
        Ok(Some(dest.to_string_lossy().into_owned()))
    }

    // --- Export et suppression (RGPD) ---

    /// Toutes les données du compte, en JSON lisible.
    pub fn export(&self) -> Result<String, String> {
        let v = self.authed(|t| call("GET", "/export", Some(t), None))?;
        serde_json::to_string_pretty(&v).map_err(|_| "Réponse illisible du serveur du compte.".into())
    }

    /// Supprime le compte et toutes ses données sur le serveur. Ce poste garde les siennes.
    pub fn delete_account(&self) -> Result<(), String> {
        self.authed(|t| call("DELETE", "/me", Some(t), None))?;
        self.forget();
        log::info!("compte Hangar : compte supprimé");
        Ok(())
    }
}

/// Connexions des launchers partagées par le compte (secrets `compte-<store>`, chiffrés sur le
/// serveur, hors de la synchro et de l'export).
impl crate::accounts::Shared for Cloud {
    fn get(&self, store: &str) -> Result<Option<String>, ()> {
        let token = crate::accounts::secret(VAULT_KEY).ok_or(())?;
        match call("GET", &format!("/secrets/compte-{store}"), Some(&token), None) {
            Ok(v) => Ok(v["value"].as_str().map(str::trim).filter(|s| !s.is_empty() && s.len() <= 4096).map(String::from)),
            Err(CallError::Status(404)) => Ok(None),
            Err(CallError::Unauthorized) => {
                self.forget();
                Err(())
            }
            Err(_) => Err(()),
        }
    }

    fn put(&self, store: &str, secret: Option<&str>) -> bool {
        let Some(token) = crate::accounts::secret(VAULT_KEY) else { return false };
        let path = format!("/secrets/compte-{store}");
        let res = match secret {
            Some(v) => call("PUT", &path, Some(&token), Some(&json!({ "value": v }))),
            None => call("DELETE", &path, Some(&token), None),
        };
        if res.is_err() {
            log::warn!("compte Hangar : connexion {store} pas partagée avec le compte");
        }
        res.is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_comme_le_serveur() {
        // Même valeur que `pkceChallenge` du serveur (SHA-256 puis base64url sans remplissage).
        assert_eq!(challenge("dBjftJeZ4CVP-mJ92ZcPrWU-NXKzMN5MjWU3gNPU8Ns"), "_hr7MUYbEPJJpnxdBqY3iBi-BU--KyaUimTdNgGPc1U");
        let v = random_b64(32).unwrap();
        assert_eq!(v.len(), 43);
        assert_eq!(challenge(&v).len(), 43);
    }

    #[test]
    fn retour_navigateur() {
        let req = "GET /?code=abc_DEF-1&state=xyz HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
        assert_eq!(parse_callback(req), Some(("abc_DEF-1".into(), "xyz".into())));
        assert_eq!(parse_callback("GET /favicon.ico HTTP/1.1\r\n\r\n"), None);
        assert_eq!(parse_callback("POST /?code=a&state=b HTTP/1.1\r\n\r\n"), None);
        assert_eq!(parse_callback("GET /?code=a HTTP/1.1\r\n\r\n"), None);
    }

    #[test]
    fn retour_par_adresse_locale() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let port = listener.local_addr().unwrap().port();
        let send = move |path: &str| {
            let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
            s.write_all(format!("GET {path} HTTP/1.1\r\nHost: x\r\n\r\n").as_bytes()).unwrap();
            let mut out = String::new();
            let _ = s.read_to_string(&mut out);
            out
        };
        let t = std::thread::spawn(move || {
            let mauvais = send("/?code=abc&state=autre");
            let bon = send("/?code=abc&state=attendu");
            (mauvais, bon)
        });
        assert_eq!(wait_code(&listener, "attendu").unwrap(), "abc");
        let (mauvais, bon) = t.join().unwrap();
        // Le navigateur est renvoyé vers la page de fin de l'API, jamais ailleurs.
        let vers = |end: &str| format!("Location: {}/login/{end}\r\n", api());
        assert!(mauvais.starts_with("HTTP/1.1 302") && mauvais.contains(&vers("refused")));
        assert!(bon.starts_with("HTTP/1.1 302") && bon.contains(&vers("done")));
    }

    #[test]
    fn page_recue() {
        let v = json!({ "cursor": 7, "more": false, "changes": [
            { "key": "fav:steam:1", "value": "true", "updatedAt": 5, "deviceId": "d" },
            { "key": "rename:steam:2", "value": null, "updatedAt": 6, "deviceId": "d" }
        ]});
        let p: Page = serde_json::from_value(v).unwrap();
        assert_eq!(p.cursor, 7);
        assert_eq!(p.changes[0].value.as_deref(), Some("true"));
        assert_eq!(p.changes[1].value, None);
        let back = serde_json::to_value(&p.changes[1]).unwrap();
        assert_eq!(back["updatedAt"], 6);
        assert!(back["value"].is_null());
    }

    #[test]
    fn profil() {
        assert_eq!(clean_name("  Pilote   du\tdimanche "), Some("Pilote du dimanche".into()));
        assert_eq!(clean_name("x"), None);
        assert_eq!(clean_name(&"a".repeat(33)), None);
        assert_eq!(clean_name("a\u{7}b"), None);
        assert_eq!(image_type(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0]), Some("image/png"));
        assert_eq!(image_type(b"RIFF\0\0\0\0WEBPVP8 "), Some("image/webp"));
        assert_eq!(image_type(&[0xff, 0xd8, 0xff, 0xe0]), Some("image/jpeg"));
        assert_eq!(image_type(b"<svg onload=x>"), None);
    }

    #[test]
    fn controles() {
        assert!(is_hex32("0123456789abcdef0123456789abcdef"));
        assert!(!is_hex32("0123456789ABCDEF0123456789abcdef"));
        assert!(safe_token("a-b_C9"));
        assert!(!safe_token("a b"));
        assert!(!safe_token(""));
        assert!(safe_user_id("AbC123_-xyz"));
        assert!(!safe_user_id("../../x"));
        assert!(!safe_user_id("court"));
    }

    #[test]
    fn etat_depuis_me() {
        let me = json!({
            "user": { "id": "u", "email": "a@b.c", "name": "Alex", "image": null, "createdAt": 1 },
            "devices": [{ "id": "0123456789abcdef0123456789abcdef", "name": "PC", "createdAt": 1, "lastSeen": 2, "connected": true, "current": true }]
        });
        let s = Cloud::from_me(&me);
        assert!(s.connected && !s.offline);
        let u = s.user.clone().unwrap();
        assert_eq!(u.name, "Alex");
        assert_eq!(u.id, "u");
        assert!(u.avatar_version.is_none());
        assert_eq!(u.created_at, 1);
        // Ancien cache (sans profil) : toujours lisible.
        let old: Status = serde_json::from_value(json!({ "connected": true, "user": { "name": "A", "email": "a@b.c" } })).unwrap();
        assert!(old.user.unwrap().avatar.is_none());
        assert_eq!(s.devices.len(), 1);
        assert!(s.devices[0].current);
    }
}
