//! Social du compte Hangar (docs/COMPTE.md, phase 7) : appels `/social/*` avec le jeton du poste,
//! images des profils (avatar, bannière) et connexion temps réel (WebSocket) qui relaie à l'app
//! la présence des amis et les nouveaux messages.
//!
//! Réseau : seulement l'API du compte, seulement quand la personne est connectée et a activé les
//! amis (l'app ouvre la connexion temps réel dans ce seul cas).

use super::{api, call, call_error, image_type, request, safe_user_id, CallError, Cloud, AVATAR_MAX, VAULT_KEY};
use base64::Engine;
use serde_json::{json, Value};
use std::io::{ErrorKind, Read};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Bannière du profil : au plus 1 Mo (limite de l'API).
const BANNER_MAX: usize = 1024 * 1024;
/// Signe de vie de la connexion temps réel (l'API compte hors ligne après 10 minutes sans).
const PING_EVERY: Duration = Duration::from_secs(4 * 60);
/// Attente maximale entre deux tentatives de reconnexion.
const RETRY_MAX: Duration = Duration::from_secs(60);

/// Génération de la connexion temps réel voulue : chaque démarrage ou arrêt l'augmente, et une
/// connexion d'une génération dépassée se ferme d'elle-même.
static LIVE_GEN: AtomicU64 = AtomicU64::new(0);

/// Chemin d'API accepté : sous `/social/`, sans remontée ni caractère étrange.
fn safe_path(path: &str) -> bool {
    path.starts_with("/social/")
        && path.len() <= 300
        && !path.contains("..")
        && path.bytes().all(|b| b.is_ascii_alphanumeric() || b"/_-?=&%.".contains(&b))
}

/// Message d'un refus du serveur, en clair.
fn social_message(e: &CallError) -> String {
    match e {
        CallError::Status(403) => "Impossible : vous n'êtes pas amis, ou les amis sont désactivés.".into(),
        CallError::Status(404) => "Ce joueur est introuvable.".into(),
        CallError::Status(429) => "Trop d'envois d'un coup, réessaie dans un moment.".into(),
        CallError::Status(400) => "Le serveur du compte a refusé la demande.".into(),
        CallError::Status(413) => "Image trop lourde.".into(),
        e => e.message(),
    }
}

impl Cloud {
    fn social_token(&self) -> Result<String, String> {
        crate::accounts::secret(VAULT_KEY).ok_or_else(|| "Ce poste n'est pas connecté au compte.".into())
    }

    fn social_failed(&self, e: CallError) -> String {
        if e == CallError::Unauthorized {
            log::info!("compte Hangar : jeton refusé, retour en anonyme");
            self.forget();
        }
        social_message(&e)
    }

    /// Appel JSON de l'API sociale (`GET`, `POST`, `PUT`, `DELETE` sous `/social/`).
    pub fn social(&self, method: &str, path: &str, body: Option<Value>) -> Result<Value, String> {
        if !matches!(method, "GET" | "POST" | "PUT" | "DELETE") || !safe_path(path) {
            return Err("Requête invalide.".into());
        }
        let token = self.social_token()?;
        let body = match (method, body) {
            ("POST" | "PUT", None) => Some(json!({})),
            (_, b) => b,
        };
        call(method, path, Some(&token), body.as_ref()).map_err(|e| self.social_failed(e))
    }

    /// Avatar ou bannière d'un compte en `data:` ; None : il n'en a pas (ou ne le montre pas).
    pub fn social_image(&self, kind: &str, user_id: &str) -> Result<Option<String>, String> {
        let max = match kind {
            "avatar" => AVATAR_MAX,
            "banner" => BANNER_MAX,
            _ => return Err("Requête invalide.".into()),
        };
        if !safe_user_id(user_id) {
            return Err("Requête invalide.".into());
        }
        let token = self.social_token()?;
        let path = format!("/social/users/{user_id}/{kind}");
        let res = match request("GET", &path, Some(&token)).call() {
            Ok(r) => r,
            Err(ureq::Error::Status(404, _)) => return Ok(None),
            Err(e) => return Err(self.social_failed(call_error(&path, e))),
        };
        let mut bytes = Vec::new();
        res.into_reader().take(max as u64 + 1).read_to_end(&mut bytes).map_err(|_| social_message(&CallError::Offline))?;
        if bytes.len() > max {
            return Ok(None);
        }
        Ok(image_type(&bytes).map(|k| format!("data:{k};base64,{}", base64::engine::general_purpose::STANDARD.encode(&bytes))))
    }

    /// Nouvelle bannière (déjà recadrée et réduite par l'app) ; rend sa version.
    pub fn social_banner(&self, bytes: Vec<u8>) -> Result<String, String> {
        if bytes.len() > BANNER_MAX {
            return Err("Image trop lourde (1 Mo au plus).".into());
        }
        let kind = image_type(&bytes).filter(|k| *k != "image/gif").ok_or("Image illisible : choisis un PNG, un JPEG ou un WebP.")?;
        let token = self.social_token()?;
        let res = request("PUT", "/social/banner", Some(&token)).set("Content-Type", kind).send_bytes(&bytes);
        let v: Value = res
            .map_err(|e| call_error("/social/banner", e))
            .and_then(|r| r.into_json().map_err(|_| CallError::Offline))
            .map_err(|e| self.social_failed(e))?;
        Ok(v["banner"].as_str().unwrap_or_default().to_string())
    }
}

// ─────────────────────────── Notifications ───────────────────────────

/// Texte sûr dans le XML d'un toast Windows.
#[cfg(windows)]
fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

/// Notification du système (nouveau message, demande d'ami). Windows : toast sous l'identité de
/// l'app (`app_id`, posée sur le raccourci par l'installeur) ; macOS : centre de notifications ;
/// Linux : `notify-send` s'il est installé. Au mieux : un échec est journalisé, sans plus.
pub fn notify(app_id: &str, title: &str, body: &str) {
    #[cfg(windows)]
    {
        use windows::core::HSTRING;
        use windows::Data::Xml::Dom::XmlDocument;
        use windows::UI::Notifications::{ToastNotification, ToastNotificationManager};
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
        let xml = format!(
            "<toast><visual><binding template=\"ToastGeneric\"><text>{}</text><text>{}</text></binding></visual></toast>",
            xml_escape(title),
            xml_escape(body)
        );
        let show = || -> windows::core::Result<()> {
            // SAFETY : thread à nous, sans appartement COM ; MTA pour les objets WinRT.
            let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
            let doc = XmlDocument::new()?;
            doc.LoadXml(&HSTRING::from(xml))?;
            let toast = ToastNotification::CreateToastNotification(&doc)?;
            ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(app_id))?.Show(&toast)
        };
        if let Err(e) = show() {
            log::warn!("notification impossible : {e}");
        }
    }
    #[cfg(not(windows))]
    {
        let _ = app_id;
        let res = if cfg!(target_os = "macos") {
            let q = |s: &str| s.replace('\\', "\\\\").replace('"', "\\\"");
            std::process::Command::new("osascript")
                .args(["-e", &format!("display notification \"{}\" with title \"{}\"", q(body), q(title))])
                .output()
        } else {
            std::process::Command::new("notify-send").args(["--app-name=Hangar", "--", title, body]).output()
        };
        if let Err(e) = res {
            log::warn!("notification impossible : {e}");
        }
    }
}

// ─────────────────────────── Temps réel ───────────────────────────

/// Ouvre (`on`) ou ferme la connexion temps réel. Les évènements de l'API arrivent dans l'app en
/// `social://event` ; `social://live` dit si la connexion est ouverte.
pub fn live(app: AppHandle, on: bool) {
    let gen = LIVE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    if on {
        std::thread::spawn(move || run_live(app, gen));
    }
}

fn current(gen: u64) -> bool {
    LIVE_GEN.load(Ordering::SeqCst) == gen
}

/// Échec de connexion : refus définitif (jeton, amis désactivés) ou passager (réseau).
enum LiveError {
    Refused,
    Retry,
}

type Socket = tungstenite::WebSocket<tungstenite::stream::MaybeTlsStream<TcpStream>>;

fn connect(token: &str) -> Result<Socket, LiveError> {
    use tungstenite::client::IntoClientRequest;
    let base = api();
    let url = format!("{}/social/live", base.replacen("https://", "wss://", 1).replacen("http://", "ws://", 1));
    let host = base.split("://").nth(1).unwrap_or_default().split('/').next().unwrap_or_default();
    let addr = if host.contains(':') { host.to_string() } else { format!("{host}:443") };
    let target = addr.to_socket_addrs().map_err(|_| LiveError::Retry)?.next().ok_or(LiveError::Retry)?;
    let stream = TcpStream::connect_timeout(&target, Duration::from_secs(15)).map_err(|_| LiveError::Retry)?;
    // Lecture par tranches d'une seconde : la boucle vérifie entre deux si elle doit s'arrêter.
    stream.set_read_timeout(Some(Duration::from_secs(1))).map_err(|_| LiveError::Retry)?;
    let mut req = url.into_client_request().map_err(|_| LiveError::Refused)?;
    let h = req.headers_mut();
    h.insert("Authorization", format!("Bearer {token}").parse().map_err(|_| LiveError::Refused)?);
    h.insert("User-Agent", "Hangar".parse().map_err(|_| LiveError::Refused)?);
    match tungstenite::client_tls(req, stream) {
        Ok((ws, _)) => Ok(ws),
        Err(tungstenite::HandshakeError::Failure(tungstenite::Error::Http(res))) => {
            let code = res.status().as_u16();
            log::warn!("compte Hangar : temps réel refusé ({code})");
            if matches!(code, 401 | 403) {
                Err(LiveError::Refused)
            } else {
                Err(LiveError::Retry)
            }
        }
        Err(_) => Err(LiveError::Retry),
    }
}

/// Lit les évènements jusqu'à la coupure ou l'arrêt demandé, avec un signe de vie régulier.
fn pump(app: &AppHandle, ws: &mut Socket, gen: u64) {
    let mut last_ping = Instant::now();
    while current(gen) {
        if last_ping.elapsed() >= PING_EVERY {
            if ws.send(tungstenite::Message::text("ping")).is_err() {
                return;
            }
            last_ping = Instant::now();
        }
        match ws.read() {
            Ok(tungstenite::Message::Text(t)) => {
                if let Ok(v) = serde_json::from_str::<Value>(t.as_str()) {
                    if v["type"] != "pong" {
                        let _ = app.emit("social://event", v);
                    }
                }
            }
            Ok(tungstenite::Message::Close(_)) => return,
            Ok(_) => {}
            Err(tungstenite::Error::Io(e)) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
            Err(_) => return,
        }
    }
    let _ = ws.close(None);
    let _ = ws.flush();
}

fn run_live(app: AppHandle, gen: u64) {
    let mut wait = Duration::from_secs(2);
    while current(gen) {
        let Some(token) = crate::accounts::secret(VAULT_KEY) else { break };
        match connect(&token) {
            Ok(mut ws) => {
                log::info!("compte Hangar : temps réel connecté");
                let _ = app.emit("social://live", true);
                wait = Duration::from_secs(2);
                pump(&app, &mut ws, gen);
                let _ = app.emit("social://live", false);
            }
            Err(LiveError::Refused) => break,
            Err(LiveError::Retry) => {}
        }
        let until = Instant::now() + wait;
        while current(gen) && Instant::now() < until {
            std::thread::sleep(Duration::from_millis(250));
        }
        wait = (wait * 2).min(RETRY_MAX);
    }
    if current(gen) {
        let _ = app.emit("social://live", false);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chemins_acceptes() {
        assert!(safe_path("/social/friends"));
        assert!(safe_path("/social/search?q=Bob%20Le%20Bricoleur"));
        assert!(safe_path("/social/messages/abcDEF12_-/read"));
        assert!(!safe_path("/me"));
        assert!(!safe_path("/social/../me"));
        assert!(!safe_path("/social/x y"));
        assert!(!safe_path("/social/x#y"));
        assert!(!safe_path(&format!("/social/{}", "a".repeat(300))));
    }

    #[test]
    fn messages_clairs() {
        assert!(social_message(&CallError::Status(429)).contains("réessaie"));
        assert!(social_message(&CallError::Status(403)).contains("amis"));
    }
}
