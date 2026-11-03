//! Détection des jeux installés : Steam, Epic, GOG, Ubisoft, EA, Battle.net,
//! Riot, Xbox / Microsoft Store et dossiers locaux.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Launch {
    /// "uri" (protocole/shell) ou "exe"
    pub kind: String,
    pub target: String,
    #[serde(default)]
    pub args: String,
    #[serde(default)]
    pub cwd: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub id: String,
    pub name: String,
    pub store: String,
    pub install_dir: Option<String>,
    pub launch: Launch,
    pub steam_app_id: Option<u32>,
    /// Fichier utilisé pour l'icône (exe ou image)
    pub icon_source: Option<String>,
}

fn uri(target: impl Into<String>) -> Launch {
    Launch { kind: "uri".into(), target: target.into(), args: String::new(), cwd: None }
}

fn exe(path: &Path, args: &str) -> Launch {
    Launch {
        kind: "exe".into(),
        target: path.to_string_lossy().into_owned(),
        args: args.to_string(),
        cwd: path.parent().map(|p| p.to_string_lossy().into_owned()),
    }
}

fn program_data() -> PathBuf {
    std::env::var("PROGRAMDATA").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from(r"C:\ProgramData"))
}

pub fn scan_all(local_folders: &[String]) -> Vec<Game> {
    let mut games = Vec::new();
    games.extend(steam());
    games.extend(epic());
    games.extend(riot());
    #[cfg(windows)]
    {
        games.extend(win::gog());
        games.extend(win::ubisoft());
        games.extend(win::ea_and_battlenet());
        games.extend(win::xbox());
    }
    for f in local_folders {
        games.extend(local_folder(Path::new(f)));
    }
    // Dédoublonnage : même dossier d'installation détecté par deux sources
    let mut seen = std::collections::HashSet::new();
    games.retain(|g| {
        let key = g.install_dir.as_ref().map(|d| d.to_lowercase().trim_end_matches('\\').to_string()).unwrap_or_else(|| g.id.clone());
        seen.insert(key)
    });
    games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    games
}

// ───────────────────────────── Steam ─────────────────────────────

fn vdf_values<'a>(text: &'a str, key: &str) -> Vec<String> {
    let needle = format!("\"{}\"", key);
    text.lines()
        .filter_map(|l| {
            let l = l.trim();
            if !l.to_lowercase().starts_with(&needle.to_lowercase()) {
                return None;
            }
            let rest = l[needle.len()..].trim();
            let v = rest.trim_matches('"');
            Some(v.replace("\\\\", "\\"))
        })
        .collect()
}

fn steam_root() -> Option<PathBuf> {
    #[cfg(windows)]
    if let Some(p) = win::reg_str(win::HKCU, r"Software\Valve\Steam", "SteamPath") {
        let p = PathBuf::from(p.replace('/', "\\"));
        if p.exists() {
            return Some(p);
        }
    }
    let p = PathBuf::from(r"C:\Program Files (x86)\Steam");
    p.exists().then_some(p)
}

const STEAM_IGNORED: &[&str] = &[
    "steamworks common", "redistributable", "proton", "steam linux runtime",
    "steamvr", "wallpaper engine", "soundtrack", "dedicated server", "sdk",
];

fn steam() -> Vec<Game> {
    let Some(root) = steam_root() else { return vec![] };
    let mut libs = vec![root.join("steamapps")];
    if let Ok(t) = fs::read_to_string(root.join("steamapps").join("libraryfolders.vdf")) {
        for p in vdf_values(&t, "path") {
            let lib = PathBuf::from(p).join("steamapps");
            if !libs.iter().any(|l| l.to_string_lossy().eq_ignore_ascii_case(&lib.to_string_lossy())) {
                libs.push(lib);
            }
        }
    }
    let mut out = vec![];
    for lib in libs {
        let Ok(rd) = fs::read_dir(&lib) else { continue };
        for e in rd.flatten() {
            let fname = e.file_name().to_string_lossy().to_lowercase();
            if !(fname.starts_with("appmanifest_") && fname.ends_with(".acf")) {
                continue;
            }
            let Ok(t) = fs::read_to_string(e.path()) else { continue };
            let appid: u32 = match vdf_values(&t, "appid").first().and_then(|v| v.parse().ok()) {
                Some(a) => a,
                None => continue,
            };
            let name = vdf_values(&t, "name").into_iter().next().unwrap_or_default();
            if name.is_empty() || appid == 228980 {
                continue;
            }
            let lname = name.to_lowercase();
            if STEAM_IGNORED.iter().any(|s| lname.contains(s)) {
                continue;
            }
            let dir = vdf_values(&t, "installdir").into_iter().next().map(|d| lib.join("common").join(d));
            out.push(Game {
                id: format!("steam:{appid}"),
                name,
                store: "steam".into(),
                install_dir: dir.map(|d| d.to_string_lossy().into_owned()),
                launch: uri(format!("steam://rungameid/{appid}")),
                steam_app_id: Some(appid),
                icon_source: None,
            });
        }
    }
    out
}

// ───────────────────────────── Epic ─────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct EpicItem {
    display_name: Option<String>,
    install_location: Option<String>,
    launch_executable: Option<String>,
    catalog_namespace: Option<String>,
    catalog_item_id: Option<String>,
    app_name: Option<String>,
    #[serde(default)]
    app_categories: Vec<String>,
    #[serde(default, rename = "bIsIncompleteInstall")]
    incomplete: bool,
    #[serde(default, rename = "MainGameAppName")]
    main_game_app_name: Option<String>,
}

fn epic() -> Vec<Game> {
    let dir = program_data().join(r"Epic\EpicGamesLauncher\Data\Manifests");
    let Ok(rd) = fs::read_dir(dir) else { return vec![] };
    let mut out = vec![];
    for e in rd.flatten() {
        if !e.path().extension().map(|x| x.eq_ignore_ascii_case("item")).unwrap_or(false) {
            continue;
        }
        let Ok(t) = fs::read_to_string(e.path()) else { continue };
        let Ok(it) = serde_json::from_str::<EpicItem>(&t) else { continue };
        if it.incomplete {
            continue;
        }
        if !it.app_categories.is_empty() && !it.app_categories.iter().any(|c| c == "games") {
            continue;
        }
        // Les DLC ont un MainGameAppName différent de leur AppName
        if let (Some(m), Some(a)) = (&it.main_game_app_name, &it.app_name) {
            if m != a {
                continue;
            }
        }
        let (Some(name), Some(ns), Some(cid), Some(app)) =
            (it.display_name, it.catalog_namespace, it.catalog_item_id, it.app_name)
        else {
            continue;
        };
        let exe_path = match (&it.install_location, &it.launch_executable) {
            (Some(l), Some(x)) if !x.is_empty() => Some(Path::new(l).join(x).to_string_lossy().into_owned()),
            _ => None,
        };
        out.push(Game {
            id: format!("epic:{app}"),
            name,
            store: "epic".into(),
            install_dir: it.install_location,
            launch: uri(format!(
                "com.epicgames.launcher://apps/{ns}%3A{cid}%3A{app}?action=launch&silent=true"
            )),
            steam_app_id: None,
            icon_source: exe_path,
        });
    }
    out
}

// ───────────────────────────── Riot ─────────────────────────────

fn riot() -> Vec<Game> {
    let base = program_data().join("Riot Games");
    let client = fs::read_to_string(base.join("RiotClientInstalls.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v.get("rc_default").and_then(|x| x.as_str()).map(|s| s.replace('/', "\\")));
    let Some(client) = client else { return vec![] };
    let Ok(rd) = fs::read_dir(base.join("Metadata")) else { return vec![] };
    let mut out = vec![];
    for e in rd.flatten() {
        let folder = e.file_name().to_string_lossy().to_string();
        let Some((product, patchline)) = folder.split_once('.') else { continue };
        if product == "riot_client" {
            continue;
        }
        let settings = e.path().join(format!("{folder}.product_settings.yaml"));
        let Ok(t) = fs::read_to_string(settings) else { continue };
        let install = t.lines().find_map(|l| {
            let l = l.trim();
            l.strip_prefix("product_install_full_path:").map(|v| v.trim().trim_matches('"').replace('/', "\\"))
        });
        let Some(install) = install else { continue };
        if !Path::new(&install).exists() {
            continue;
        }
        let name = match product {
            "league_of_legends" => "League of Legends".to_string(),
            "valorant" => "VALORANT".to_string(),
            "bacon" => "Legends of Runeterra".to_string(),
            "lion" => "2XKO".to_string(),
            other => other.replace('_', " "),
        };
        out.push(Game {
            id: format!("riot:{product}"),
            name,
            store: "riot".into(),
            install_dir: Some(install),
            launch: Launch {
                kind: "exe".into(),
                target: client.clone(),
                args: format!("--launch-product={product} --launch-patchline={patchline}"),
                cwd: None,
            },
            steam_app_id: None,
            icon_source: Some(client.clone()),
        });
    }
    out
}

// ───────────────────────────── Local ─────────────────────────────

const EXE_BLACKLIST: &[&str] = &[
    "unins", "setup", "install", "redist", "vc_redist", "vcredist", "dxsetup", "dxwebsetup",
    "crash", "report", "helper", "update", "patch", "dotnet", "directx", "prereq", "easyanticheat",
    "battleye", "be_service", "cleanup", "quicksfv", "notification", "overlay", "touchup",
    "cefprocess", "subprocess", "webhelper", "elevate", "register", "uploader", "benchmark",
    "dxdiag", "physx", "oalinst", "7z", "python", "java", "node", "server",
];

fn norm(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric()).collect::<String>().to_lowercase()
}

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
            if ["_commonredist", "redist", "directx", "vcredist", "__installer", "support", "tools", "engine"]
                .iter()
                .any(|x| n == *x)
            {
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
            if !target.is_empty() && (stem == target || target.contains(&stem) && stem.len() > 2 || stem.contains(&target)) {
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

fn local_folder(root: &Path) -> Vec<Game> {
    let Ok(rd) = fs::read_dir(root) else { return vec![] };
    let mut out = vec![];
    for e in rd.flatten() {
        if !e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.starts_with('$') {
            continue;
        }
        let Some(x) = best_exe(&e.path(), &name) else { continue };
        let p = e.path().to_string_lossy().into_owned();
        out.push(Game {
            id: format!("local:{}", p.to_lowercase()),
            name,
            store: "local".into(),
            install_dir: Some(p),
            launch: exe(&x, ""),
            steam_app_id: None,
            icon_source: Some(x.to_string_lossy().into_owned()),
        });
    }
    out
}

// ─────────────────────── Windows (registre, Xbox) ───────────────────────

#[cfg(windows)]
pub mod win {
    use super::*;
    use std::os::windows::process::CommandExt;
    use winreg::enums::*;
    use winreg::RegKey;

    pub const HKCU: isize = HKEY_CURRENT_USER as isize;
    pub const HKLM: isize = HKEY_LOCAL_MACHINE as isize;
    const NO_WINDOW: u32 = 0x0800_0000;

    fn root(h: isize) -> RegKey {
        if h == HKCU { RegKey::predef(HKEY_CURRENT_USER) } else { RegKey::predef(HKEY_LOCAL_MACHINE) }
    }

    pub fn reg_str(h: isize, path: &str, val: &str) -> Option<String> {
        root(h).open_subkey(path).ok()?.get_value::<String, _>(val).ok().filter(|s| !s.is_empty())
    }

    fn subkeys(h: isize, path: &str) -> Vec<(String, RegKey)> {
        let Ok(k) = root(h).open_subkey(path) else { return vec![] };
        k.enum_keys()
            .flatten()
            .filter_map(|n| k.open_subkey(&n).ok().map(|s| (n, s)))
            .collect()
    }

    fn val(k: &RegKey, v: &str) -> Option<String> {
        k.get_value::<String, _>(v).ok().map(|s| s.trim().trim_matches('"').to_string()).filter(|s| !s.is_empty())
    }

    // ── GOG ──
    pub fn gog() -> Vec<Game> {
        let galaxy = reg_str(HKLM, r"SOFTWARE\WOW6432Node\GOG.com\GalaxyClient\paths", "client")
            .map(|d| Path::new(&d).join("GalaxyClient.exe"))
            .filter(|p| p.exists());
        let mut out = vec![];
        for (_, k) in subkeys(HKLM, r"SOFTWARE\WOW6432Node\GOG.com\Games") {
            let (Some(id), Some(name), Some(path)) = (val(&k, "gameID"), val(&k, "gameName"), val(&k, "path")) else {
                continue;
            };
            if val(&k, "dependsOn").is_some() || !Path::new(&path).exists() {
                continue; // DLC ou désinstallé
            }
            let game_exe = val(&k, "exe").map(PathBuf::from);
            let launch = if let Some(g) = &galaxy {
                Launch {
                    kind: "exe".into(),
                    target: g.to_string_lossy().into_owned(),
                    args: format!("/command=runGame /gameId={id} /path=\"{path}\""),
                    cwd: None,
                }
            } else if let Some(x) = &game_exe {
                Launch {
                    kind: "exe".into(),
                    target: x.to_string_lossy().into_owned(),
                    args: val(&k, "launchParam").unwrap_or_default(),
                    cwd: val(&k, "workingDir").or_else(|| Some(path.clone())),
                }
            } else {
                continue;
            };
            out.push(Game {
                id: format!("gog:{id}"),
                name,
                store: "gog".into(),
                install_dir: Some(path),
                launch,
                steam_app_id: None,
                icon_source: game_exe.map(|p| p.to_string_lossy().into_owned()),
            });
        }
        out
    }

    // ── Ubisoft Connect ──
    pub fn ubisoft() -> Vec<Game> {
        let mut out = vec![];
        for (id, k) in subkeys(HKLM, r"SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs") {
            let Some(dir) = val(&k, "InstallDir") else { continue };
            let dir = dir.replace('/', "\\");
            if !Path::new(&dir).exists() {
                continue;
            }
            let name = reg_str(
                HKLM,
                &format!(r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Uplay Install {id}"),
                "DisplayName",
            )
            .unwrap_or_else(|| {
                Path::new(&dir).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or(id.clone())
            });
            let icon = best_exe(Path::new(&dir), &name).map(|p| p.to_string_lossy().into_owned());
            out.push(Game {
                id: format!("ubisoft:{id}"),
                name,
                store: "ubisoft".into(),
                install_dir: Some(dir.trim_end_matches('\\').to_string()),
                launch: uri(format!("uplay://launch/{id}/0")),
                steam_app_id: None,
                icon_source: icon,
            });
        }
        out
    }

    // ── EA app + Battle.net (via les clés de désinstallation) ──
    fn bnet_code(uid: &str) -> Option<&'static str> {
        let u = uid.to_lowercase();
        let map: &[(&str, &str)] = &[
            ("wow_classic", "WoWC"), ("wow", "WoW"), ("prometheus", "Pro"), ("hs_beta", "WTCG"),
            ("diablo3", "D3"), ("fenris", "Fen"), ("osi", "OSI"), ("s2", "S2"), ("s1", "S1"),
            ("heroes", "Hero"), ("w3", "W3"), ("viper", "VIPR"), ("odin", "ODIN"), ("lazarus", "LAZR"),
            ("zeus", "ZEUS"), ("fore", "FORE"), ("auks", "AUKS"), ("rtro", "RTRO"), ("wlby", "WLBY"),
            ("anbs", "ANBS"), ("gryphon", "GRY"), ("spot", "SPOT"),
        ];
        map.iter().find(|(p, _)| u.starts_with(p)).map(|(_, c)| *c)
    }

    pub fn ea_and_battlenet() -> Vec<Game> {
        let roots = [
            (HKLM, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
            (HKLM, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
            (HKCU, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        ];
        let entries: Vec<RegKey> = roots.iter().flat_map(|(h, p)| subkeys(*h, p)).map(|(_, k)| k).collect();

        let bnet_exe = entries
            .iter()
            .find(|k| val(k, "DisplayName").as_deref() == Some("Battle.net"))
            .and_then(|k| val(k, "InstallLocation"))
            .map(|d| Path::new(&d).join("Battle.net.exe"))
            .filter(|p| p.exists())
            .or_else(|| {
                let p = PathBuf::from(r"C:\Program Files (x86)\Battle.net\Battle.net.exe");
                p.exists().then_some(p)
            });

        let mut out = vec![];
        for k in &entries {
            let Some(name) = val(k, "DisplayName") else { continue };
            let Some(loc) = val(k, "InstallLocation") else { continue };
            let loc = loc.trim_end_matches('\\').to_string();
            if !Path::new(&loc).is_dir() {
                continue;
            }
            let uninst = val(k, "UninstallString").unwrap_or_default();
            let publisher = val(k, "Publisher").unwrap_or_default();

            // Battle.net
            if uninst.contains("Battle.net") && uninst.contains("--uid=") && name != "Battle.net" {
                let uid = uninst.split("--uid=").nth(1).unwrap_or("").split_whitespace().next().unwrap_or("");
                let Some(code) = bnet_code(uid) else { continue };
                let launch = match &bnet_exe {
                    Some(b) => Launch {
                        kind: "exe".into(),
                        target: b.to_string_lossy().into_owned(),
                        args: format!("--exec=\"launch {code}\""),
                        cwd: None,
                    },
                    None => uri(format!("battlenet://{code}")),
                };
                out.push(Game {
                    id: format!("battlenet:{code}"),
                    icon_source: val(k, "DisplayIcon").map(|s| s.split(',').next().unwrap_or("").to_string()),
                    name,
                    store: "battlenet".into(),
                    install_dir: Some(loc),
                    launch,
                    steam_app_id: None,
                });
                continue;
            }

            // EA app : les jeux EA contiennent un dossier __Installer
            let is_ea = Path::new(&loc).join("__Installer").join("installerdata.xml").exists()
                || (publisher.contains("Electronic Arts") && !name.to_lowercase().starts_with("ea app"));
            if is_ea && !name.to_lowercase().contains("ea app") && !name.to_lowercase().contains("origin") {
                let Some(x) = best_exe(Path::new(&loc), &name) else { continue };
                out.push(Game {
                    id: format!("ea:{}", norm(&name)),
                    name,
                    store: "ea".into(),
                    install_dir: Some(loc),
                    icon_source: Some(x.to_string_lossy().into_owned()),
                    launch: exe(&x, ""),
                    steam_app_id: None,
                });
            }
        }
        out
    }

    // ── Xbox / Microsoft Store (via PowerShell) ──
    const XBOX_PS: &str = r#"
$ErrorActionPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$out=@()
foreach($p in Get-AppxPackage){
  if($p.IsFramework -or $p.SignatureKind -eq 'System'){continue}
  $loc=$p.InstallLocation; if(-not $loc){continue}
  $cfg=Join-Path $loc 'MicrosoftGame.config'
  if(-not (Test-Path -LiteralPath $cfg)){continue}
  $m=Get-AppxPackageManifest $p
  $app=@($m.Package.Applications.Application)[0]
  $name=$null; $logo=$null
  try{ [xml]$x=Get-Content -LiteralPath $cfg -Raw; $name=$x.Game.ShellVisuals.DefaultDisplayName; $logo=$x.Game.ShellVisuals.Square150x150Logo }catch{}
  if(-not $name -or $name -like 'ms-resource*'){ $name=$m.Package.Properties.DisplayName }
  if(-not $name -or $name -like 'ms-resource*'){ $name=$p.Name }
  $lp=$null; if($logo){ $lp=Join-Path $loc $logo }
  $out+=[pscustomobject]@{ name=[string]$name; family=$p.PackageFamilyName; appId=[string]$app.Id; dir=$loc; logo=$lp }
}
ConvertTo-Json -InputObject @($out) -Compress
"#;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct XboxPkg {
        name: String,
        family: String,
        app_id: String,
        dir: String,
        logo: Option<String>,
    }

    pub fn run_ps(script: &str) -> Option<String> {
        let wide: Vec<u8> = script.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
        use base64::Engine;
        let enc = base64::engine::general_purpose::STANDARD.encode(wide);
        let o = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", &enc])
            .creation_flags(NO_WINDOW)
            .output()
            .ok()?;
        Some(String::from_utf8_lossy(&o.stdout).into_owned())
    }

    pub fn xbox() -> Vec<Game> {
        let Some(txt) = run_ps(XBOX_PS) else { return vec![] };
        let txt = txt.trim().trim_start_matches('\u{feff}');
        let Ok(pkgs) = serde_json::from_str::<Vec<XboxPkg>>(txt) else { return vec![] };
        pkgs.into_iter()
            .filter(|p| !p.app_id.is_empty())
            .map(|p| Game {
                id: format!("xbox:{}", p.family),
                name: p.name,
                store: "xbox".into(),
                install_dir: Some(p.dir),
                launch: uri(format!("shell:AppsFolder\\{}!{}", p.family, p.app_id)),
                steam_app_id: None,
                icon_source: p.logo,
            })
            .collect()
    }
}
