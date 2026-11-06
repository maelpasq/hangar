//! Discord Rich Presence : « Joue à <jeu> » sur le profil Discord, via le client Discord
//! installé sur l'appareil (tube nommé sous Windows, socket Unix sous macOS). Aucun réseau.
//!
//! Protocole : trames `[op u32 LE][taille u32 LE][JSON]`. op 0 = poignée de main,
//! op 1 = commande (SET_ACTIVITY). Discord répond à chaque trame : on lit la réponse.

use std::io::{Read, Write};
use std::sync::Mutex;

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

/// Activité « en jeu » : nom du jeu et chronomètre depuis `start_ms`.
pub fn activity(game: Option<(&str, u64)>, nonce: u64) -> serde_json::Value {
    let activity = game.map(|(name, start_ms)| {
        // Discord exige 2 à 128 caractères.
        let mut details: String = name.chars().take(128).collect();
        if details.chars().count() < 2 {
            details.push_str("  ");
        }
        serde_json::json!({ "details": details, "timestamps": { "start": start_ms / 1000 } })
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
    /// Affiche le jeu (nom, début en ms) ou efface la présence (`None`). Discord fermé : rien.
    pub fn set(&self, game: Option<(&str, u64)>) {
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
        let a = activity(Some(("Hades", 1_700_000_000_000)), 7);
        assert_eq!(a["args"]["activity"]["details"], "Hades");
        assert_eq!(a["args"]["activity"]["timestamps"]["start"], 1_700_000_000);
        assert!(activity(None, 1)["args"]["activity"].is_null());
        assert_eq!(activity(Some(("X", 0)), 1)["args"]["activity"]["details"].as_str().unwrap().chars().count(), 3);
    }
}
