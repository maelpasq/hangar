//! Dossiers locaux : un jeu par sous-dossier, exécutable choisi par heuristique.

use super::exe::{best_exe, is_app};
use crate::model::{exe, Game};
use std::fs;
use std::path::Path;

pub fn detect_folder(root: &Path) -> Vec<Game> {
    let Ok(rd) = fs::read_dir(root) else {
        log::warn!("dossier local inaccessible : {}", root.display());
        return vec![];
    };
    let mut out = vec![];
    for e in rd.flatten() {
        if !e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let mut name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.starts_with('$') {
            continue;
        }
        // macOS : un `Jeu.app` posé directement dans le dossier est un jeu à lui seul.
        let x = if is_app(&e.path()) {
            name = e.path().file_stem().unwrap_or_default().to_string_lossy().into_owned();
            Some(e.path())
        } else {
            best_exe(&e.path(), &name)
        };
        let Some(x) = x else { continue };
        let p = e.path().to_string_lossy().into_owned();
        let mut g = Game::new(format!("local:{}", p.to_lowercase()), name, "local", exe(&x, ""));
        g.install_dir = Some(p);
        g.exe_path = Some(x.to_string_lossy().into_owned());
        out.push(g);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_jeu_par_sous_dossier() {
        let t = tempfile::tempdir().unwrap();
        for (d, f) in [("Alpha", "Alpha.exe"), ("Beta", "bin/Beta.exe"), ("Vide", "lisezmoi.txt")] {
            let p = t.path().join(d).join(f);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(p, b"x").unwrap();
        }
        let mut games = detect_folder(t.path());
        games.sort_by(|a, b| a.name.cmp(&b.name));
        assert_eq!(games.iter().map(|g| g.name.as_str()).collect::<Vec<_>>(), vec!["Alpha", "Beta"]);
        assert_eq!(games[0].launch.kind, "exe");
        assert!(games[1].exe_path.as_ref().unwrap().ends_with("Beta.exe"));
        assert!(detect_folder(&t.path().join("absent")).is_empty());
    }
}
