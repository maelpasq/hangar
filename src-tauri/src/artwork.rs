//! Jaquettes (2:3) et bannières trouvées automatiquement pour chaque jeu, quelle que soit
//! sa source : image native du store (Epic, GOG, Xbox), base GOG (multi-plateformes),
//! CDN Steam (appid connu ou retrouvé par le nom), puis SteamGridDB si une clé est fournie.
//! Les images sont téléchargées par `Art::image` (cache disque, liste blanche d'hôtes).

use crate::art::Art;
use crate::model::Game;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

/// Un échec (ou un résultat incomplet) est retenté au bout de 3 jours.
const RETRY_MS: u64 = 3 * 24 * 3600 * 1000;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArtImage {
    pub path: String,
    pub landscape: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Artwork {
    pub cover: Option<ArtImage>,
    pub hero: Option<ArtImage>,
    pub source: String,
}

/// Image candidate d'une source, avant téléchargement.
#[derive(Clone, Debug, PartialEq)]
pub struct Cand {
    pub url: String,
    pub landscape: bool,
}

impl Cand {
    fn new(url: impl Into<String>, landscape: bool) -> Cand {
        Cand { url: https(url.into()), landscape }
    }
}

/// Candidats d'une source : jaquettes et bannières, par ordre de préférence.
#[derive(Default, Debug, PartialEq)]
pub struct Found {
    pub covers: Vec<Cand>,
    pub heroes: Vec<Cand>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct Entry {
    #[serde(flatten)]
    art: Artwork,
    at: u64,
}

#[derive(Serialize, Deserialize, Clone, Copy)]
struct SteamIdEntry {
    id: u32,
    at: u64,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CacheFile {
    #[serde(default)]
    entries: HashMap<String, Entry>,
    /// Nom normalisé -> appid Steam (0 = introuvable).
    #[serde(default)]
    steam_ids: HashMap<String, SteamIdEntry>,
}

pub struct Artworks {
    art: Arc<Art>,
    file: PathBuf,
    cache: Mutex<CacheFile>,
    epic: OnceLock<HashMap<String, Vec<Value>>>,
}

/// Erreur d'appel HTTP : code de statut, ou 0 pour une erreur réseau / JSON illisible.
type HttpErr = u16;

impl Artworks {
    pub fn new(art: Arc<Art>, cache_dir: &Path) -> Artworks {
        let file = cache_dir.join("artwork.json");
        let cache = fs::read_to_string(&file).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        Artworks { art, file, cache: Mutex::new(cache), epic: OnceLock::new() }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, CacheFile> {
        self.cache.lock().unwrap_or_else(|p| p.into_inner())
    }

    fn persist(&self, c: &CacheFile) {
        let Ok(bytes) = serde_json::to_vec(c) else { return };
        let tmp = self.file.with_extension(format!("{}.tmp", now()));
        if fs::write(&tmp, bytes).is_ok() && fs::rename(&tmp, &self.file).is_err() {
            let _ = fs::remove_file(&tmp);
        }
    }

    /// Jaquette et bannière d'un jeu (cache, puis chaîne de sources).
    pub fn find(&self, game: &Game, sgdb_key: Option<&str>, refresh: bool) -> Artwork {
        let key = sgdb_key.map(str::trim).filter(|k| !k.is_empty());
        // « v2 » : nouvelle source (Microsoft Store par le nom), les anciens échecs sont retentés.
        let ck = format!("{}|{}|v2", game.id, if key.is_some() { "sgdb" } else { "-" });
        if !refresh {
            if let Some(e) = self.lock().entries.get(&ck).cloned() {
                if entry_usable(&e, now()) {
                    return e.art;
                }
            }
        }
        let mut cacheable = true;
        let art = self.resolve(game, key, &mut cacheable);
        log::info!(
            "artwork {} : jaquette {}, bannière {} ({})",
            game.id,
            if art.cover.is_some() { "oui" } else { "non" },
            if art.hero.is_some() { "oui" } else { "non" },
            if art.source.is_empty() { "aucune source" } else { &art.source }
        );
        if cacheable {
            let mut c = self.lock();
            c.entries.insert(ck, Entry { art: art.clone(), at: now() });
            self.persist(&c);
        }
        art
    }

    fn resolve(&self, game: &Game, key: Option<&str>, cacheable: &mut bool) -> Artwork {
        let mut out = Artwork::default();
        let mut sources: Vec<String> = vec![];
        let mut apply = |found: Found, name: &str, out: &mut Artwork| {
            let mut used = false;
            if out.cover.is_none() {
                out.cover = self.first(&found.covers);
                used |= out.cover.is_some();
            }
            if out.hero.is_none() {
                out.hero = self.first(&found.heroes);
                used |= out.hero.is_some();
            }
            if used && !sources.iter().any(|s| s == name) {
                sources.push(name.to_string());
            }
        };
        let done = |a: &Artwork| a.cover.is_some() && a.hero.is_some();

        // 1. Image native du store, puis la base GOG pour la même plateforme.
        match game.store.as_str() {
            "epic" => {
                if let Some((cid, app)) = epic_ids(&game.launch.target) {
                    let imgs = self.epic_catalog().get(&cid).cloned().unwrap_or_default();
                    let (sharp, blurry) = epic_candidates(&imgs);
                    apply(sharp, "epic", &mut out);
                    if !done(&out) {
                        apply(self.gamesdb("epic", &app), "gog", &mut out);
                    }
                    apply(blurry, "epic", &mut out);
                }
            }
            "gog" => {
                if let Some(id) = game.id.strip_prefix("gog:") {
                    apply(self.gamesdb("gog", id), "gog", &mut out);
                    if !done(&out) {
                        let url = format!("https://api.gog.com/products/{id}?expand=description");
                        if let Ok(v) = self.json(&url, None) {
                            apply(gog_product_candidates(&v), "gog", &mut out);
                        }
                    }
                }
            }
            "xbox" => {
                if let Some(pfn) = game.id.strip_prefix("xbox:") {
                    let url = format!(
                        "https://displaycatalog.mp.microsoft.com/v7.0/products/lookup?alternateId=PackageFamilyName&value={}&market=FR&languages=fr-fr&fieldsTemplate=details",
                        enc(pfn)
                    );
                    if let Ok(v) = self.json(&url, None) {
                        apply(xbox_candidates(&v), "xbox", &mut out);
                    }
                }
            }
            "ubisoft" => {
                if let Some(id) = game.id.strip_prefix("ubisoft:") {
                    apply(self.gamesdb("uplay", id), "gog", &mut out);
                }
            }
            _ => {}
        }
        if done(&out) {
            out.source = sources.join("+");
            return out;
        }

        // 2. Steam : appid natif, sinon retrouvé par le nom.
        let steam_id = game.steam_app_id.or_else(|| self.steam_id_for(&game.name));
        if let Some(id) = steam_id {
            apply(steam_candidates(id), "steam", &mut out);
            if !done(&out) {
                apply(self.gamesdb("steam", &id.to_string()), "gog", &mut out);
            }
        }

        // 3. Microsoft Store, par le nom (jeux hors Steam : VALORANT, Roblox...).
        if !done(&out) && game.store != "xbox" {
            if let Some(id) = self.ms_store_id(&game.name) {
                let url = format!("https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds={id}&market=FR&languages=fr-fr");
                if let Ok(v) = self.json(&url, None) {
                    apply(xbox_candidates(&v), "xbox", &mut out);
                }
            }
        }

        // 4. SteamGridDB (clé de l'utilisateur).
        if !done(&out) {
            if let Some(k) = key {
                match self.steamgriddb(k, steam_id, &game.name) {
                    Ok(found) => apply(found, "steamgriddb", &mut out),
                    Err(401) | Err(403) => {
                        log::warn!("SteamGridDB : clé refusée (401), vérifie-la dans les Paramètres");
                        *cacheable = false;
                    }
                    Err(_) => *cacheable = false,
                }
            }
        }

        // Dernier recours : l'en-tête Steam, affiché en paysage.
        if out.cover.is_none() {
            if let Some(id) = steam_id {
                apply(Found { covers: steam_header(id), heroes: vec![] }, "steam", &mut out);
            }
        }
        out.source = sources.join("+");
        out
    }

    /// Premier candidat téléchargeable.
    fn first(&self, cands: &[Cand]) -> Option<ArtImage> {
        cands.iter().find_map(|c| {
            self.art
                .image(&c.url)
                .map(|p| ArtImage { path: p.to_string_lossy().into_owned(), landscape: c.landscape })
        })
    }

    fn json(&self, url: &str, bearer: Option<&str>) -> Result<Value, HttpErr> {
        self.art.get_json(url, bearer)
    }

    fn gamesdb(&self, platform: &str, id: &str) -> Found {
        let url = format!("https://gamesdb.gog.com/platforms/{platform}/external_releases/{}", enc(id));
        self.json(&url, None).map(|v| gamesdb_candidates(&v)).unwrap_or_default()
    }

    fn epic_catalog(&self) -> &HashMap<String, Vec<Value>> {
        self.epic.get_or_init(|| {
            for p in crate::scanner::epic::catcache_paths() {
                if let Ok(raw) = fs::read(&p) {
                    let cat = parse_epic_catalog(&raw);
                    log::info!("Epic : catalogue local {} ({} entrées)", p.display(), cat.len());
                    return cat;
                }
            }
            log::info!("Epic : pas de catalogue local");
            HashMap::new()
        })
    }

    /// appid Steam retrouvé par le nom (même cache que les jaquettes).
    pub fn steam_id(&self, name: &str) -> Option<u32> {
        self.steam_id_for(name)
    }

    /// appid Steam d'un jeu hors Steam (cache 3 jours pour un échec).
    fn steam_id_for(&self, name: &str) -> Option<u32> {
        let k = crate::scanner::norm(name);
        if k.is_empty() {
            return None;
        }
        if let Some(e) = self.lock().steam_ids.get(&k).copied() {
            if e.id > 0 || now().saturating_sub(e.at) < RETRY_MS {
                return (e.id > 0).then_some(e.id);
            }
        }
        // Le nom d'origine accepte une correspondance par préfixe ; un nom raccourci
        // (sans « Launcher »...) doit correspondre exactement, pour éviter les faux amis.
        let id = name_variants(name)
            .iter()
            .enumerate()
            .find_map(|(i, n)| if i == 0 { self.art.resolve_steam_id(n) } else { self.art.resolve_steam_id_exact(n) });
        let mut c = self.lock();
        c.steam_ids.insert(k, SteamIdEntry { id: id.unwrap_or(0), at: now() });
        self.persist(&c);
        id
    }

    /// ProductId Microsoft Store d'un jeu dont le titre correspond exactement au nom.
    fn ms_store_id(&self, name: &str) -> Option<String> {
        name_variants(name).iter().find_map(|n| {
            let url = format!(
                "https://displaycatalog.mp.microsoft.com/v7.0/productFamilies/autosuggest?market=FR&languages=fr-fr&productFamilyNames=Games&query={}",
                enc(n)
            );
            ms_pick(&self.json(&url, None).ok()?, n)
        })
    }

    fn steamgriddb(&self, key: &str, steam_id: Option<u32>, name: &str) -> Result<Found, HttpErr> {
        const API: &str = "https://www.steamgriddb.com/api/v2";
        let base = match steam_id {
            Some(id) => format!("steam/{id}"),
            None => {
                let mut found = None;
                for n in name_variants(name) {
                    let v = self.json(&format!("{API}/search/autocomplete/{}", enc(&n)), Some(key))?;
                    if let Some(id) = sgdb_first_id(&v) {
                        found = Some(id);
                        break;
                    }
                }
                match found {
                    Some(id) => format!("game/{id}"),
                    None => return Ok(Found::default()),
                }
            }
        };
        let grids = self.json(&format!("{API}/grids/{base}?dimensions=600x900&types=static"), Some(key))?;
        let heroes = self.json(&format!("{API}/heroes/{base}?types=static"), Some(key)).unwrap_or(Value::Null);
        Ok(Found { covers: sgdb_images(&grids), heroes: sgdb_images(&heroes) })
    }
}

fn now() -> u64 {
    crate::tracker::now_ms()
}

/// Une entrée de cache est réutilisable si ses fichiers existent encore ; un résultat
/// incomplet ou vide expire au bout de 3 jours.
fn entry_usable(e: &Entry, now: u64) -> bool {
    let exists = |i: &Option<ArtImage>| i.as_ref().map(|i| Path::new(&i.path).is_file()).unwrap_or(true);
    if !exists(&e.art.cover) || !exists(&e.art.hero) {
        return false;
    }
    let complete = e.art.cover.is_some() && e.art.hero.is_some();
    complete || now.saturating_sub(e.at) < RETRY_MS
}

/// `//hote/...` vers `https://hote/...`.
fn https(url: String) -> String {
    if let Some(rest) = url.strip_prefix("//") {
        format!("https://{rest}")
    } else if let Some(rest) = url.strip_prefix("http://") {
        format!("https://{rest}")
    } else {
        url
    }
}

fn enc(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// Noms à essayer pour une recherche : nom nettoyé, puis sans suffixes courants.
pub fn name_variants(name: &str) -> Vec<String> {
    let clean = name.replace(['™', '®', '©'], "").split_whitespace().collect::<Vec<_>>().join(" ");
    let mut out = vec![clean.clone()];
    const SUFFIXES: &[&str] = &["launcher", "player", "enhanced", "edition", "remastered", "definitive edition"];
    let mut cur = clean;
    loop {
        let lower = cur.to_lowercase();
        let Some(s) = SUFFIXES.iter().find(|s| lower.ends_with(&format!(" {s}"))) else { break };
        cur = cur[..cur.len() - s.len() - 1].trim_end_matches([' ', '-', ':']).to_string();
        if cur.is_empty() {
            break;
        }
        out.push(cur.clone());
    }
    out.dedup();
    out.retain(|n| !n.is_empty());
    out
}

// ───────────────────────────── Steam ─────────────────────────────

pub fn steam_candidates(id: u32) -> Found {
    let shared = format!("https://shared.steamstatic.com/store_item_assets/steam/apps/{id}");
    let cdn = format!("https://cdn.cloudflare.steamstatic.com/steam/apps/{id}");
    Found {
        covers: vec![
            Cand::new(format!("{shared}/library_600x900_2x.jpg"), false),
            Cand::new(format!("{shared}/library_600x900.jpg"), false),
            Cand::new(format!("{cdn}/library_600x900_2x.jpg"), false),
        ],
        heroes: vec![Cand::new(format!("{shared}/library_hero.jpg"), true), Cand::new(format!("{cdn}/library_hero.jpg"), true)],
    }
}

fn steam_header(id: u32) -> Vec<Cand> {
    vec![
        Cand::new(format!("https://shared.steamstatic.com/store_item_assets/steam/apps/{id}/header.jpg"), true),
        Cand::new(format!("https://cdn.cloudflare.steamstatic.com/steam/apps/{id}/header.jpg"), true),
    ]
}

// ───────────────────────────── Epic ─────────────────────────────

/// `com.epicgames.launcher://apps/<ns>%3A<catalogItemId>%3A<appName>?...` -> (catalogItemId, appName).
pub fn epic_ids(target: &str) -> Option<(String, String)> {
    let rest = target.split("://apps/").nth(1)?.split('?').next()?;
    let parts: Vec<&str> = rest.split("%3A").collect();
    (parts.len() == 3).then(|| (parts[1].to_string(), parts[2].to_string()))
}

/// `catcache.bin` = JSON encodé en base64 : tableau d'entrées `{ id, namespace, keyImages }`.
pub fn parse_epic_catalog(raw: &[u8]) -> HashMap<String, Vec<Value>> {
    use base64::Engine;
    let text: Vec<u8> = raw.iter().copied().filter(|b| !b.is_ascii_whitespace()).collect();
    let Ok(json) = base64::engine::general_purpose::STANDARD.decode(text) else { return HashMap::new() };
    let Ok(Value::Array(items)) = serde_json::from_slice::<Value>(&json) else { return HashMap::new() };
    items
        .into_iter()
        .filter_map(|it| {
            let id = it.get("id")?.as_str()?.to_string();
            let imgs = it.get("keyImages")?.as_array()?.clone();
            Some((id, imgs))
        })
        .collect()
}

/// Candidats Epic : (images nettes, images en petite résolution à n'utiliser qu'en secours).
pub fn epic_candidates(imgs: &[Value]) -> (Found, Found) {
    let get = |t: &str| {
        imgs.iter().find(|i| i.get("type").and_then(Value::as_str) == Some(t)).and_then(|i| {
            let url = i.get("url")?.as_str()?.to_string();
            let w = i.get("width").and_then(Value::as_u64).unwrap_or(0);
            let h = i.get("height").and_then(Value::as_u64).unwrap_or(0);
            Some((url, w, h))
        })
    };
    let mut sharp = Found::default();
    let mut blurry = Found::default();
    if let Some((url, w, h)) = get("DieselGameBoxTall") {
        let c = Cand::new(url, w > h);
        if w >= 500 { sharp.covers.push(c) } else { blurry.covers.push(c) }
    }
    for t in ["DieselGameBox", "DieselStoreFrontWide", "OfferImageWide"] {
        if let Some((url, _, _)) = get(t) {
            sharp.heroes.push(Cand::new(url.clone(), true));
            blurry.covers.push(Cand::new(url, true));
        }
    }
    (sharp, blurry)
}

// ───────────────────────────── GOG ─────────────────────────────

/// Fiche `gamesdb.gog.com/platforms/<p>/external_releases/<id>` : jaquette verticale et fond.
pub fn gamesdb_candidates(v: &Value) -> Found {
    let game = v.get("game").unwrap_or(&Value::Null);
    let fmt = |k: &str| {
        game.get(k)
            .and_then(|x| x.get("url_format"))
            .and_then(Value::as_str)
            .map(|u| u.replace("{formatter}", "").replace("{ext}", "jpg"))
    };
    let mut f = Found::default();
    if let Some(u) = fmt("vertical_cover") {
        f.covers.push(Cand::new(u, false));
    }
    if let Some(u) = fmt("background") {
        f.heroes.push(Cand::new(u, true));
    }
    f
}

/// `api.gog.com/products/<id>` : `images.background` en bannière.
pub fn gog_product_candidates(v: &Value) -> Found {
    let mut f = Found::default();
    if let Some(u) = v.pointer("/images/background").and_then(Value::as_str) {
        f.heroes.push(Cand::new(u.to_string(), true));
    }
    f
}

// ───────────────────────────── Xbox ─────────────────────────────

/// `displaycatalog` : Poster (2:3) en jaquette, SuperHeroArt / TitledHeroArt en bannière.
pub fn xbox_candidates(v: &Value) -> Found {
    let imgs = v
        .pointer("/Products/0/LocalizedProperties/0/Images")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let by = |purpose: &str| {
        imgs.iter()
            .filter(|i| i.get("ImagePurpose").and_then(Value::as_str) == Some(purpose))
            .max_by_key(|i| i.get("Width").and_then(Value::as_u64).unwrap_or(0))
            .and_then(|i| {
                let w = i.get("Width").and_then(Value::as_u64).unwrap_or(0);
                let h = i.get("Height").and_then(Value::as_u64).unwrap_or(0);
                Some((i.get("Uri")?.as_str()?.to_string(), w, h))
            })
    };
    let mut f = Found::default();
    for p in ["Poster", "BoxArt"] {
        if let Some((u, w, h)) = by(p) {
            // BoxArt est carré : affiché comme une image paysage, centrée sur fond flou.
            f.covers.push(Cand::new(u, w >= h));
        }
    }
    for p in ["SuperHeroArt", "TitledHeroArt"] {
        if let Some((u, _, _)) = by(p) {
            f.heroes.push(Cand::new(u, true));
        }
    }
    f
}

/// Résultat d'`autosuggest` : premier jeu dont le titre (sans « - Windows », « - Xbox »...)
/// est exactement `name`, pour éviter les faux amis (Robux, guides...).
pub fn ms_pick(v: &Value, name: &str) -> Option<String> {
    let want = crate::scanner::norm(name);
    v.get("Results")?.as_array()?.iter().flat_map(|r| r.get("Products").and_then(Value::as_array).into_iter().flatten()).find_map(|p| {
        if p.get("Type")?.as_str()? != "Game" {
            return None;
        }
        let title = p.get("Title")?.as_str()?;
        let base = [" - Windows", " - Xbox", " pour Windows", " for Windows", " (PC)"]
            .iter()
            .find_map(|s| title.strip_suffix(s))
            .unwrap_or(title);
        (crate::scanner::norm(base) == want).then(|| p.get("ProductId")?.as_str().map(String::from))?
    })
}

// ───────────────────────────── SteamGridDB ─────────────────────────────

pub fn sgdb_first_id(v: &Value) -> Option<u64> {
    v.get("data")?.as_array()?.first()?.get("id")?.as_u64()
}

pub fn sgdb_images(v: &Value) -> Vec<Cand> {
    v.get("data")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|i| {
                    let url = i.get("url")?.as_str()?.to_string();
                    let w = i.get("width").and_then(Value::as_u64).unwrap_or(0);
                    let h = i.get("height").and_then(Value::as_u64).unwrap_or(0);
                    Some(Cand::new(url, w > h))
                })
                .take(3)
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn identifiants_epic() {
        let t = "com.epicgames.launcher://apps/fn%3A4fe75bbc5a674f4f9b356b5c90567da5%3AFortnite?action=launch&silent=true";
        assert_eq!(epic_ids(t), Some(("4fe75bbc5a674f4f9b356b5c90567da5".into(), "Fortnite".into())));
        assert_eq!(epic_ids("steam://rungameid/1"), None);
    }

    #[test]
    fn catalogue_epic() {
        use base64::Engine;
        let cat = json!([
            { "id": "cid1", "namespace": "fn", "title": "Fortnite", "keyImages": [
                { "type": "DieselGameBoxTall", "width": 1200, "height": 1600, "url": "https://cdn1.epicgames.com/item/fn/tall" },
                { "type": "DieselGameBox", "width": 2560, "height": 1440, "url": "https://cdn1.epicgames.com/item/fn/wide image.jpg" }
            ]},
            { "id": "cid2", "keyImages": [
                { "type": "DieselGameBoxTall", "width": 340, "height": 440, "url": "https://cdn1.epicgames.com/x/small" }
            ]},
            { "pas": "d'id" }
        ]);
        let raw = base64::engine::general_purpose::STANDARD.encode(cat.to_string());
        let map = parse_epic_catalog(raw.as_bytes());
        assert_eq!(map.len(), 2);
        let (sharp, blurry) = epic_candidates(&map["cid1"]);
        assert_eq!(sharp.covers, vec![Cand::new("https://cdn1.epicgames.com/item/fn/tall", false)]);
        assert_eq!(sharp.heroes[0].url, "https://cdn1.epicgames.com/item/fn/wide image.jpg");
        assert!(blurry.covers.iter().all(|c| c.landscape));
        // Jaquette trop petite : seulement en secours.
        let (sharp, blurry) = epic_candidates(&map["cid2"]);
        assert!(sharp.covers.is_empty());
        assert_eq!(blurry.covers.len(), 1);
        assert!(parse_epic_catalog(b"pas du base64 !").is_empty());
    }

    #[test]
    fn catalogue_xbox() {
        let v = json!({ "Products": [{ "LocalizedProperties": [{ "Images": [
            { "ImagePurpose": "Screenshot", "Width": 3840, "Height": 2160, "Uri": "//store-images.s-microsoft.com/s" },
            { "ImagePurpose": "BoxArt", "Width": 2160, "Height": 2160, "Uri": "//store-images.s-microsoft.com/b" },
            { "ImagePurpose": "Poster", "Width": 1440, "Height": 2160, "Uri": "//store-images.s-microsoft.com/p" },
            { "ImagePurpose": "TitledHeroArt", "Width": 1920, "Height": 1080, "Uri": "//store-images.s-microsoft.com/t" },
            { "ImagePurpose": "SuperHeroArt", "Width": 3840, "Height": 2160, "Uri": "//store-images.s-microsoft.com/h" }
        ]}]}]});
        let f = xbox_candidates(&v);
        assert_eq!(f.covers[0], Cand::new("https://store-images.s-microsoft.com/p", false));
        assert_eq!(f.covers[1], Cand::new("https://store-images.s-microsoft.com/b", true));
        assert_eq!(f.heroes[0].url, "https://store-images.s-microsoft.com/h");
        assert_eq!(f.heroes[1].url, "https://store-images.s-microsoft.com/t");
        assert_eq!(xbox_candidates(&json!({ "Products": [] })), Found::default());
    }

    #[test]
    fn fiches_gog() {
        let v = json!({ "game": {
            "vertical_cover": { "url_format": "https://images.gog.com/abc{formatter}.{ext}?namespace=gamesdb" },
            "background": { "url_format": "https://images.gog.com/def{formatter}.{ext}?namespace=gamesdb" }
        }});
        let f = gamesdb_candidates(&v);
        assert_eq!(f.covers[0].url, "https://images.gog.com/abc.jpg?namespace=gamesdb");
        assert_eq!(f.heroes[0].url, "https://images.gog.com/def.jpg?namespace=gamesdb");
        let p = json!({ "images": { "background": "//images-1.gog-statics.com/x.jpg" } });
        assert_eq!(gog_product_candidates(&p).heroes[0].url, "https://images-1.gog-statics.com/x.jpg");
        assert_eq!(gamesdb_candidates(&json!({})), Found::default());
    }

    #[test]
    fn recherche_microsoft_store() {
        let v = json!({ "Results": [
            { "Products": [{ "ProductId": "C3S", "Type": "Consumable", "Title": "Roblox" }] },
            { "Products": [{ "ProductId": "BQ1", "Type": "Game", "Title": "Roblox - Xbox" }] },
            { "Products": [{ "ProductId": "9NK", "Type": "Game", "Title": "PC VALORANT Guide" }] },
            { "Products": [{ "ProductId": "9N1", "Type": "Game", "Title": "VALORANT" }] }
        ]});
        assert_eq!(ms_pick(&v, "Roblox").as_deref(), Some("BQ1"));
        assert_eq!(ms_pick(&v, "Valorant").as_deref(), Some("9N1"));
        assert_eq!(ms_pick(&v, "Hytale"), None);
        assert_eq!(ms_pick(&json!({ "Results": [] }), "Roblox"), None);
    }

    #[test]
    fn reponses_steamgriddb() {
        let s = json!({ "success": true, "data": [{ "id": 5261, "name": "Hytale" }, { "id": 9 }] });
        assert_eq!(sgdb_first_id(&s), Some(5261));
        assert_eq!(sgdb_first_id(&json!({ "data": [] })), None);
        let g = json!({ "data": [
            { "url": "https://cdn2.steamgriddb.com/grid/a.png", "width": 600, "height": 900 },
            { "url": "https://cdn2.steamgriddb.com/grid/b.png", "width": 920, "height": 430 }
        ]});
        let c = sgdb_images(&g);
        assert_eq!(c[0], Cand::new("https://cdn2.steamgriddb.com/grid/a.png", false));
        assert!(c[1].landscape);
    }

    #[test]
    fn variantes_de_nom() {
        assert_eq!(name_variants("Hytale Launcher"), vec!["Hytale Launcher", "Hytale"]);
        assert_eq!(
            name_variants("Grand Theft Auto V Enhanced"),
            vec!["Grand Theft Auto V Enhanced", "Grand Theft Auto V"]
        );
        assert_eq!(name_variants("Rocket League®"), vec!["Rocket League"]);
        assert_eq!(name_variants("Roblox Player"), vec!["Roblox Player", "Roblox"]);
        assert_eq!(name_variants("Launcher"), vec!["Launcher"]);
    }

    #[test]
    fn candidats_steam() {
        let f = steam_candidates(620);
        assert!(f.covers[0].url.ends_with("/620/library_600x900_2x.jpg"));
        assert!(f.heroes[0].url.ends_with("/620/library_hero.jpg"));
        assert!(steam_header(620).iter().all(|c| c.landscape));
    }

    #[test]
    fn validite_du_cache() {
        let t = tempfile::tempdir().unwrap();
        let file = t.path().join("a.jpg");
        fs::write(&file, b"x").unwrap();
        let img = Some(ArtImage { path: file.to_string_lossy().into_owned(), landscape: false });
        let full = Entry { art: Artwork { cover: img.clone(), hero: img.clone(), source: "steam".into() }, at: 0 };
        assert!(entry_usable(&full, u64::MAX / 2));
        let empty = Entry { art: Artwork::default(), at: 1000 };
        assert!(entry_usable(&empty, 1000 + RETRY_MS - 1));
        assert!(!entry_usable(&empty, 1000 + RETRY_MS + 1));
        let gone = Entry {
            art: Artwork { cover: Some(ArtImage { path: "Z:\\absent.jpg".into(), landscape: false }), hero: None, source: String::new() },
            at: 0,
        };
        assert!(!entry_usable(&gone, 1));
    }
}

#[cfg(all(test, windows))]
mod reel {
    /// Chaîne complète sur les jeux détectés : `cargo test reel_artwork -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn reel_artwork() {
        let t = tempfile::tempdir().unwrap();
        let art = std::sync::Arc::new(crate::art::Art::new(t.path()));
        let aw = super::Artworks::new(art, t.path());
        let mut games = crate::scanner::scan_fast(&[]);
        games.extend(crate::scanner::scan_xbox(&games));
        let key = std::env::var("STEAMGRIDDB_KEY").ok().filter(|k| !k.trim().is_empty());
        let mut runs = vec![None];
        if key.is_some() {
            runs.push(key.clone());
        }
        for k in runs {
            println!("\n== SteamGridDB : {} ==", if k.is_some() { "avec clé" } else { "sans clé" });
            println!("{:<34} {:<10} {:<9} {:<9} source", "jeu", "store", "jaquette", "bannière");
            for g in &games {
                let a = aw.find(g, k.as_deref(), true);
                let mark = |i: &Option<super::ArtImage>| match i {
                    Some(i) if i.landscape => "paysage",
                    Some(_) => "oui",
                    None => "-",
                };
                println!("{:<34} {:<10} {:<9} {:<9} {}", g.name, g.store, mark(&a.cover), mark(&a.hero), a.source);
            }
        }
    }
}
