//! Jeux installés hors store : clés de désinstallation et raccourcis (menu Démarrer, Bureau).
//!
//! Un candidat (exe) devient un jeu s'il est rangé dans un dossier « Jeux » / « Games »,
//! si c'est un launcher de jeu connu, si son éditeur est un éditeur de jeux, ou si son
//! dossier contient les marqueurs d'un moteur de jeu (Unity, Unreal, Godot, Steamworks...).
//! Les jeux trouvés vont dans le store « local ». Ceux déjà couverts par un store sont écartés.

use super::exe::best_exe;
use super::norm;
use crate::model::{exe, Game};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Un exécutable vu dans un raccourci ou une clé de désinstallation.
#[derive(Clone, Debug, Default)]
pub struct Candidate {
    pub name: String,
    pub exe: PathBuf,
    pub args: String,
    pub cwd: Option<String>,
    /// Dossier d'installation déclaré (clé de désinstallation).
    pub install_dir: Option<PathBuf>,
    pub publisher: Option<String>,
    /// Raccourci rangé dans un dossier « Jeux » / « Games ».
    pub in_games_folder: bool,
    /// Le nom vient d'une clé de désinstallation (plus propre qu'un nom de raccourci).
    pub from_registry: bool,
}

/// Exécutables des launchers de stores déjà couverts par leur propre détecteur.
const STORE_LAUNCHERS: &[&str] = &[
    "steam.exe", "steamwebhelper.exe", "epicgameslauncher.exe", "galaxyclient.exe", "ubisoftconnect.exe",
    "upc.exe", "uplay.exe", "eadesktop.exe", "origin.exe", "battle.net.exe", "battle.net launcher.exe",
    "riotclientservices.exe", "riotclientux.exe", "xboxpcapp.exe", "gamelaunchhelper.exe",
];

/// Morceaux de chemin qui désignent un launcher de store (le jeu est détecté à part).
const STORE_PATHS: &[&str] = &[r"\rockstar games\launcher\", r"\epic games\launcher\", r"\ubisoft game launcher\"];

/// Noms (normalisés) qui ne sont pas des jeux, même rangés dans un dossier « Jeux ».
const NOT_GAMES: &[&str] = &[
    "robloxstudio", "uninstall", "desinstall", "désinstall", "steam", "epicgameslauncher", "ubisoftconnect",
    "clientriot", "riotclient", "eaapp", "origin", "battlenet", "goggalaxy", "xbox", "rockstargameslauncher",
    "socialclub", "sdk", "redistributable", "runtime", "benchmark", "editor", "modkit", "dedicatedserver",
    "support", "website", "readme", "manual", "settings", "configur", "vanguard", "anticheat",
];

/// Morceaux de nom d'exe qui ne sont jamais le jeu lui-même.
const EXE_NOT_GAMES: &[&str] = &[
    "unins", "setup", "install", "update", "crash", "report", "helper", "redist", "vcredist", "dxsetup",
    "patcher", "repair", "cleanup", "elevate", "notification",
];

/// Launchers de jeux connus (nom de raccourci ou nom d'exe, normalisés).
const KNOWN_GAME_LAUNCHERS: &[&str] = &[
    "minecraftlauncher", "robloxplayer", "hytale", "lunarclient", "modrinthapp", "prismlauncher", "multimc",
    "polymc", "atlauncher", "gdlauncher", "curseforge", "technic", "ftbapp", "feedthebeast", "beammp", "osu",
    "tlauncher", "badlion", "featherlauncher", "labymod", "hoyoplay", "genshinimpact", "wutheringwaves",
    "warframe", "pathofexile", "wargaminggamecenter", "warthunder", "escapefromtarkov", "bsglauncher",
    "rsilauncher", "starcitizen", "jagexlauncher", "runescape", "eveonline", "leagueoflegends", "fortnite",
];

/// Éditeurs de jeux (normalisés) : une clé de désinstallation à leur nom est un jeu.
const GAME_PUBLISHERS: &[&str] = &[
    "rockstargames", "mojang", "hypixelstudios", "robloxcorporation", "moonsworth", "giantssoftware",
    "cdprojekt", "paradoxinteractive", "bandainamco", "squareenix", "capcom", "segaco", "2kgames", "bethesda",
    "hoyoverse", "mihoyo", "cognosphere", "kurogames", "wargaming", "gaijin", "krafton", "nexon", "ncsoft",
    "smilegate", "grindinggear", "digitalextremes", "hirez", "pearlabyss", "bungie", "facepunch", "relogic",
    "innersloth", "jagex", "ccpgames", "cloudimperium", "battlestate", "pawprintinteractive", "coffeestain",
    "nexiongames",
];

/// Fichiers qui trahissent un jeu (moteur, SDK de jeu, middleware).
const MARKER_FILES: &[&str] = &[
    "unityplayer.dll", "gameassembly.dll", "steam_api.dll", "steam_api64.dll", "eossdk-win64-shipping.dll",
    "eossdk-win32-shipping.dll", "discord_game_sdk.dll", "bink2w64.dll", "binkw64.dll", "binkw32.dll",
    "fmod.dll", "fmodstudio.dll", "fmod64.dll", "physx3_x64.dll", "physx_64.dll", "crysystem.dll",
    "galaxy64.dll", "galaxy.dll", "data.win", "easyanticheat_eos_setup.exe", "beclient_x64.dll",
];

/// Dossiers qui trahissent un jeu.
const MARKER_DIRS: &[&str] = &["easyanticheat", "battleye", "renpy", "mono", "monobleedingedge", "il2cpp_data"];

/// Dossiers génériques au-dessus desquels on ne cherche plus de marqueurs.
const GENERIC_DIRS: &[&str] = &[
    "programfiles", "programfilesx86", "programs", "appdata", "local", "roaming", "jeux", "games", "users",
    "windowsapps", "steamapps", "common",
];

/// Dossier de raccourcis qui signale des jeux.
pub fn is_games_folder(name: &str) -> bool {
    matches!(norm(name).as_str(), "jeux" | "jeu" | "games" | "game" | "gaming" | "jeuxvidéo" | "jeuxvideo" | "videogames")
}

fn lower(p: &Path) -> String {
    p.to_string_lossy().replace('/', "\\").to_lowercase()
}

fn file_lower(p: &Path) -> String {
    p.file_name().map(|f| f.to_string_lossy().to_lowercase()).unwrap_or_default()
}

/// Cherche les marqueurs de moteur dans un dossier (fichiers et sous-dossiers directs).
pub fn dir_has_markers(dir: &Path) -> bool {
    let Ok(rd) = fs::read_dir(dir) else { return false };
    for e in rd.flatten().take(600) {
        let name = e.file_name().to_string_lossy().to_lowercase();
        let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_dir {
            if MARKER_DIRS.contains(&name.as_str()) {
                return true;
            }
            // Unity : <jeu>_Data avec Managed, il2cpp_data ou globalgamemanagers
            if name.ends_with("_data") {
                let p = e.path();
                if p.join("Managed").is_dir() || p.join("il2cpp_data").is_dir() || p.join("globalgamemanagers").is_file() {
                    return true;
                }
            }
            // Unreal : Engine\Binaries
            if name == "engine" && e.path().join("Binaries").is_dir() {
                return true;
            }
        } else if MARKER_FILES.contains(&name.as_str())
            || name.ends_with("-win64-shipping.exe")
            || name.ends_with("-wingdk-shipping.exe")
            || name.ends_with(".pck")
        {
            return true;
        }
    }
    false
}

/// Marqueurs autour d'un exe : son dossier, puis jusqu'à deux parents (sans dépasser un dossier générique),
/// puis le dossier d'installation et ses sous-dossiers directs.
pub fn has_engine_markers(exe: &Path, install_dir: Option<&Path>) -> bool {
    let mut dir = exe.parent();
    for _ in 0..3 {
        let Some(d) = dir else { break };
        if d.parent().is_none() || GENERIC_DIRS.contains(&norm(&d.file_name().unwrap_or_default().to_string_lossy()).as_str()) {
            break;
        }
        if dir_has_markers(d) {
            return true;
        }
        dir = d.parent();
    }
    if let Some(root) = install_dir.filter(|r| r.parent().is_some()) {
        if dir_has_markers(root) {
            return true;
        }
        if let Ok(rd) = fs::read_dir(root) {
            for e in rd.flatten().take(60) {
                if e.file_type().map(|t| t.is_dir()).unwrap_or(false) && dir_has_markers(&e.path()) {
                    return true;
                }
            }
        }
    }
    false
}

fn is_store_launcher(exe: &Path) -> bool {
    let f = file_lower(exe);
    let p = lower(exe);
    STORE_LAUNCHERS.contains(&f.as_str()) || STORE_PATHS.iter().any(|s| p.contains(s))
}

fn is_system_path(exe: &Path) -> bool {
    let p = lower(exe);
    let win = std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".into()).to_lowercase();
    p.starts_with(&format!("{win}\\")) || p.contains(r"\windowsapps\")
}

fn known_launcher(c: &Candidate) -> bool {
    let n = norm(&c.name);
    let stem = norm(&c.exe.file_stem().unwrap_or_default().to_string_lossy());
    // Préfixe et non sous-chaîne : « artcraftlauncher » ne doit pas passer pour « tlauncher ».
    KNOWN_GAME_LAUNCHERS.iter().any(|k| n.starts_with(k) || stem.starts_with(k))
}

fn game_publisher(c: &Candidate) -> bool {
    c.publisher.as_deref().map(norm).map(|p| GAME_PUBLISHERS.iter().any(|g| p.contains(g))).unwrap_or(false)
}

/// Décide si un candidat est un jeu.
pub fn is_game(c: &Candidate) -> bool {
    if !c.exe.extension().map(|x| x.eq_ignore_ascii_case("exe")).unwrap_or(false) || !c.exe.is_file() {
        return false;
    }
    let n = norm(&c.name);
    let stem = c.exe.file_stem().unwrap_or_default().to_string_lossy().to_lowercase();
    if n.is_empty()
        || NOT_GAMES.iter().any(|x| n.contains(x))
        || EXE_NOT_GAMES.iter().any(|x| stem.contains(x))
        || is_store_launcher(&c.exe)
        || is_system_path(&c.exe)
    {
        return false;
    }
    c.in_games_folder
        || known_launcher(c)
        || game_publisher(c)
        || has_engine_markers(&c.exe, c.install_dir.as_deref())
}

/// Nom affichable : sans « for <utilisateur> », numéro de version, « Uninstall », « (x64) ».
pub fn clean_name(raw: &str) -> String {
    let mut s = raw.trim().to_string();
    for p in ["Uninstall ", "Désinstaller "] {
        if let Some(r) = s.strip_prefix(p) {
            s = r.to_string();
        }
    }
    if let Some(i) = s.find(" for ") {
        s.truncate(i);
    }
    for suffix in ["(x64)", "(x86)", "(64-bit)", "(32-bit)"] {
        if let Some(r) = s.strip_suffix(suffix) {
            s = r.trim_end().to_string();
        }
    }
    // Retire un numéro de version final : « 2.8.0 », « v1.2 », « version 2.8.0 »
    loop {
        let t = s.trim_end();
        let Some((head, last)) = t.rsplit_once(' ') else { break };
        // Un numéro seul (« Farming Simulator 22 ») fait partie du nom : il faut un point ou un « v ».
        let l = last.trim_start_matches(['v', 'V']);
        let digits = !l.is_empty() && l.chars().all(|c| c.is_ascii_digit() || c == '.') && l.chars().any(|c| c.is_ascii_digit());
        let is_version = digits && (l.contains('.') || l.len() < last.len());
        let is_word = last.eq_ignore_ascii_case("version");
        if is_version || is_word {
            s = head.to_string();
        } else {
            break;
        }
    }
    s.trim().trim_end_matches(['-', ' ']).to_string()
}

/// « Hytale Launcher » devient « Hytale » (le launcher reste affiché dans « Se lance via »).
fn split_launcher(name: &str) -> (String, Option<String>) {
    let lowered = name.to_lowercase();
    for suffix in [" launcher", "-launcher", "_launcher"] {
        if lowered.ends_with(suffix) && name.len() > suffix.len() + 1 {
            let base = name[..name.len() - suffix.len()].trim().to_string();
            return (base, Some(name.replace(['-', '_'], " ")));
        }
    }
    (name.to_string(), None)
}

/// Segment de chemin qui change à chaque mise à jour (Roblox `version-xxxx`, Squirrel `app-1.2.3`).
fn is_version_segment(seg: &str) -> bool {
    let s = seg.to_lowercase();
    let hex = |t: &str| !t.is_empty() && t.chars().all(|c| c.is_ascii_hexdigit());
    let ver = |t: &str| !t.is_empty() && t.chars().all(|c| c.is_ascii_digit() || c == '.');
    s.strip_prefix("version-").map(hex).unwrap_or(false) || s.strip_prefix("app-").map(ver).unwrap_or(false)
}

/// Dossier stable du jeu : le dossier de l'exe, en remontant au-dessus d'un segment de version.
pub fn stable_dir(exe: &Path) -> PathBuf {
    let mut dir = exe.parent().map(Path::to_path_buf).unwrap_or_default();
    if let Some(i) = dir.components().position(|c| is_version_segment(&c.as_os_str().to_string_lossy())) {
        dir = dir.components().take(i).collect();
        // `...\Roblox\Versions\version-x` : on garde `...\Roblox`
        if dir.file_name().map(|f| f.to_string_lossy().eq_ignore_ascii_case("versions")).unwrap_or(false) {
            dir.pop();
        }
    }
    dir
}

fn modified(p: &Path) -> std::time::SystemTime {
    fs::metadata(p).and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH)
}

/// Transforme les candidats retenus en jeux, un par dossier stable.
/// Le nom vient de préférence du registre, le lancement d'un raccourci, l'exe le plus récent gagne.
pub fn to_games(cands: Vec<Candidate>) -> Vec<Game> {
    let mut groups: HashMap<String, Vec<Candidate>> = HashMap::new();
    for c in cands.into_iter().filter(is_game) {
        let dir = match &c.install_dir {
            // Dossier déclaré, ramené au-dessus d'un éventuel segment de version (Roblox)
            Some(d) if lower(&c.exe).starts_with(&format!("{}\\", lower(d).trim_end_matches('\\'))) => {
                stable_dir(&d.join("x"))
            }
            _ => stable_dir(&c.exe),
        };
        groups.entry(lower(&dir).trim_end_matches('\\').to_string()).or_default().push(c);
    }
    let mut out = vec![];
    for (key, mut list) in groups {
        list.sort_by_key(|c| std::cmp::Reverse(modified(&c.exe)));
        let launch_from = list.iter().find(|c| !c.from_registry).unwrap_or(&list[0]).clone();
        let named = list.iter().find(|c| c.from_registry).unwrap_or(&launch_from);
        let (name, launcher) = split_launcher(&clean_name(&named.name));
        let dir = list
            .iter()
            .flat_map(|c| c.install_dir.iter().map(|d| stable_dir(&d.join("x"))).chain([stable_dir(&c.exe)]))
            .find(|d| key == lower(d).trim_end_matches('\\'))
            .unwrap_or_else(|| stable_dir(&launch_from.exe));
        let mut launch = exe(&launch_from.exe, &launch_from.args);
        if let Some(cwd) = launch_from.cwd.clone().filter(|c| Path::new(c).is_dir()) {
            launch.cwd = Some(cwd);
        }
        let mut g = Game::new(format!("local:{key}"), name, "local", launch);
        if let Some(l) = launcher {
            g.launcher_name = l;
        }
        g.install_dir = Some(dir.to_string_lossy().into_owned());
        g.exe_path = Some(launch_from.exe.to_string_lossy().into_owned());
        for c in &list {
            let f = c.exe.file_name().unwrap_or_default().to_string_lossy().into_owned();
            if !g.process_names.iter().any(|p| p.eq_ignore_ascii_case(&f)) {
                g.process_names.push(f);
            }
        }
        out.push(g);
    }
    out
}

/// Écarte les jeux locaux situés dans le dossier d'un jeu déjà trouvé par un store.
pub fn drop_nested(games: Vec<Game>) -> Vec<Game> {
    let store_dirs: Vec<String> = games
        .iter()
        .filter(|g| g.store != "local" && g.store != "manual")
        .filter_map(|g| g.install_dir.as_deref())
        .map(|d| d.replace('/', "\\").trim_end_matches('\\').to_lowercase())
        .filter(|d| d.len() > 3)
        .collect();
    games
        .into_iter()
        .filter(|g| {
            if g.store != "local" {
                return true;
            }
            let paths = [g.install_dir.as_deref(), g.exe_path.as_deref()];
            !paths.iter().flatten().any(|p| {
                let p = p.replace('/', "\\").to_lowercase();
                store_dirs.iter().any(|d| p == *d || p.starts_with(&format!("{d}\\")))
            })
        })
        .collect()
}

// ─────────────────────────── Collecte (Windows) ───────────────────────────

#[cfg(windows)]
mod win {
    use super::Candidate;
    use crate::scanner::registry::{uninstall_entries, val};
    use std::path::{Path, PathBuf};
    use windows::core::{Interface, HSTRING, PWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED, STGM_READ,
    };
    use windows::Win32::UI::Shell::{
        FOLDERID_CommonPrograms, FOLDERID_Desktop, FOLDERID_Programs, FOLDERID_PublicDesktop, IShellLinkW,
        SHGetKnownFolderPath, ShellLink, KF_FLAG_DEFAULT,
    };

    /// Mots qui signalent une clé gérée par un store déjà détecté ailleurs.
    const STORE_MANAGED: &[&str] = &[
        "steam://", r"\steam\", "uplay://", "ubisoft game launcher", r"riot games\metadata", "riotclientservices",
        "battle.net", "eadesktop", r"\ea app\", r"\origin\", r"epic games\launcher", "goggalaxy", r"\gog galaxy\",
    ];

    fn known_folder(id: &windows::core::GUID) -> Option<PathBuf> {
        unsafe {
            let p: PWSTR = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None).ok()?;
            let s = p.to_string().ok();
            CoTaskMemFree(Some(p.0 as *const _));
            s.map(PathBuf::from)
        }
    }

    fn buf_to_string(b: &[u16]) -> String {
        let end = b.iter().position(|c| *c == 0).unwrap_or(b.len());
        String::from_utf16_lossy(&b[..end])
    }

    /// Résout un .lnk : (cible, arguments, dossier de travail).
    fn resolve(link: &Path) -> Option<(PathBuf, String, Option<String>)> {
        unsafe {
            let sl: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
            let pf: IPersistFile = sl.cast().ok()?;
            pf.Load(&HSTRING::from(link.as_os_str()), STGM_READ).ok()?;
            let mut target = [0u16; 1024];
            sl.GetPath(&mut target, std::ptr::null_mut(), 0).ok()?;
            let mut args = [0u16; 2048];
            let _ = sl.GetArguments(&mut args);
            let mut cwd = [0u16; 1024];
            let _ = sl.GetWorkingDirectory(&mut cwd);
            let t = buf_to_string(&target);
            if t.is_empty() {
                return None;
            }
            let c = buf_to_string(&cwd);
            Some((PathBuf::from(t), buf_to_string(&args), (!c.is_empty()).then_some(c)))
        }
    }

    fn walk(dir: &Path, depth: u32, in_games: bool, out: &mut Vec<(PathBuf, bool)>) {
        if depth > 4 || out.len() > 2000 {
            return;
        }
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        for e in rd.flatten() {
            let p = e.path();
            if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                let name = e.file_name().to_string_lossy().to_string();
                if name.eq_ignore_ascii_case("Startup") || name.eq_ignore_ascii_case("Démarrage") {
                    continue;
                }
                walk(&p, depth + 1, in_games || super::is_games_folder(&name), out);
            } else if p.extension().map(|x| x.eq_ignore_ascii_case("lnk")).unwrap_or(false) {
                out.push((p, in_games));
            }
        }
    }

    pub fn shortcuts() -> Vec<Candidate> {
        let mut links = vec![];
        for id in [&FOLDERID_CommonPrograms, &FOLDERID_Programs, &FOLDERID_Desktop, &FOLDERID_PublicDesktop] {
            if let Some(root) = known_folder(id) {
                walk(&root, 0, false, &mut links);
            }
        }
        let inited = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok() };
        let out = links
            .into_iter()
            .filter_map(|(link, in_games)| {
                let (exe, args, cwd) = resolve(&link)?;
                let name = link.file_stem()?.to_string_lossy().into_owned();
                Some(Candidate { name, exe, args, cwd, in_games_folder: in_games, ..Default::default() })
            })
            .collect();
        if inited {
            unsafe { CoUninitialize() };
        }
        out
    }

    pub fn uninstall() -> Vec<Candidate> {
        let mut out = vec![];
        for k in uninstall_entries() {
            if k.get_value::<u32, _>("SystemComponent").map(|v| v == 1).unwrap_or(false)
                || val(&k, "ParentKeyName").is_some()
            {
                continue;
            }
            let Some(name) = val(&k, "DisplayName") else { continue };
            let icon = val(&k, "DisplayIcon").map(|s| s.split(',').next().unwrap_or("").trim_matches('"').to_string());
            let uninst = val(&k, "UninstallString").unwrap_or_default();
            let hay = format!("{} {} {}", icon.as_deref().unwrap_or(""), uninst, val(&k, "InstallLocation").unwrap_or_default())
                .replace('/', "\\")
                .to_lowercase();
            if STORE_MANAGED.iter().any(|s| hay.contains(s)) {
                continue;
            }
            let install_dir = val(&k, "InstallLocation")
                .map(|d| PathBuf::from(d.trim_matches('"').replace('/', "\\").trim_end_matches('\\')))
                .filter(|d| d.is_dir() && d.parent().is_some());
            let icon_exe = icon
                .map(|i| PathBuf::from(i.replace('/', "\\")))
                .filter(|p| p.extension().map(|x| x.eq_ignore_ascii_case("exe")).unwrap_or(false) && p.is_file())
                .filter(|p| {
                    let s = p.file_stem().unwrap_or_default().to_string_lossy().to_lowercase();
                    !super::EXE_NOT_GAMES.iter().any(|x| s.contains(x))
                });
            let exe = icon_exe.or_else(|| install_dir.as_deref().and_then(|d| super::best_exe(d, &name)));
            let Some(exe) = exe else { continue };
            out.push(Candidate {
                name,
                exe,
                install_dir,
                publisher: val(&k, "Publisher"),
                from_registry: true,
                ..Default::default()
            });
        }
        out
    }
}

/// Détecteur : jeux installés hors store (raccourcis + clés de désinstallation).
pub fn detect() -> Vec<Game> {
    #[cfg(windows)]
    {
        let mut cands = win::shortcuts();
        cands.extend(win::uninstall());
        to_games(cands)
    }
    #[cfg(not(windows))]
    {
        let _ = best_exe;
        super::macapps::detect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch(p: &Path) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, b"x").unwrap();
    }

    fn cand(name: &str, exe: &Path) -> Candidate {
        Candidate { name: name.into(), exe: exe.into(), ..Default::default() }
    }

    #[test]
    fn marqueurs_unity_unreal_godot() {
        let t = tempfile::tempdir().unwrap();
        let unity = t.path().join("Studio").join("Jeu Unity");
        touch(&unity.join("Jeu.exe"));
        touch(&unity.join("UnityPlayer.dll"));
        assert!(is_game(&cand("Jeu Unity", &unity.join("Jeu.exe"))));

        let ue = t.path().join("Studio").join("Jeu UE");
        touch(&ue.join("Jeu.exe"));
        fs::create_dir_all(ue.join("Engine").join("Binaries")).unwrap();
        assert!(is_game(&cand("Jeu UE", &ue.join("Jeu.exe"))));

        let godot = t.path().join("Studio").join("Godot");
        touch(&godot.join("MonJeu.exe"));
        touch(&godot.join("MonJeu.pck"));
        assert!(is_game(&cand("MonJeu", &godot.join("MonJeu.exe"))));
    }

    #[test]
    fn logiciels_ordinaires_ecartes() {
        let t = tempfile::tempdir().unwrap();
        let app = t.path().join("Editeur").join("Outil");
        touch(&app.join("Outil.exe"));
        touch(&app.join("d3dcompiler_47.dll"));
        touch(&app.join("ffmpeg.dll"));
        assert!(!is_game(&cand("Outil", &app.join("Outil.exe"))));
        // exe absent
        assert!(!is_game(&cand("Fantôme", &app.join("absent.exe"))));
    }

    #[test]
    fn dossier_jeux_launchers_connus_et_exclusions() {
        let t = tempfile::tempdir().unwrap();
        let x = t.path().join("Pokeisland").join("Pokeisland Launcher.exe");
        touch(&x);
        let mut c = cand("Pokeisland Launcher", &x);
        assert!(!is_game(&c));
        c.in_games_folder = true;
        assert!(is_game(&c));

        let lunar = t.path().join("Lunar Client").join("Lunar Client.exe");
        touch(&lunar);
        assert!(is_game(&cand("Lunar Client", &lunar)));
        // « artcraftlauncher » contient « tlauncher » mais n'en est pas un
        let art = t.path().join("ArtCraft Launcher").join("artcraft-launcher.exe");
        touch(&art);
        assert!(!is_game(&cand("ArtCraft Launcher", &art)));

        // Roblox Studio, launchers de stores et désinstalleurs : jamais, même dans « Jeux »
        let studio = t.path().join("Roblox").join("RobloxStudioBeta.exe");
        touch(&studio);
        let mut s = cand("Roblox Studio", &studio);
        s.in_games_folder = true;
        assert!(!is_game(&s));
        let steam = t.path().join("Steam").join("steam.exe");
        touch(&steam);
        let mut st = cand("Steam", &steam);
        st.in_games_folder = true;
        assert!(!is_game(&st));
        let un = t.path().join("Jeu").join("unins000.exe");
        touch(&un);
        let mut u = cand("Jeu", &un);
        u.in_games_folder = true;
        assert!(!is_game(&u));
    }

    #[test]
    fn editeur_de_jeux() {
        let t = tempfile::tempdir().unwrap();
        let x = t.path().join("GTA").join("PlayGTAV.exe");
        touch(&x);
        let mut c = cand("Grand Theft Auto V Enhanced", &x);
        c.publisher = Some("Rockstar Games".into());
        assert!(is_game(&c));
    }

    #[test]
    fn noms_nettoyes() {
        assert_eq!(clean_name("Roblox Player for Maël"), "Roblox Player");
        assert_eq!(clean_name("BeamMP Launcher version 2.8.0"), "BeamMP Launcher");
        assert_eq!(clean_name("Pokeisland Launcher 0.1.31"), "Pokeisland Launcher");
        assert_eq!(clean_name("Uninstall Lunar Client"), "Lunar Client");
        assert_eq!(clean_name("7-Zip 26.03 (x64)"), "7-Zip");
        assert_eq!(clean_name("Farming Simulator 22"), "Farming Simulator 22");
        assert_eq!(split_launcher("Hytale Launcher"), ("Hytale".into(), Some("Hytale Launcher".into())));
        assert_eq!(split_launcher("BeamMP-Launcher"), ("BeamMP".into(), Some("BeamMP Launcher".into())));
        assert_eq!(split_launcher("Lunar Client").1, None);
    }

    #[test]
    fn dossier_stable_et_fusion() {
        let t = tempfile::tempdir().unwrap();
        let root = t.path().join("Roblox");
        let a = root.join("Versions").join("version-5a21b87b").join("RobloxPlayerBeta.exe");
        let b = root.join("Versions").join("version-7a0c6d10").join("RobloxPlayerBeta.exe");
        touch(&a);
        touch(&b);
        assert_eq!(stable_dir(&a), root);
        // La clé de désinstallation déclare le dossier de version : même jeu que les raccourcis
        let reg = Candidate {
            name: "Roblox Player for Maël".into(),
            exe: a.clone(),
            install_dir: Some(a.parent().unwrap().to_path_buf()),
            from_registry: true,
            ..Default::default()
        };
        let games = to_games(vec![cand("Roblox Player", &a), cand("Roblox Player", &b), reg]);
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].install_dir.as_deref(), Some(root.to_string_lossy().as_ref()));
        assert_eq!(games[0].id, format!("local:{}", lower(&root)));

        // Registre + raccourci du même dossier : nom du registre, lancement du raccourci
        let gta = t.path().join("Rockstar").join("GTA V");
        touch(&gta.join("GTA5.exe"));
        touch(&gta.join("PlayGTAV.exe"));
        let reg = Candidate {
            name: "Grand Theft Auto V Enhanced".into(),
            exe: gta.join("GTA5.exe"),
            install_dir: Some(gta.clone()),
            publisher: Some("Rockstar Games".into()),
            from_registry: true,
            ..Default::default()
        };
        let mut lnk = cand("Jouer à Grand Theft Auto V", &gta.join("PlayGTAV.exe"));
        lnk.in_games_folder = true;
        let g = to_games(vec![reg, lnk]);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].name, "Grand Theft Auto V Enhanced");
        assert!(g[0].launch.target.ends_with("PlayGTAV.exe"));
        assert_eq!(g[0].process_names.len(), 2);
    }

    #[test]
    fn ecarte_les_jeux_deja_dans_un_store() {
        let mut steam = Game::new("steam:1".into(), "BeamNG".into(), "steam", crate::model::uri("steam://"));
        steam.install_dir = Some(r"D:\Jeux\steamapps\common\BeamNG.drive".into());
        let mut inside = Game::new("local:x".into(), "BeamNG".into(), "local", crate::model::uri("x"));
        inside.install_dir = Some(r"d:/jeux/steamapps/common/beamng.drive/bin".into());
        let mut other = inside.clone();
        other.id = "local:y".into();
        other.install_dir = Some(r"D:\Jeux\steamapps\common\BeamNG.drive2".into());
        let out = drop_nested(vec![steam, inside, other]);
        assert_eq!(out.iter().map(|g| g.id.as_str()).collect::<Vec<_>>(), vec!["steam:1", "local:y"]);
    }

    #[test]
    fn dossier_de_raccourcis_jeux() {
        assert!(is_games_folder("Jeux"));
        assert!(is_games_folder("Games"));
        assert!(is_games_folder("Jeux vidéo"));
        assert!(!is_games_folder("Apps"));
    }
}

#[cfg(test)]
mod reel {
    /// `cargo test reel_installes -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn reel_installes() {
        let t = std::time::Instant::now();
        let games = super::detect();
        println!("jeux installés hors store : {} en {} ms", games.len(), t.elapsed().as_millis());
        let mut games = games;
        games.sort_by(|a, b| a.name.cmp(&b.name));
        for g in &games {
            println!("  {:<28} via {:<22} {}", g.name, g.launcher_name, g.launch.target);
        }
    }
}
