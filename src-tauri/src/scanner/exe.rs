//! Heuristique d'exécutable principal d'un dossier de jeu.

use super::norm;
use std::fs;
use std::path::{Path, PathBuf};

const EXE_BLACKLIST: &[&str] = &[
    "unins", "setup", "install", "redist", "vc_redist", "vcredist", "dxsetup", "dxwebsetup",
    "crash", "report", "helper", "update", "patch", "dotnet", "directx", "prereq", "easyanticheat",
    "battleye", "be_service", "cleanup", "quicksfv", "notification", "overlay", "touchup",
    "cefprocess", "subprocess", "webhelper", "elevate", "register", "uploader", "benchmark",
    "dxdiag", "physx", "oalinst", "7z", "python", "java", "node", "server", "anticheat",
];

const IGNORED_DIRS: &[&str] =
    &["_commonredist", "redist", "directx", "vcredist", "__installer", "support", "tools", "engine"];

fn collect_exes(dir: &Path, depth: u32, max: u32, out: &mut Vec<(PathBuf, u32, u64)>) {
    if depth > max || out.len() > 400 {
        return;
    }
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_dir() {
            let n = e.file_name().to_string_lossy().to_lowercase();
            if IGNORED_DIRS.iter().any(|x| n == *x) {
                continue;
            }
            collect_exes(&p, depth + 1, max, out);
        } else if p.extension().map(|x| x.eq_ignore_ascii_case("exe")).unwrap_or(false) {
            let size = e.metadata().map(|m| m.len()).unwrap_or(0);
            out.push((p, depth, size));
        }
    }
}

/// Choisit l'exécutable principal d'un dossier de jeu.
/// Priorité au launcher du jeu s'il existe, sinon l'exe qui ressemble au nom du jeu.
pub fn best_exe(dir: &Path, game_name: &str) -> Option<PathBuf> {
    let mut exes = vec![];
    collect_exes(dir, 0, 4, &mut exes);
    let target = norm(game_name);
    exes.into_iter()
        .filter(|(p, _, _)| {
            let n = p.file_stem().unwrap_or_default().to_string_lossy().to_lowercase();
            !EXE_BLACKLIST.iter().any(|b| n.contains(b))
        })
        .map(|(p, depth, size)| {
            let stem = norm(&p.file_stem().unwrap_or_default().to_string_lossy());
            let mut score: i64 = 0;
            if stem.contains("launcher") && depth <= 1 {
                score += 60;
            }
            if !target.is_empty()
                && (stem == target || (target.contains(&stem) && stem.len() > 2) || stem.contains(&target))
            {
                score += 45;
            }
            if stem.ends_with("shipping") || stem.ends_with("win64") {
                score += 15;
            }
            score -= depth as i64 * 8;
            score += ((size / 1_000_000) as i64 / 20).min(30);
            (p, score)
        })
        .max_by_key(|(_, s)| *s)
        .map(|(p, _)| p)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;

    fn file(root: &Path, rel: &str, mb: u64) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        File::create(&p).unwrap().set_len(mb * 1_000_000).unwrap();
    }

    #[test]
    fn launcher_prioritaire() {
        let t = tempfile::tempdir().unwrap();
        file(t.path(), "Minecraft Launcher.exe", 2);
        file(t.path(), "runtime/java.exe", 1);
        file(t.path(), "game/minecraft.exe", 50);
        assert_eq!(best_exe(t.path(), "Minecraft").unwrap().file_name().unwrap(), "Minecraft Launcher.exe");
    }

    #[test]
    fn nom_proche_et_shipping() {
        let t = tempfile::tempdir().unwrap();
        file(t.path(), "MyGame.exe", 1);
        file(t.path(), "MyGame/Binaries/Win64/MyGame-Win64-Shipping.exe", 300);
        file(t.path(), "Engine/Binaries/Win64/CrashReportClient.exe", 30);
        file(t.path(), "unins000.exe", 3);
        let b = best_exe(t.path(), "My Game").unwrap();
        assert_eq!(b.file_name().unwrap(), "MyGame-Win64-Shipping.exe");
    }

    #[test]
    fn exclusions_et_dossier_vide() {
        let t = tempfile::tempdir().unwrap();
        assert!(best_exe(t.path(), "X").is_none());
        file(t.path(), "_CommonRedist/vcredist_x64.exe", 20);
        file(t.path(), "setup.exe", 20);
        assert!(best_exe(t.path(), "X").is_none());
        file(t.path(), "Jeu.exe", 5);
        assert_eq!(best_exe(t.path(), "Autre").unwrap().file_name().unwrap(), "Jeu.exe");
    }
}
