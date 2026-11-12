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

/// Embed Discord : titre, description, version et système, capture en grand si elle est jointe.
fn embed(title: &str, description: &str, image: Option<&str>) -> serde_json::Value {
    let title: String = title.trim().chars().take(200).collect();
    let desc: String = description.trim().chars().take(3500).collect();
    let os = match std::env::consts::OS {
        "windows" => "Windows",
        "macos" => "macOS",
        "linux" => "Linux",
        o => o,
    };
    let mut e = serde_json::json!({
        "title": format!("🐛 {title}"),
        "description": if desc.is_empty() { "*Pas de description.*".to_string() } else { desc },
        "color": 0x7c6cff,
        "fields": [
            { "name": "Version", "value": format!("Hangar {}", env!("CARGO_PKG_VERSION")), "inline": true },
            { "name": "Système", "value": os, "inline": true },
        ],
    });
    if let Some(name) = image {
        e["image"] = serde_json::json!({ "url": format!("attachment://{name}") });
    }
    e
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
    let embed = embed(title, description, file.as_ref().map(|f| f.0.as_str()));
    let payload = serde_json::json!({ "embeds": [embed], "allowed_mentions": { "parse": [] } });
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(30))
        .build()
        .post(url)
        .set("Content-Type", &format!("multipart/form-data; boundary={BOUNDARY}"))
        .send_bytes(&multipart(&payload.to_string(), file))
        .map(|_| ())
        .map_err(|e| {
            // Jamais `{e}` : le texte des erreurs ureq commence par l'adresse du webhook, jeton compris.
            let why = match &e {
                ureq::Error::Status(code, _) => format!("code {code}"),
                ureq::Error::Transport(t) => format!("{:?}", t.kind()),
            };
            log::warn!("signalement de bug non envoyé : {why}");
            "Le signalement n'a pas pu partir. Vérifie ta connexion puis réessaie.".into()
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embed_borne_et_signe() {
        let e = embed(&"t".repeat(300), &"d".repeat(5000), Some("capture.png"));
        assert!(e["title"].as_str().unwrap().chars().count() <= 256);
        assert!(e["description"].as_str().unwrap().chars().count() <= 4096);
        assert!(e["fields"][0]["value"].as_str().unwrap().contains(env!("CARGO_PKG_VERSION")));
        assert_eq!(e["image"]["url"], "attachment://capture.png");
        assert!(embed("t", " ", None)["image"].is_null());
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
