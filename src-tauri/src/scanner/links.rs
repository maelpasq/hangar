//! Lien d'installation d'un jeu hors store : la page où le retrouver sur un autre poste.
//! Lu sur le disque seulement (registre, raccourcis Internet `.url`), jamais sur le réseau.

use std::path::Path;

/// Garde un lien `https://` propre (hôte présent, taille raisonnable), sinon rien.
pub fn https(raw: &str) -> Option<String> {
    let url = raw.trim().trim_matches('"');
    let rest = url.get(..8).filter(|p| p.eq_ignore_ascii_case("https://")).map(|_| &url[8..])?;
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    let ok = url.len() <= 500
        && host.contains('.')
        && !host.contains('@')
        && host.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':'))
        && url.chars().all(|c| c.is_ascii_graphic() && !matches!(c, '"' | '<' | '>' | '\\' | '`' | '|' | '^'));
    ok.then(|| url.to_string())
}

/// Cible d'un raccourci Internet (`URL=...` de la section `[InternetShortcut]`).
pub fn url_file(file: &Path) -> Option<String> {
    if std::fs::metadata(file).ok()?.len() > 64 * 1024 {
        return None;
    }
    let text = String::from_utf8_lossy(&std::fs::read(file).ok()?).into_owned();
    text.lines()
        .filter_map(|l| l.trim().split_once('='))
        .find(|(k, _)| k.trim().eq_ignore_ascii_case("url"))
        .and_then(|(_, v)| https(v))
}

/// Premier raccourci Internet valide d'un dossier (sans descendre), par ordre alphabétique.
pub fn in_dir(dir: &Path) -> Option<String> {
    let mut files: Vec<_> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().map(|x| x.eq_ignore_ascii_case("url")).unwrap_or(false))
        .take(50)
        .collect();
    files.sort();
    files.iter().find_map(|f| url_file(f))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn https_seulement() {
        assert_eq!(https(" https://www.celestegame.com/ ").as_deref(), Some("https://www.celestegame.com/"));
        assert_eq!(https("HTTPS://example.org/a?b=1").as_deref(), Some("HTTPS://example.org/a?b=1"));
        for bad in ["http://example.org", "steam://run/1", "https://", "https://localhost", "https://a@b.c", "https://ex ample.org", r"C:\jeu.exe", ""] {
            assert_eq!(https(bad), None, "{bad}");
        }
    }

    #[test]
    fn raccourci_internet_du_dossier() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("b.url"), "[InternetShortcut]\r\nURL=https://example.org/jeu\r\n").unwrap();
        std::fs::write(d.path().join("a.url"), "[InternetShortcut]\r\nURL=steam://run/1\r\n").unwrap();
        std::fs::write(d.path().join("lisezmoi.txt"), "URL=https://autre.example.org").unwrap();
        assert_eq!(in_dir(d.path()).as_deref(), Some("https://example.org/jeu"));
        assert_eq!(in_dir(&d.path().join("absent")), None);
    }
}
