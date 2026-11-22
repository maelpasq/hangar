//! Discord Rich Presence : « Joue à <jeu> » sur le profil Discord, via le client Discord
//! installé sur l'appareil (tube nommé sous Windows, socket Unix sous macOS). Seul réseau : l'icône
//! de l'exe d'un jeu sans jaquette, envoyée à l'API Hangar quand Discord est ouvert (`icon_url`).
//!
//! Protocole : trames `[op u32 LE][taille u32 LE][JSON]`. op 0 = poignée de main,
//! op 1 = commande (SET_ACTIVITY). Discord répond à chaque trame : on lit la réponse.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

/// Application Discord « Hangar » (portail développeur Discord). Identifiant public, pas un secret.
pub const CLIENT_ID: &str = "1568201256357466132";

/// Taille maximale d'une réponse lue (Discord renvoie quelques Ko au plus).
const MAX_FRAME: u32 = 64 * 1024;

#[cfg(windows)]
type Conn = std::fs::File;
#[cfg(not(windows))]
type Conn = std::os::unix::net::UnixStream;

#[derive(Default)]
pub struct Presence {
    conn: Mutex<Option<Conn>>,
    /// Icônes d'exe déjà envoyées à l'API Hangar pendant cette session : fichier local -> adresse
    /// publique (`None` : refusée ou envoi raté, pas de nouvel essai avant le prochain démarrage).
    icons: Mutex<HashMap<PathBuf, Option<String>>>,
}

/// Icône d'exe de 256 Ko au plus (PNG 256 px, la limite du serveur).
const ICON_MAX: u64 = 256 * 1024;

/// Clé de l'image Hangar du portail Discord, pour un jeu sans jaquette ni icône.
pub const LOGO_KEY: &str = HANGAR_ASSET;

/// Adresse rendue par l'API pour une icône : seulement une image servie par l'API elle-même.
fn icon_url_of(body: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    let url = v.get("url")?.as_str()?;
    let rest = url.strip_prefix(&format!("{}/icons/", crate::cloud::api()))?;
    let hash = rest.strip_suffix(".png")?;
    (hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit())).then(|| url.to_string())
}

#[cfg(test)]
mod icon_tests {
    use super::*;

    #[test]
    fn adresse_d_icone_seulement_de_l_api() {
        let hash = "a".repeat(64);
        let ok = format!("{}/icons/{hash}.png", crate::cloud::api());
        assert_eq!(icon_url_of(&format!(r#"{{"url":"{ok}"}}"#)), Some(ok));
        assert!(icon_url_of(&format!(r#"{{"url":"https://ailleurs.fr/icons/{hash}.png"}}"#)).is_none());
        assert!(icon_url_of(&format!(r#"{{"url":"{}/icons/x.png"}}"#, crate::cloud::api())).is_none());
        assert!(icon_url_of("pas du json").is_none());
    }
}

impl Presence {
    /// Adresse publique de l'icône d'exe d'un jeu sans jaquette, pour Discord (qui ne lit que des
    /// images en ligne) : le PNG est envoyé une fois à l'API Hangar (`POST /icons`, sans compte),
    /// qui le garde sous son empreinte. Discord fermé ou envoi raté : `None` (logo Hangar).
    pub fn icon_url(&self, file: &Path) -> Option<String> {
        if !self.ready() {
            return None; // Discord fermé : rien n'est envoyé.
        }
        if let Some(known) = self.icons.lock().unwrap_or_else(|p| p.into_inner()).get(file) {
            return known.clone();
        }
        let is_png = file.extension().is_some_and(|e| e.eq_ignore_ascii_case("png"));
        let small = std::fs::metadata(file).map(|m| m.len() <= ICON_MAX).unwrap_or(false);
        let url = if is_png && small {
            std::fs::read(file).ok().and_then(|bytes| {
                let res = ureq::AgentBuilder::new()
                    .timeout(Duration::from_secs(10))
                    .redirects(0)
                    .user_agent("Hangar")
                    .build()
                    .post(&format!("{}/icons", crate::cloud::api()))
                    .set("Content-Type", "image/png")
                    .send_bytes(&bytes);
                match res {
                    Ok(r) => r.into_string().ok().and_then(|b| icon_url_of(&b)),
                    Err(e) => {
                        let why = match &e {
                            ureq::Error::Status(code, _) => format!("code {code}"),
                            ureq::Error::Transport(t) => format!("{:?}", t.kind()),
                        };
                        log::info!("Discord : icône du jeu non envoyée ({why})");
                        None
                    }
                }
            })
        } else {
            None
        };
        self.icons.lock().unwrap_or_else(|p| p.into_inner()).insert(file.to_path_buf(), url.clone());
        url
    }

    /// Discord est ouvert (connexion gardée ou établie maintenant). La présence est souvent en
    /// cours d'envoi au même moment (début de partie) : on attend qu'elle libère la connexion,
    /// 5 s au plus (le tube Windows n'a pas de délai de lecture, un Discord figé la garde).
    fn ready(&self) -> bool {
        if CLIENT_ID.is_empty() {
            return false;
        }
        let mut waited = 0;
        let mut conn = loop {
            match self.conn.try_lock() {
                Ok(c) => break c,
                Err(std::sync::TryLockError::Poisoned(p)) => break p.into_inner(),
                Err(std::sync::TryLockError::WouldBlock) if waited < 5000 => {
                    std::thread::sleep(Duration::from_millis(50));
                    waited += 50;
                }
                Err(std::sync::TryLockError::WouldBlock) => return false,
            }
        };
        if conn.is_none() {
            *conn = connect();
        }
        conn.is_some()
    }
}

/// Trame IPC Discord.
pub fn frame(op: u32, payload: &serde_json::Value) -> Vec<u8> {
    let body = payload.to_string().into_bytes();
    let mut out = Vec::with_capacity(8 + body.len());
    out.extend_from_slice(&op.to_le_bytes());
    out.extend_from_slice(&(body.len() as u32).to_le_bytes());
    out.extend_from_slice(&body);
    out
}

/// Image « hangar » envoyée dans Discord (portail développeur > Rich Presence > Art Assets).
const HANGAR_ASSET: &str = "hangar";

/// Activité « en jeu » : le nom du jeu en titre (à la place de « Hangar »), « Lancé avec Hangar »
/// dessous, chronomètre depuis `start_ms`, et l'adresse web de sa jaquette si elle est connue, avec
/// l'icône Hangar dans le coin. Discord télécharge lui-même l'image.
pub fn activity(game: Option<(&str, u64, Option<&str>)>, nonce: u64) -> serde_json::Value {
    let activity = game.map(|(name, start_ms, cover)| {
        // Discord exige 2 à 128 caractères.
        let mut title: String = name.chars().take(128).collect();
        if title.chars().count() < 2 {
            title.push_str("  ");
        }
        let assets = match cover {
            Some(url) => serde_json::json!({
                "large_image": url,
                "large_text": title,
                "small_image": HANGAR_ASSET,
                "small_text": "Hangar",
            }),
            None => serde_json::json!({ "large_image": HANGAR_ASSET, "large_text": "Hangar" }),
        };
        serde_json::json!({
            "name": title,
            "details": "Lancé avec Hangar",
            "timestamps": { "start": start_ms / 1000 },
            "assets": assets,
        })
    });
    serde_json::json!({
        "cmd": "SET_ACTIVITY",
        "args": { "pid": std::process::id(), "activity": activity },
        "nonce": nonce.to_string(),
    })
}

fn read_frame(c: &mut Conn) -> std::io::Result<()> {
    let mut head = [0u8; 8];
    c.read_exact(&mut head)?;
    let len = u32::from_le_bytes([head[4], head[5], head[6], head[7]]);
    if len > MAX_FRAME {
        return Err(std::io::Error::other("trame Discord trop grande"));
    }
    let mut body = vec![0u8; len as usize];
    c.read_exact(&mut body)
}

fn send(c: &mut Conn, op: u32, payload: &serde_json::Value) -> std::io::Result<()> {
    c.write_all(&frame(op, payload))?;
    read_frame(c)
}

fn connect() -> Option<Conn> {
    for i in 0..10 {
        #[cfg(windows)]
        let c = std::fs::OpenOptions::new().read(true).write(true).open(format!(r"\\.\pipe\discord-ipc-{i}"));
        #[cfg(not(windows))]
        let c = {
            let dir = ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"]
                .iter()
                .find_map(|v| std::env::var(v).ok())
                .unwrap_or_else(|| "/tmp".into());
            let s = std::os::unix::net::UnixStream::connect(std::path::Path::new(&dir).join(format!("discord-ipc-{i}")));
            if let Ok(s) = &s {
                let _ = s.set_read_timeout(Some(std::time::Duration::from_secs(3)));
            }
            s
        };
        let Ok(mut c) = c else { continue };
        if send(&mut c, 0, &serde_json::json!({ "v": 1, "client_id": CLIENT_ID })).is_ok() {
            return Some(c);
        }
    }
    None
}

impl Presence {
    /// Affiche le jeu (nom, début en ms, adresse de la jaquette) ou efface la présence (`None`). Discord fermé : rien.
    pub fn set(&self, game: Option<(&str, u64, Option<&str>)>) {
        if CLIENT_ID.is_empty() {
            return;
        }
        // Le tube Windows n'a pas de délai de lecture : si Discord ne répond plus, l'appel en
        // cours reste bloqué. On ne s'empile pas derrière lui.
        // shortcut: une mise à jour arrivée pendant un envoi est ignorée, rare (début / fin de partie).
        let mut conn = match self.conn.try_lock() {
            Ok(c) => c,
            Err(std::sync::TryLockError::Poisoned(p)) => p.into_inner(),
            Err(std::sync::TryLockError::WouldBlock) => return,
        };
        // Deux essais : la connexion gardée a pu être coupée (Discord redémarré).
        for _ in 0..2 {
            if conn.is_none() {
                *conn = connect();
            }
            let Some(c) = conn.as_mut() else { return };
            match send(c, 1, &activity(game, crate::tracker::now_ms())) {
                Ok(()) => return,
                Err(e) => {
                    log::info!("Discord : présence non envoyée ({e})");
                    *conn = None;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trame_et_activite() {
        let f = frame(1, &serde_json::json!({ "a": 1 }));
        assert_eq!(&f[..4], &1u32.to_le_bytes());
        assert_eq!(u32::from_le_bytes([f[4], f[5], f[6], f[7]]) as usize, f.len() - 8);
        let a = activity(Some(("Hades", 1_700_000_000_000, Some("https://cdn2.steamgriddb.com/grid/a.png"))), 7);
        assert_eq!(a["args"]["activity"]["name"], "Hades");
        assert_eq!(a["args"]["activity"]["details"], "Lancé avec Hangar");
        assert_eq!(a["args"]["activity"]["timestamps"]["start"], 1_700_000_000);
        let assets = &a["args"]["activity"]["assets"];
        assert_eq!(assets["large_image"], "https://cdn2.steamgriddb.com/grid/a.png");
        assert_eq!(assets["small_image"], HANGAR_ASSET);
        let sans = activity(Some(("Jeu local", 0, None)), 1);
        assert_eq!(sans["args"]["activity"]["assets"]["large_image"], HANGAR_ASSET);
        assert!(sans["args"]["activity"]["assets"]["small_image"].is_null());
        assert!(activity(None, 1)["args"]["activity"].is_null());
        assert_eq!(activity(Some(("X", 0, None)), 1)["args"]["activity"]["name"].as_str().unwrap().chars().count(), 3);
    }
}
