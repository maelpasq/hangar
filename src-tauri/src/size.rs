//! Taille des dossiers de jeu, calculée en tâche de fond et mise en cache 24 h sur disque.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const TTL_MS: u64 = 24 * 3600 * 1000;

pub struct Sizes {
    file: PathBuf,
    cache: Mutex<Option<HashMap<String, (u64, u64)>>>,
}

/// Taille totale d'un dossier, sans suivre les liens symboliques ni les jonctions.
pub fn dir_size(dir: &Path) -> u64 {
    let mut total = 0;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            let Ok(m) = fs::symlink_metadata(e.path()) else { continue };
            if m.file_type().is_symlink() {
                continue;
            }
            if m.is_dir() {
                stack.push(e.path());
            } else {
                total += m.len();
            }
        }
    }
    total
}

impl Sizes {
    pub fn new(cache_dir: &Path) -> Sizes {
        Sizes { file: cache_dir.join("sizes.json"), cache: Mutex::new(None) }
    }

    fn with_cache<T>(&self, f: impl FnOnce(&mut HashMap<String, (u64, u64)>) -> T) -> T {
        let mut c = self.cache.lock().unwrap_or_else(|p| p.into_inner());
        let map = c.get_or_insert_with(|| {
            fs::read_to_string(&self.file).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
        });
        f(map)
    }

    /// Taille en octets (cache 24 h). `None` si le dossier n'existe pas.
    pub fn get(&self, path: &str) -> Option<u64> {
        let p = Path::new(path);
        if !p.is_dir() {
            return None;
        }
        let key = path.to_lowercase();
        let now = crate::tracker::now_ms();
        if let Some((bytes, at)) = self.with_cache(|m| m.get(&key).copied()) {
            if now.saturating_sub(at) < TTL_MS {
                return Some(bytes);
            }
        }
        let bytes = dir_size(p);
        let snapshot = self.with_cache(|m| {
            m.insert(key, (bytes, now));
            serde_json::to_vec(m).ok()
        });
        if let Some(b) = snapshot {
            let _ = crate::state::write_atomic(&self.file, &b);
        }
        Some(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn taille_et_cache() {
        let t = tempfile::tempdir().unwrap();
        let d = t.path().join("jeu");
        fs::create_dir_all(d.join("sous")).unwrap();
        fs::write(d.join("a.bin"), vec![0u8; 1000]).unwrap();
        fs::write(d.join("sous").join("b.bin"), vec![0u8; 500]).unwrap();
        let s = Sizes::new(t.path());
        assert_eq!(s.get(&d.to_string_lossy()), Some(1500));
        fs::write(d.join("c.bin"), vec![0u8; 10]).unwrap();
        // Toujours la valeur en cache pendant 24 h.
        assert_eq!(Sizes::new(t.path()).get(&d.to_string_lossy()), Some(1500));
        assert_eq!(s.get(&t.path().join("absent").to_string_lossy()), None);
    }
}
