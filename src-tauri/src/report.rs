//! Signalement de bug depuis Hangar : envoyé à l'API du compte Hangar (`POST /bug`, sans compte),
//! qui le relaie au salon Discord du développeur. L'adresse du webhook reste dans les secrets du
//! serveur : elle n'est jamais dans l'app publiée (on pourrait l'en extraire).

use std::path::Path;
use std::time::Duration;

const MAX_IMAGE: u64 = 8 * 1024 * 1024;
const BOUNDARY: &str = "hangar-bug-report-4f9c2e7a1b";

fn os() -> &'static str {
    match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "macos",
        _ => "linux",
    }
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

/// Corps `multipart/form-data` : champs texte, puis la capture facultative.
fn multipart(fields: &[(&str, &str)], file: Option<(String, &str, Vec<u8>)>) -> Vec<u8> {
    let mut b = Vec::new();
    for (name, value) in fields {
        b.extend(format!("--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n").as_bytes());
    }
    if let Some((name, mime, bytes)) = file {
        b.extend(
            format!("--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"capture\"; filename=\"{name}\"\r\nContent-Type: {mime}\r\n\r\n")
                .as_bytes(),
        );
        b.extend(bytes);
        b.extend(b"\r\n");
    }
    b.extend(format!("--{BOUNDARY}--\r\n").as_bytes());
    b
}

/// Texte d'un champ : sans la limite du multipart (qui couperait le corps), borné en longueur.
fn clean(s: &str, max: usize) -> String {
    s.trim().replace(BOUNDARY, "").chars().take(max).collect()
}

pub fn send(title: &str, description: &str, screenshot: Option<&str>) -> Result<(), String> {
    let title = clean(title, 200);
    if title.is_empty() {
        return Err("Donne un titre au bug.".into());
    }
    let file = screenshot.map(read_image).transpose()?;
    let version = env!("CARGO_PKG_VERSION").replace('+', ".");
    let description = clean(description, 3500);
    let fields = [("title", title.as_str()), ("description", description.as_str()), ("version", version.as_str()), ("os", os())];
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(30))
        .redirects(0)
        .user_agent("Hangar")
        .build()
        .post(&format!("{}/bug", crate::cloud::api()))
        .set("Content-Type", &format!("multipart/form-data; boundary={BOUNDARY}"))
        .send_bytes(&multipart(&fields, file))
        .map(|_| ())
        .map_err(|e| match e {
            ureq::Error::Status(429, _) => "Trop de signalements envoyés, réessaie dans une heure.".into(),
            ureq::Error::Status(413, _) => "La capture est trop lourde.".into(),
            e => {
                let why = match &e {
                    ureq::Error::Status(code, _) => format!("code {code}"),
                    ureq::Error::Transport(t) => format!("{:?}", t.kind()),
                };
                log::warn!("signalement de bug non envoyé : {why}");
                "Le signalement n'a pas pu partir. Vérifie ta connexion puis réessaie.".into()
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn multipart_avec_capture() {
        let body = String::from_utf8_lossy(&multipart(&[("title", "t"), ("os", "windows")], Some(("capture.png".into(), "image/png", vec![1, 2]))))
            .into_owned();
        assert!(body.contains("name=\"title\"\r\n\r\nt\r\n"));
        assert!(body.contains("name=\"capture\"; filename=\"capture.png\""));
        assert!(body.ends_with(&format!("--{BOUNDARY}--\r\n")));
    }

    #[test]
    fn champs_bornes_sans_limite_du_multipart() {
        assert_eq!(clean(&format!("  a{BOUNDARY}b  "), 10), "ab");
        assert_eq!(clean(&"é".repeat(300), 200).chars().count(), 200);
    }

    #[test]
    fn capture_refusee_hors_image() {
        assert!(read_image("notes.txt").is_err());
    }
}
