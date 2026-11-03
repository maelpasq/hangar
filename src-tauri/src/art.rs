//! Images : cache disque des jaquettes du CDN Steam, recherche Steam, icônes d'exe,
//! jaquettes personnalisées.

use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Condvar, Mutex};
use std::time::Duration;

const MAX_PARALLEL: usize = 6;
const MISS_TTL: Duration = Duration::from_secs(7 * 24 * 3600);
const MAX_IMAGE_BYTES: u64 = 25 * 1024 * 1024;

/// Hash FNV-1a 64 bits (noms de fichiers du cache).
pub fn hash(s: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

/// N'autorise que le CDN Steam en HTTPS.
pub fn allowed_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("").to_lowercase();
    !host.contains(':') && !host.contains('@') && (host == "steamstatic.com" || host.ends_with(".steamstatic.com"))
}

/// Sémaphore simple : au plus N téléchargements simultanés.
struct Slots {
    used: Mutex<usize>,
    cv: Condvar,
}

impl Slots {
    fn acquire(&self) {
        let mut u = self.used.lock().unwrap_or_else(|p| p.into_inner());
        while *u >= MAX_PARALLEL {
            u = self.cv.wait(u).unwrap_or_else(|p| p.into_inner());
        }
        *u += 1;
    }
    fn release(&self) {
        let mut u = self.used.lock().unwrap_or_else(|p| p.into_inner());
        *u = u.saturating_sub(1);
        self.cv.notify_one();
    }
}

pub struct Art {
    img_dir: PathBuf,
    icon_dir: PathBuf,
    agent: ureq::Agent,
    slots: Slots,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct SteamHit {
    pub id: u32,
    pub name: String,
}

fn fresh(path: &Path, ttl: Duration) -> bool {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.elapsed().ok())
        .map(|age| age < ttl)
        .unwrap_or(false)
}

impl Art {
    pub fn new(cache: &Path) -> Art {
        let img_dir = cache.join("img");
        let icon_dir = cache.join("icons");
        let _ = fs::create_dir_all(&img_dir);
        let _ = fs::create_dir_all(&icon_dir);
        Art {
            img_dir,
            icon_dir,
            agent: ureq::AgentBuilder::new().timeout(Duration::from_secs(8)).user_agent("Hangar/1.0").build(),
            slots: Slots { used: Mutex::new(0), cv: Condvar::new() },
        }
    }

    /// Chemin local d'une image distante, téléchargée si absente. `None` si introuvable.
    pub fn image(&self, url: &str) -> Option<PathBuf> {
        if !allowed_url(url) {
            log::warn!("image refusée (hôte non autorisé) : {url}");
            return None;
        }
        let h = hash(url);
        let file = self.img_dir.join(format!("{h}.jpg"));
        let miss = self.img_dir.join(format!("{h}.miss"));
        if fs::metadata(&file).map(|m| m.len() > 0).unwrap_or(false) {
            return Some(file);
        }
        if fresh(&miss, MISS_TTL) {
            return None;
        }
        self.slots.acquire();
        let res = self.download(url, &file, &miss);
        self.slots.release();
        res
    }

    fn download(&self, url: &str, file: &Path, miss: &Path) -> Option<PathBuf> {
        // Un autre appel a pu le télécharger pendant l'attente.
        if file.exists() {
            return Some(file.to_path_buf());
        }
        match self.agent.get(url).call() {
            Ok(resp) => {
                let ctype = resp.content_type().to_lowercase();
                if !ctype.starts_with("image/") {
                    let _ = fs::write(miss, b"");
                    return None;
                }
                let mut bytes = vec![];
                if resp.into_reader().take(MAX_IMAGE_BYTES).read_to_end(&mut bytes).is_err() || bytes.is_empty() {
                    return None;
                }
                let tmp = file.with_extension(format!("{}.tmp", crate::tracker::now_ms()));
                fs::write(&tmp, &bytes).ok()?;
                fs::rename(&tmp, file).ok()?;
                let _ = fs::remove_file(miss);
                Some(file.to_path_buf())
            }
            Err(ureq::Error::Status(code, _)) if (400..500).contains(&code) => {
                let _ = fs::write(miss, b"");
                None
            }
            Err(e) => {
                log::info!("image indisponible ({e}) : {url}");
                None
            }
        }
    }

    fn store_search(&self, term: &str) -> Vec<SteamHit> {
        let url = format!("https://store.steampowered.com/api/storesearch/?term={}&l=english&cc=US", urlencode(term));
        let v: Option<serde_json::Value> = self.agent.get(&url).call().ok().and_then(|r| r.into_json().ok());
        v.as_ref()
            .and_then(|v| v.get("items"))
            .and_then(|i| i.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|i| {
                        Some(SteamHit {
                            id: i.get("id")?.as_u64()? as u32,
                            name: i.get("name")?.as_str()?.to_string(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Cherche l'ID Steam correspondant à un nom de jeu (nom exact normalisé, puis préfixe).
    pub fn resolve_steam_id(&self, name: &str) -> Option<u32> {
        let clean = clean_name(name);
        if clean.trim().is_empty() {
            return None;
        }
        pick_match(&self.store_search(&clean), &clean)
    }

    /// 5 premiers résultats de recherche Steam ; un nombre est pris comme ID direct.
    pub fn search_steam(&self, query: &str) -> Vec<SteamHit> {
        let q = query.trim();
        if let Ok(id) = q.parse::<u32>() {
            return vec![SteamHit { id, name: format!("ID {id}") }];
        }
        if q.is_empty() {
            return vec![];
        }
        let mut hits = self.store_search(&clean_name(q));
        hits.truncate(5);
        hits
    }

    /// Icône 256 px d'un exe (PNG en cache), ou copie d'un logo d'image (Xbox).
    pub fn exe_icon(&self, path: &str) -> Option<PathBuf> {
        let lower = path.to_lowercase();
        let h = hash(&lower);
        if lower.ends_with(".png") || lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
            let src = find_image(Path::new(path))?;
            let ext = src.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_else(|| "png".into());
            let dest = self.icon_dir.join(format!("{h}.{ext}"));
            if !dest.exists() {
                fs::copy(&src, &dest).ok()?;
            }
            return Some(dest);
        }
        let dest = self.icon_dir.join(format!("{h}.png"));
        if dest.exists() {
            return Some(dest);
        }
        let miss = self.icon_dir.join(format!("{h}.miss"));
        if fresh(&miss, MISS_TTL) || !Path::new(path).exists() {
            return None;
        }
        match extract_icon_png(path) {
            Some(png) => {
                let tmp = dest.with_extension("tmp");
                fs::write(&tmp, png).ok()?;
                fs::rename(&tmp, &dest).ok()?;
                Some(dest)
            }
            None => {
                let _ = fs::write(&miss, b"");
                None
            }
        }
    }
}

/// Copie une image choisie par l'utilisateur dans le dossier des jaquettes.
pub fn import_cover(covers: &Path, game_id: &str, src: &str) -> Result<PathBuf, String> {
    let p = Path::new(src);
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !["jpg", "jpeg", "png", "webp"].contains(&ext.as_str()) {
        return Err("Choisis une image JPG, PNG ou WebP.".into());
    }
    if !p.is_file() {
        return Err("Image introuvable.".into());
    }
    fs::create_dir_all(covers).map_err(|e| format!("Dossier des jaquettes inaccessible : {e}"))?;
    let h = hash(game_id);
    // Retire les anciennes copies faites par Hangar pour ce jeu (jamais l'original).
    if let Ok(rd) = fs::read_dir(covers) {
        for e in rd.flatten() {
            if e.file_name().to_string_lossy().starts_with(&format!("{h}-")) {
                let _ = fs::remove_file(e.path());
            }
        }
    }
    let dest = covers.join(format!("{h}-{}.{ext}", crate::tracker::now_ms()));
    fs::copy(p, &dest).map_err(|e| format!("Copie impossible : {e}"))?;
    Ok(dest)
}

fn clean_name(name: &str) -> String {
    name.replace(['™', '®', '©'], "")
}

/// Choisit le résultat dont le nom normalisé est identique, sinon celui qui partage un préfixe.
pub fn pick_match(items: &[SteamHit], name: &str) -> Option<u32> {
    let target = crate::scanner::norm(name);
    items
        .iter()
        .find(|i| crate::scanner::norm(&i.name) == target)
        .or_else(|| {
            items.iter().find(|i| {
                let n = crate::scanner::norm(&i.name);
                n.len() > 3 && target.len() > 3 && (n.starts_with(&target) || target.starts_with(&n))
            })
        })
        .map(|i| i.id)
}

fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// Trouve une image existante (gère les variantes `.scale-XXX` des paquets Store).
fn find_image(p: &Path) -> Option<PathBuf> {
    if p.is_file() {
        return Some(p.to_path_buf());
    }
    let stem = p.file_stem()?.to_string_lossy().to_lowercase();
    let dir = p.parent()?;
    fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|f| {
            let n = f.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
            n.starts_with(&format!("{stem}.")) && n.ends_with(".png") && !n.contains("contrast")
        })
        .max_by_key(|f| fs::metadata(f).map(|m| m.len()).unwrap_or(0))
}

/// Extrait l'icône d'un fichier en 256 px via IShellItemImageFactory et l'encode en PNG.
#[cfg(windows)]
fn extract_icon_png(path: &str) -> Option<Vec<u8>> {
    use windows::core::HSTRING;
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
    };
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{
        IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY,
    };

    // SAFETY : appels COM/GDI classiques ; chaque ressource est libérée avant de sortir.
    unsafe {
        let init = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let result = (|| {
            let factory: IShellItemImageFactory = SHCreateItemFromParsingName(&HSTRING::from(path), None).ok()?;
            let hbmp = factory.GetImage(SIZE { cx: 256, cy: 256 }, SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK).ok()?;
            let obj = HGDIOBJ(hbmp.0);
            let mut bm = BITMAP::default();
            if GetObjectW(obj, std::mem::size_of::<BITMAP>() as i32, Some(&mut bm as *mut _ as *mut _)) == 0 {
                let _ = DeleteObject(obj);
                return None;
            }
            let (w, h) = (bm.bmWidth.max(1) as u32, bm.bmHeight.unsigned_abs().max(1));
            let mut info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: w as i32,
                    biHeight: -(h as i32),
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut px = vec![0u8; (w * h * 4) as usize];
            let dc = CreateCompatibleDC(None);
            let lines = GetDIBits(dc, hbmp, 0, h, Some(px.as_mut_ptr() as *mut _), &mut info, DIB_RGB_COLORS);
            let _ = DeleteDC(dc);
            let _ = DeleteObject(obj);
            if lines == 0 {
                return None;
            }
            Some(encode_png(bgra_to_rgba(px), w, h))
        })();
        if init.is_ok() {
            CoUninitialize();
        }
        result.flatten()
    }
}

#[cfg(not(windows))]
fn extract_icon_png(_path: &str) -> Option<Vec<u8>> {
    None
}

/// BGRA prémultiplié (GDI) vers RGBA. Sans canal alpha, l'image devient opaque.
#[cfg_attr(not(windows), allow(dead_code))]
fn bgra_to_rgba(mut px: Vec<u8>) -> Vec<u8> {
    let has_alpha = px.as_chunks::<4>().0.iter().any(|c| c[3] != 0);
    for c in px.as_chunks_mut::<4>().0 {
        c.swap(0, 2);
        if !has_alpha {
            c[3] = 255;
        } else if c[3] > 0 && c[3] < 255 {
            let a = c[3] as u32;
            for v in &mut c[..3] {
                *v = ((*v as u32 * 255 + a / 2) / a).min(255) as u8;
            }
        }
    }
    px
}

#[cfg(windows)]
fn encode_png(rgba: Vec<u8>, w: u32, h: u32) -> Option<Vec<u8>> {
    let mut out = vec![];
    {
        let mut enc = png::Encoder::new(&mut out, w, h);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut wr = enc.write_header().ok()?;
        wr.write_image_data(&rgba).ok()?;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hotes_autorises() {
        assert!(allowed_url("https://shared.steamstatic.com/store_item_assets/steam/apps/1/library_hero.jpg"));
        assert!(allowed_url("https://cdn.cloudflare.steamstatic.com/steam/apps/1/header.jpg"));
        assert!(!allowed_url("http://cdn.cloudflare.steamstatic.com/x.jpg"));
        assert!(!allowed_url("https://steamstatic.com.evil.io/x.jpg"));
        assert!(!allowed_url("https://evil.io/steamstatic.com/x.jpg"));
        assert!(!allowed_url("https://user@cdn.steamstatic.com/x.jpg"));
    }

    #[test]
    fn correspondance_steam() {
        let items = vec![
            SteamHit { id: 1, name: "Rocket League Sideswipe".into() },
            SteamHit { id: 252950, name: "Rocket League®".into() },
        ];
        assert_eq!(pick_match(&items, "Rocket League"), Some(252950));
        assert_eq!(pick_match(&items, "Rocket"), Some(1));
        assert_eq!(pick_match(&items, "Autre jeu"), None);
    }

    #[test]
    fn conversion_pixels() {
        let px = bgra_to_rgba(vec![10, 20, 30, 0, 1, 2, 3, 0]);
        assert_eq!(px, vec![30, 20, 10, 255, 3, 2, 1, 255]);
        let px = bgra_to_rgba(vec![0, 0, 128, 128, 0, 0, 0, 0]);
        assert_eq!(&px[..4], &[255, 0, 0, 128]);
    }

    #[test]
    fn jaquette_importee() {
        let t = tempfile::tempdir().unwrap();
        let src = t.path().join("img.PNG");
        fs::write(&src, b"png").unwrap();
        let covers = t.path().join("covers");
        let a = import_cover(&covers, "steam:1", &src.to_string_lossy()).unwrap();
        let b = import_cover(&covers, "steam:1", &src.to_string_lossy()).unwrap();
        assert!(!a.exists() || a == b);
        assert!(b.exists() && src.exists());
        assert!(import_cover(&covers, "x", "C:\\a.exe").is_err());
    }
}

#[cfg(all(test, windows))]
mod reel {
    #[test]
    #[ignore]
    fn icone_explorer() {
        let png = super::extract_icon_png(r"C:\Windows\explorer.exe").expect("icône");
        assert_eq!(&png[1..4], b"PNG");
        println!("icône : {} octets", png.len());
    }
}

#[cfg(test)]
mod reseau {
    /// Téléchargement réel depuis le CDN Steam : `cargo test reseau -- --ignored`.
    #[test]
    #[ignore]
    fn jaquette_et_recherche() {
        let t = tempfile::tempdir().unwrap();
        let art = super::Art::new(t.path());
        let ok = art.image("https://shared.steamstatic.com/store_item_assets/steam/apps/526870/library_600x900_2x.jpg");
        assert!(ok.is_some(), "jaquette Satisfactory");
        let miss = art.image("https://shared.steamstatic.com/store_item_assets/steam/apps/1/library_600x900_2x.jpg");
        assert!(miss.is_none());
        assert_eq!(art.resolve_steam_id("Hollow Knight"), Some(367520));
        assert!(art.search_steam("Factorio").iter().any(|h| h.id == 427520));
    }
}
