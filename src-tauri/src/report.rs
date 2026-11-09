//! Signalement de bug depuis Hangar : envoyé au webhook Discord du développeur.
//! L'adresse est fixée au build (`HANGAR_BUG_WEBHOOK`, secret GitHub), jamais dans le dépôt.

use std::path::Path;
use std::time::Duration;

const WEBHOOK: Option<&str> = option_env!("HANGAR_BUG_WEBHOOK");
const MAX_IMAGE: u64 = 8 * 1024 * 1024;
const BOUNDARY: &str = "hangar-bug-report-4f9c2e7a1b";

fn webhook() -> Option<&'static str> {
    WEBHOOK.filter(|u| u.starts_with("https://discord.com/api/webhooks/"))
}

/// Message Discord (2000 caractères au plus) : titre, description, version et système.
fn message(title: &str, description: &str) -> String {
    let title: String = title.trim().chars().take(100).collect();
    let desc: String = description.trim().chars().take(1700).collect();
    let foot = format!("-# Hangar {} - {}", env!("CARGO_PKG_VERSION"), std::env::consts::OS);
    if desc.is_empty() { format!("**{title}**\n{foot}") } else { format!("**{title}**\n{desc}\n{foot}") }
}

/// Image choisie par l'utilisateur : (nom, type MIME, octets), 8 Mo au plus.
fn read_image(path: &str) -> Result<(String, &'static str, Vec<u8>), String> {
    let p = Path::new(path);
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => return Err("La capture doit être une image PNG, JPG ou WebP.".into()),
    };
    if std::fs::metadata(p).map(|m| m.len()).unwrap_or(u64::MAX) > MAX_IMAGE {
        return Err("La capture dépasse 8 Mo.".into());
    }
    let bytes = std::fs::read(p).map_err(|_| "Impossible de lire la capture.".to_string())?;
    Ok((format!("capture.{ext}"), mime, bytes))
}

fn multipart(payload: &str, file: Option<(String, &str, Vec<u8>)>) -> Vec<u8> {
    let mut b = format!(
        "--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"payload_json\"\r\nContent-Type: application/json\r\n\r\n{payload}\r\n"
    )
    .into_bytes();
    if let Some((name, mime, bytes)) = file {
        b.extend(
            format!("--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"files[0]\"; filename=\"{name}\"\r\nContent-Type: {mime}\r\n\r\n")
                .as_bytes(),
        );
        b.extend(bytes);
        b.extend(b"\r\n");
    }
    b.extend(format!("--{BOUNDARY}--\r\n").as_bytes());
    b
}

pub fn send(title: &str, description: &str, screenshot: Option<&str>) -> Result<(), String> {
    let url = webhook().ok_or("Le signalement n'est pas disponible dans cette version de Hangar.")?;
    if title.trim().is_empty() {
        return Err("Donne un titre au bug.".into());
    }
    let file = screenshot.map(read_image).transpose()?;
    // Pas de mention possible : un signalement ne doit notifier personne.
    let payload = serde_json::json!({ "content": message(title, description), "allowed_mentions": { "parse": [] } });
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(30))
        .build()
        .post(url)
        .set("Content-Type", &format!("multipart/form-data; boundary={BOUNDARY}"))
        .send_bytes(&multipart(&payload.to_string(), file))
        .map(|_| ())
        .map_err(|e| {
            log::warn!("signalement de bug non envoyé : {e}");
            "Le signalement n'a pas pu partir. Vérifie ta connexion puis réessaie.".into()
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_borne_et_signe() {
        let m = message(&"t".repeat(300), &"d".repeat(5000));
        assert!(m.chars().count() <= 2000);
        assert!(m.starts_with(&format!("**{}**", "t".repeat(100))));
        assert!(m.contains(env!("CARGO_PKG_VERSION")));
    }

    #[test]
    fn multipart_avec_capture() {
        let body = String::from_utf8_lossy(&multipart("{}", Some(("capture.png".into(), "image/png", vec![1, 2])))).into_owned();
        assert!(body.contains("name=\"payload_json\""));
        assert!(body.contains("filename=\"capture.png\""));
        assert!(body.ends_with(&format!("--{BOUNDARY}--\r\n")));
    }

    #[test]
    fn capture_refusee_hors_image() {
        assert!(read_image("notes.txt").is_err());
    }
}
