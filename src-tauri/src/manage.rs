//! Installation et désinstallation faites par Hangar, sans fenêtre de launcher (Windows).
//!
//! Steam : pour installer, Hangar écrit le manifeste du jeu (`StateFlags` 1026, « mise à jour
//! requise ») dans la bibliothèque qui a le plus de place et redémarre Steam en silencieux, qui
//! télécharge le jeu. Pour désinstaller, Steam fermé, Hangar supprime le dossier du jeu et son
//! manifeste. Epic : launcher fermé, Hangar supprime le dossier du jeu, son manifeste `.item` et
//! son entrée de `LauncherInstalled.dat`. Toujours après une confirmation dans Hangar.
//!
//! Avant d'installer, Hangar propose les dossiers du launcher (`install_targets`) : Steam
//! télécharge dans la bibliothèque choisie, Epic reçoit le dossier comme emplacement par défaut
//! de sa fenêtre d'installation.

use crate::model::Game;
use crate::scanner::steam::{libraries, steam_root, vdf_values};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

/// Nom de dossier sûr : un seul niveau, sans caractère interdit par Windows.
pub fn valid_dir_name(d: &str) -> bool {
    let d = d.trim();
    !d.is_empty() && d != "." && d != ".." && !d.contains(['/', '\\', ':', '<', '>', '"', '|', '?', '*'])
}

/// Nom de dossier tiré du nom du jeu quand Steam n'en donne pas.
fn dir_from_name(name: &str) -> String {
    let d: String = name.chars().filter(|c| !"/\\:<>\"|?*".contains(*c)).collect();
    let d = d.trim().trim_end_matches('.').to_string();
    if valid_dir_name(&d) { d } else { "Jeu".into() }
}

/// Manifeste d'un jeu à télécharger : Steam le voit au démarrage et lance le téléchargement.
pub fn steam_manifest(id: u32, name: &str, dir: &str) -> String {
    let name = name.replace('"', "'");
    format!(
        "\"AppState\"\n{{\n\t\"appid\"\t\t\"{id}\"\n\t\"Universe\"\t\t\"1\"\n\t\"name\"\t\t\"{name}\"\n\t\"StateFlags\"\t\t\"1026\"\n\t\"installdir\"\t\t\"{dir}\"\n\t\"LastUpdated\"\t\t\"0\"\n\t\"SizeOnDisk\"\t\t\"0\"\n\t\"buildid\"\t\t\"0\"\n\t\"BytesToDownload\"\t\t\"0\"\n\t\"BytesDownloaded\"\t\t\"0\"\n\t\"AutoUpdateBehavior\"\t\t\"0\"\n}}\n"
    )
}

/// Progression d'un manifeste Steam en cours de téléchargement (installation ou mise à jour),
/// `None` quand le jeu est complet.
pub fn manifest_progress(text: &str) -> Option<f64> {
    let num = |k: &str| vdf_values(text, k).first().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
    let flags = num("StateFlags");
    let busy = flags & 4 == 0 || flags & (2 | 256 | 512 | 1024) != 0;
    busy.then(|| match num("BytesToDownload") {
        0 => 0.0,
        t => (num("BytesDownloaded") as f64 / t as f64).min(1.0),
    })
}

fn steam_manifest_path(root: &Path, id: u32) -> Option<(PathBuf, PathBuf)> {
    let file = format!("appmanifest_{id}.acf");
    libraries(root).into_iter().find(|l| l.join(&file).is_file()).map(|l| (l.join(&file), l))
}

/// Progression de l'installation ou de la mise à jour d'un jeu Steam.
pub fn steam_progress(id: u32) -> Option<f64> {
    let (path, _) = steam_manifest_path(&steam_root()?, id)?;
    manifest_progress(&fs::read_to_string(path).ok()?)
}

fn process_running(exe: &str) -> bool {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    sys.processes().values().any(|p| p.name().to_string_lossy().eq_ignore_ascii_case(exe))
}

fn wait_until(mut ok: impl FnMut() -> bool, max: Duration) -> bool {
    let t = Instant::now();
    while t.elapsed() < max {
        if ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    ok()
}

fn run(exe: &Path, args: &[&str]) -> Result<(), String> {
    let mut c = Command::new(exe);
    c.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(crate::launcher::CREATE_NO_WINDOW);
    }
    c.spawn().map(|_| ()).map_err(|e| format!("Impossible de démarrer {} : {e}", exe.display()))
}

#[cfg(windows)]
fn steam_game_running() -> bool {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Valve\Steam")
        .and_then(|k| k.get_value::<u32, _>("RunningAppID"))
        .is_ok_and(|v| v != 0)
}

#[cfg(not(windows))]
fn steam_game_running() -> bool {
    false
}

/// Ferme Steam s'il tourne, applique `f`, puis le relance en silencieux (toujours si `start`,
/// sinon seulement s'il tournait). Steam ne relit les manifestes qu'à son démarrage.
fn with_steam_closed(root: &Path, start: bool, f: impl FnOnce() -> Result<(), String>) -> Result<(), String> {
    // Deux installations ou désinstallations à la suite : un seul redémarrage de Steam à la fois.
    static ONE: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _one = ONE.lock().unwrap_or_else(|p| p.into_inner());
    let exe = root.join("steam.exe");
    let running = process_running("steam.exe");
    if running {
        if steam_game_running() {
            return Err("Une partie Steam est en cours : termine-la, Steam doit redémarrer en arrière-plan.".into());
        }
        run(&exe, &["-shutdown"])?;
        if !wait_until(|| !process_running("steam.exe"), Duration::from_secs(45)) {
            return Err("Steam ne s'est pas fermé, réessaie dans un instant.".into());
        }
    }
    let r = f();
    if start || running {
        run(&exe, &["-silent"])?;
    }
    r
}

#[cfg(windows)]
fn free_space(p: &Path) -> u64 {
    use windows::core::HSTRING;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let mut free = 0u64;
    // SAFETY : chemin UTF-16 valide le temps de l'appel, sortie vers une variable locale.
    let ok = unsafe { GetDiskFreeSpaceExW(&HSTRING::from(p.to_string_lossy().as_ref()), Some(&mut free), None, None) };
    if ok.is_ok() { free } else { 0 }
}

#[cfg(not(windows))]
fn free_space(_: &Path) -> u64 {
    0
}

/// Dossier d'installation que Steam donne au jeu (`appinfo.vdf`).
fn steam_installdir(root: &Path, id: u32) -> Option<String> {
    let raw = fs::read(root.join("appcache").join("appinfo.vdf")).ok()?;
    let app = crate::scanner::appinfo::parse(&raw, &std::collections::HashSet::from([id])).remove(&id)?;
    valid_dir_name(&app.installdir).then_some(app.installdir)
}

/// Dossier proposé pour installer un jeu.
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallTarget {
    /// Identifiant renvoyé tel quel par le frontend (bibliothèque `steamapps` pour Steam).
    pub path: String,
    /// Dossier affiché.
    pub label: String,
    /// Place libre sur le disque, en octets (0 si inconnue).
    pub free: u64,
}

/// Dossiers du launcher où installer le jeu, celui par défaut en tête. Vide : le launcher
/// choisit lui-même (GOG Galaxy, Riot, macOS).
pub fn install_targets(g: &Game) -> Vec<InstallTarget> {
    if !cfg!(windows) {
        return vec![];
    }
    let dirs = match g.store.as_str() {
        // Par défaut : la bibliothèque qui a le plus de place.
        "steam" => steam_root().map(|r| sorted_by_free(libraries(&r))).unwrap_or_default(),
        "epic" => epic_targets(),
        _ => vec![],
    };
    unique_dirs(dirs)
        .into_iter()
        .map(|p| {
            let shown = if g.store == "steam" { p.parent().unwrap_or(&p) } else { &p };
            InstallTarget { label: shown.display().to_string(), free: free_space(&p), path: p.display().to_string() }
        })
        .collect()
}

fn sorted_by_free(mut v: Vec<PathBuf>) -> Vec<PathBuf> {
    v.sort_by_cached_key(|p| std::cmp::Reverse(free_space(p)));
    v
}

/// Dossiers existants (un disque débranché disparaît), sans doublon de casse ou de `\` final.
fn unique_dirs(dirs: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = std::collections::HashSet::new();
    dirs.into_iter()
        .filter(|p| p.is_dir() && seen.insert(p.to_string_lossy().trim_end_matches(['\\', '/']).to_lowercase()))
        .collect()
}

/// Le dossier reçu du frontend doit être l'un de ceux que Hangar propose pour ce jeu.
pub fn checked_target(g: &Game, dir: &str) -> Result<PathBuf, String> {
    install_targets(g)
        .into_iter()
        .find(|t| t.path == dir)
        .map(|t| PathBuf::from(t.path))
        .ok_or_else(|| "Ce dossier n'est plus disponible (disque débranché ?). Choisis-en un autre.".into())
}

pub fn steam_install(g: &Game, lib: Option<PathBuf>) -> Result<String, String> {
    let id = g.steam_app_id.ok_or("Ce jeu n'a pas d'identifiant Steam.")?;
    let root = steam_root().ok_or("Steam n'est pas installé.")?;
    if steam_manifest_path(&root, id).is_some() {
        return Ok(format!("{} est déjà en cours d'installation.", g.name));
    }
    let lib = match lib {
        Some(l) => l,
        None => unique_dirs(sorted_by_free(libraries(&root))).into_iter().next().ok_or("Aucune bibliothèque Steam trouvée.")?,
    };
    let dir = steam_installdir(&root, id).unwrap_or_else(|| dir_from_name(&g.name));
    let path = lib.join(format!("appmanifest_{id}.acf"));
    let acf = steam_manifest(id, &g.name, &dir);
    with_steam_closed(&root, true, || {
        fs::write(&path, acf).map_err(|e| format!("Impossible de préparer l'installation : {e}"))
    })?;
    log::info!("installation Steam de {id} dans {}", lib.display());
    Ok(format!("{} s'installe en arrière-plan.", g.name))
}

fn remove_dir(d: &Path) -> Result<(), String> {
    match fs::remove_dir_all(d) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
            Err(format!("Impossible de supprimer tous les fichiers du jeu ({e}). Ferme ce qui les utilise et réessaie."))
        }
        _ => Ok(()),
    }
}

pub fn steam_uninstall(g: &Game) -> Result<String, String> {
    let id = g.steam_app_id.ok_or("Ce jeu n'a pas d'identifiant Steam.")?;
    let root = steam_root().ok_or("Steam n'est pas installé.")?;
    let (manifest, lib) = steam_manifest_path(&root, id).ok_or("Steam ne connaît pas ce jeu : actualise la bibliothèque.")?;
    let text = fs::read_to_string(&manifest).map_err(|e| format!("Manifeste Steam illisible : {e}"))?;
    let dir = vdf_values(&text, "installdir")
        .into_iter()
        .next()
        .filter(|d| valid_dir_name(d))
        .ok_or("Dossier du jeu illisible dans le manifeste Steam.")?;
    let game_dir = lib.join("common").join(dir);
    with_steam_closed(&root, false, || {
        remove_dir(&game_dir)?;
        fs::remove_file(&manifest).map_err(|e| format!("Impossible de retirer le jeu de Steam : {e}"))?;
        let _ = fs::remove_file(lib.join("workshop").join(format!("appworkshop_{id}.acf")));
        Ok(())
    })?;
    log::info!("désinstallation Steam de {id}");
    Ok(format!("{} est désinstallé.", g.name))
}

/// Dossier qu'on accepte de supprimer : absolu, sous une racine, et pas un dossier système
/// ou le dossier commun des jeux Epic.
pub fn safe_game_dir(p: &Path) -> bool {
    const SYSTEM: &[&str] =
        &["program files", "program files (x86)", "programdata", "users", "windows", "epic games", "games"];
    let name = p.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"));
    p.is_absolute()
        && p.parent().is_some()
        && !name.is_empty()
        && !SYSTEM.contains(&name.as_str())
        && home.is_none_or(|h| Path::new(&h) != p)
}

/// Retire un jeu de `LauncherInstalled.dat` (liste des installations du launcher Epic).
pub fn forget_epic_install(text: &str, app: &str) -> Option<String> {
    let mut v: serde_json::Value = serde_json::from_str(text).ok()?;
    v.get_mut("InstallationList")?.as_array_mut()?.retain(|e| e["AppName"].as_str() != Some(app));
    serde_json::to_string_pretty(&v).ok()
}

const EPIC_EXE: &str = "EpicGamesLauncher.exe";

/// Ferme le launcher Epic : il réécrit ses fichiers d'installation tant qu'il tourne.
#[cfg(windows)]
fn close_epic() {
    const EXE: &str = EPIC_EXE;
    if !process_running(EXE) {
        return;
    }
    let kill = |force: bool| {
        use std::os::windows::process::CommandExt;
        let mut c = Command::new("taskkill");
        if force {
            c.arg("/F");
        }
        let _ = c.args(["/IM", EXE]).creation_flags(crate::launcher::CREATE_NO_WINDOW).output();
    };
    kill(false);
    if !wait_until(|| !process_running(EXE), Duration::from_secs(8)) {
        kill(true);
        wait_until(|| !process_running(EXE), Duration::from_secs(5));
    }
}

#[cfg(not(windows))]
fn close_epic() {}

fn epic_manifests() -> PathBuf {
    crate::scanner::program_data().join(r"Epic\EpicGamesLauncher\Data\Manifests")
}

/// Manifestes `.item` lisibles du launcher Epic : (fichier, contenu).
fn epic_items() -> Vec<(PathBuf, serde_json::Value)> {
    fs::read_dir(epic_manifests())
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("item")))
        .filter_map(|e| Some((e.path(), serde_json::from_str(&fs::read_to_string(e.path()).ok()?).ok()?)))
        .collect()
}

/// Epic télécharge (installation incomplète ou mise à jour en attente) : le fermer couperait
/// le téléchargement.
fn epic_busy() -> bool {
    let pending = fs::read_dir(epic_manifests().join("Pending")).into_iter().flatten().flatten().next().is_some();
    process_running(EPIC_EXE)
        && (pending || epic_items().iter().any(|(_, v)| v["bIsIncompleteInstall"].as_bool() == Some(true)))
}

/// Réglages du launcher Epic.
fn epic_ini() -> Option<PathBuf> {
    let base = Path::new(&std::env::var_os("LOCALAPPDATA")?).join(r"EpicGamesLauncher\Saved\Config");
    ["WindowsEditor", "Windows"].iter().map(|d| base.join(d).join("GameUserSettings.ini")).find(|p| p.is_file())
}

/// Dossier que la fenêtre d'installation d'Epic propose.
const EPIC_DEFAULT: (&str, &str) = ("Launcher", "DefaultAppInstallLocation");

/// Valeur `key` de la section `[section]` d'un fichier ini.
pub fn ini_value(text: &str, section: &str, key: &str) -> Option<String> {
    let header = format!("[{section}]");
    let mut inside = false;
    for l in text.lines().map(str::trim) {
        if l.starts_with('[') {
            inside = l.eq_ignore_ascii_case(&header);
        } else if let Some((k, v)) = l.split_once('=').filter(|_| inside) {
            if k.trim().eq_ignore_ascii_case(key) {
                return Some(v.trim().to_string());
            }
        }
    }
    None
}

/// Remplace (ou ajoute) `key=value` dans `[section]`, en gardant le reste et les fins de ligne.
pub fn set_ini_value(text: &str, section: &str, key: &str, value: &str) -> String {
    let nl = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let header = format!("[{section}]");
    let entry = format!("{key}={value}");
    let mut lines: Vec<String> = text.lines().map(String::from).collect();
    match lines.iter().position(|l| l.trim().eq_ignore_ascii_case(&header)) {
        None => lines.extend([header, entry]),
        Some(start) => {
            let end = lines[start + 1..].iter().position(|l| l.trim().starts_with('[')).map_or(lines.len(), |i| start + 1 + i);
            let key_at = (start + 1..end)
                .find(|&i| lines[i].split_once('=').is_some_and(|(k, _)| k.trim().eq_ignore_ascii_case(key)));
            match key_at {
                Some(i) => lines[i] = entry,
                None => lines.insert(start + 1, entry),
            }
        }
    }
    lines.join(nl) + nl
}

/// Dossiers d'Epic : celui par défaut, ceux qui contiennent déjà des jeux, puis le sien.
fn epic_targets() -> Vec<PathBuf> {
    let default = epic_ini()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|t| ini_value(&t, EPIC_DEFAULT.0, EPIC_DEFAULT.1))
        .filter(|v| !v.is_empty())
        .map(PathBuf::from);
    let used = epic_items()
        .into_iter()
        .filter_map(|(_, v)| Some(Path::new(v["InstallLocation"].as_str()?).parent()?.to_path_buf()));
    let own = std::env::var_os("ProgramFiles").map(|p| Path::new(&p).join("Epic Games"));
    default.into_iter().chain(used).chain(own).collect()
}

/// Règle le dossier proposé par la fenêtre d'installation d'Epic.
fn epic_set_default(wanted: &str) -> Result<(), String> {
    let ini = epic_ini().ok_or("Réglages d'Epic Games introuvables")?;
    let text = fs::read_to_string(&ini).map_err(|_| "Réglages d'Epic Games illisibles")?;
    let same = |c: String| c.trim_end_matches('\\').eq_ignore_ascii_case(wanted.trim_end_matches('\\'));
    if ini_value(&text, EPIC_DEFAULT.0, EPIC_DEFAULT.1).is_some_and(same) {
        return Ok(());
    }
    if epic_busy() {
        return Err("Epic Games télécharge déjà un jeu".into());
    }
    // Epic réécrit ses réglages en quittant : il doit être fermé avant, et relu après.
    close_epic();
    let text = fs::read_to_string(&ini).unwrap_or(text);
    fs::write(&ini, set_ini_value(&text, EPIC_DEFAULT.0, EPIC_DEFAULT.1, wanted))
        .map_err(|e| format!("Réglages d'Epic Games non modifiables ({e})"))
}

/// Ouvre l'installation dans Epic, avec `dir` déjà choisi dans sa fenêtre quand c'est possible.
pub fn epic_install(g: &Game, dir: Option<PathBuf>) -> Result<String, String> {
    let msg = match dir.map(|d| d.display().to_string()) {
        None => format!("Confirme l'installation de {} dans la fenêtre d'Epic Games.", g.name),
        Some(want) => match epic_set_default(&want) {
            Ok(()) => format!("Confirme l'installation de {} dans la fenêtre d'Epic Games, dossier {want}.", g.name),
            Err(why) => {
                log::info!("Epic : dossier non préréglé ({why})");
                format!("{why} : choisis {want} dans sa fenêtre pour installer {}.", g.name)
            }
        },
    };
    crate::launcher::launch(&g.launch)?;
    Ok(msg)
}

pub fn epic_uninstall(g: &Game) -> Result<String, String> {
    let app = g.id.strip_prefix("epic:").filter(|a| !a.is_empty()).ok_or("Identifiant Epic invalide.")?;
    let base = crate::scanner::program_data().join("Epic");
    let (item, location) = epic_items()
        .into_iter()
        .find_map(|(p, v)| (v["AppName"].as_str()? == app).then(|| (p, v["InstallLocation"].as_str().map(PathBuf::from))))
        .ok_or("Epic Games ne connaît pas ce jeu : actualise la bibliothèque.")?;
    let location = location.filter(|l| safe_game_dir(l)).ok_or("Dossier du jeu refusé par sécurité.")?;
    if epic_busy() {
        return Err("Epic Games télécharge un jeu : attends la fin du téléchargement puis réessaie.".into());
    }
    close_epic();
    remove_dir(&location)?;
    fs::remove_file(&item).map_err(|e| format!("Impossible de retirer le jeu d'Epic Games : {e}"))?;
    let dat = base.join(r"UnrealEngineLauncher\LauncherInstalled.dat");
    if let Some(t) = fs::read_to_string(&dat).ok().and_then(|t| forget_epic_install(&t, app)) {
        let _ = fs::write(&dat, t);
    }
    log::info!("désinstallation Epic de {app}");
    Ok(format!("{} est désinstallé.", g.name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifeste_ecrit_puis_relu() {
        let acf = steam_manifest(620, "Portal \"2\"", "Portal 2");
        let g = crate::scanner::steam::parse_manifest(&acf, Path::new(r"D:\Steam\steamapps"));
        assert!(g.is_none(), "en téléchargement : pas encore installé");
        assert_eq!(vdf_values(&acf, "installdir"), vec!["Portal 2"]);
        assert_eq!(vdf_values(&acf, "StateFlags"), vec!["1026"]);
        assert_eq!(manifest_progress(&acf), Some(0.0));
    }

    #[test]
    fn progression() {
        let m = |f: u32, done: u64, to: u64| {
            format!("\"StateFlags\"\t\t\"{f}\"\n\"BytesDownloaded\"\t\t\"{done}\"\n\"BytesToDownload\"\t\t\"{to}\"\n")
        };
        assert_eq!(manifest_progress(&m(4, 0, 0)), None, "installé");
        assert_eq!(manifest_progress(&m(1026, 50, 200)), Some(0.25));
        assert_eq!(manifest_progress(&m(1030, 200, 200)), Some(1.0), "mise à jour qui se termine");
    }

    #[test]
    fn noms_et_dossiers_surs() {
        assert!(valid_dir_name("Portal 2"));
        for bad in ["", " ", "..", "a\\b", "a/b", "C:"] {
            assert!(!valid_dir_name(bad), "{bad:?}");
        }
        assert_eq!(dir_from_name("Half-Life: Alyx?"), "Half-Life Alyx");
        assert_eq!(dir_from_name("???"), "Jeu");
        if cfg!(windows) {
            assert!(safe_game_dir(Path::new(r"C:\Program Files\Epic Games\Fortnite")));
            assert!(safe_game_dir(Path::new(r"D:\Fortnite")));
            assert!(!safe_game_dir(Path::new(r"C:\")));
            assert!(!safe_game_dir(Path::new(r"C:\Program Files\Epic Games")));
            assert!(!safe_game_dir(Path::new(r"C:\Users")));
            assert!(!safe_game_dir(Path::new("Fortnite")));
        }
    }

    #[test]
    fn retire_de_launcher_installed() {
        let t = r#"{"InstallationList":[{"AppName":"Fortnite","InstallLocation":"C:\\F"},{"AppName":"Autre"}]}"#;
        let out = forget_epic_install(t, "Fortnite").unwrap();
        assert!(!out.contains("Fortnite") && out.contains("Autre"));
        assert!(forget_epic_install("pas du json", "x").is_none());
    }

    #[test]
    fn reglages_ini() {
        let t = "[Launcher]\r\nX=1\r\nDefaultAppInstallLocation=D:\\Jeux\r\n[Autre]\r\nDefaultAppInstallLocation=faux\r\n";
        assert_eq!(ini_value(t, "Launcher", "DefaultAppInstallLocation").as_deref(), Some("D:\\Jeux"));
        let out = set_ini_value(t, "Launcher", "DefaultAppInstallLocation", "E:\\Epic");
        assert_eq!(ini_value(&out, "Launcher", "DefaultAppInstallLocation").as_deref(), Some("E:\\Epic"));
        assert_eq!(ini_value(&out, "Autre", "DefaultAppInstallLocation").as_deref(), Some("faux"));
        assert!(out.contains("X=1\r\n") && !out.contains("D:\\Jeux"));
        // Clé absente, section absente, fichier vide.
        let out = set_ini_value("[Launcher]\nX=1\n", "Launcher", "K", "v");
        assert_eq!(out, "[Launcher]\nK=v\nX=1\n");
        assert_eq!(set_ini_value("[A]\n", "Launcher", "K", "v"), "[A]\n[Launcher]\nK=v\n");
        assert_eq!(ini_value(&set_ini_value("", "Launcher", "K", "v"), "Launcher", "K").as_deref(), Some("v"));
    }

    #[test]
    fn dossiers_existants_sans_doublon() {
        let d = tempfile::tempdir().unwrap();
        let a = d.path().join("A");
        fs::create_dir(&a).unwrap();
        let upper = PathBuf::from(a.to_string_lossy().to_uppercase() + "\\");
        let got = unique_dirs(vec![a.clone(), d.path().join("absent"), if cfg!(windows) { upper } else { a.clone() }]);
        assert_eq!(got, vec![a]);
    }

    /// Lecture seule : dossiers proposés sur ce PC. `cargo test cibles_reelles -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn cibles_reelles() {
        for store in ["steam", "epic", "gog"] {
            let g = Game::new(format!("{store}:x"), "X".into(), store, crate::model::uri("x"));
            for t in install_targets(&g) {
                println!("{store} : {} ({} Go libres)", t.label, t.free / 1_000_000_000);
            }
        }
    }

    /// Lecture seule : le dossier d'`appinfo.vdf` doit être celui des manifestes installés.
    /// `cargo test installdir_reel -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn installdir_reel() {
        let root = steam_root().expect("Steam");
        let (mut ok, mut total) = (0, 0);
        for lib in libraries(&root) {
            for e in fs::read_dir(&lib).into_iter().flatten().flatten() {
                let Some(id) = e.file_name().to_string_lossy().strip_prefix("appmanifest_").and_then(|r| r.strip_suffix(".acf")).and_then(|i| i.parse::<u32>().ok()) else { continue };
                let t = fs::read_to_string(e.path()).unwrap();
                let want = vdf_values(&t, "installdir").into_iter().next();
                let got = steam_installdir(&root, id);
                total += 1;
                if want == got { ok += 1 } else { println!("{id} : manifeste {want:?}, appinfo {got:?}") }
                println!("{id} progression {:?}", steam_progress(id));
            }
        }
        println!("{ok}/{total} dossiers identiques");
        assert!(total == 0 || ok * 2 >= total);
    }
}
