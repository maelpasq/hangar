#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod scanner;

use base64::Engine;
use scanner::{Game, Launch};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

fn state_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("state.json"))
}

fn cache_dir(app: &tauri::AppHandle) -> PathBuf {
    let d = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("hangar"))
        .join("icons");
    let _ = fs::create_dir_all(&d);
    d
}

#[tauri::command]
async fn scan_games(local_folders: Vec<String>) -> Result<Vec<Game>, String> {
    tauri::async_runtime::spawn_blocking(move || scanner::scan_all(&local_folders))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn load_state(app: tauri::AppHandle) -> serde_json::Value {
    state_file(&app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or(serde_json::json!({}))
}

#[tauri::command]
fn save_state(app: tauri::AppHandle, state: serde_json::Value) -> Result<(), String> {
    let p = state_file(&app)?;
    let tmp = p.with_extension("tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(&state).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

#[cfg(windows)]
fn shell_open(target: &str, args: &str, cwd: Option<&str>, verb: &str) -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    fn w(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }
    let (t, a, v) = (w(target), w(args), w(verb));
    let c = cwd.filter(|c| Path::new(c).is_dir()).map(w);
    let r = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            v.as_ptr(),
            t.as_ptr(),
            if args.is_empty() { std::ptr::null() } else { a.as_ptr() },
            c.as_ref().map(|c| c.as_ptr()).unwrap_or(std::ptr::null()),
            SW_SHOWNORMAL,
        )
    };
    if r as isize > 32 {
        Ok(())
    } else {
        Err(format!("Impossible de lancer « {target} » (code {})", r as isize))
    }
}

#[cfg(not(windows))]
fn shell_open(target: &str, args: &str, _cwd: Option<&str>, _verb: &str) -> Result<(), String> {
    println!("[dev] lancement: {target} {args}");
    Ok(())
}

#[tauri::command]
fn launch_game(launch: Launch) -> Result<(), String> {
    if launch.kind == "exe" && !Path::new(&launch.target).exists() {
        return Err(format!("Exécutable introuvable : {}", launch.target));
    }
    shell_open(&launch.target, &launch.args, launch.cwd.as_deref(), "open")
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    if !Path::new(&path).exists() {
        return Err("Dossier introuvable".into());
    }
    shell_open(&path, "", None, "explore")
}

#[tauri::command]
fn best_exe(dir: String, name: String) -> Option<String> {
    scanner::best_exe(Path::new(&dir), &name).map(|p| p.to_string_lossy().into_owned())
}

fn hash(s: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.to_lowercase().bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

/// Trouve une image existante (gère les variantes .scale-XXX des paquets Store).
fn find_image(p: &Path) -> Option<PathBuf> {
    if p.exists() {
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

/// Retourne des data-URI PNG pour les exécutables / images demandés (avec cache disque).
#[tauri::command]
async fn get_icons(app: tauri::AppHandle, paths: Vec<String>) -> HashMap<String, String> {
    let cache = cache_dir(&app);
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = HashMap::new();
        let mut to_extract: Vec<(String, PathBuf)> = vec![];
        for src in &paths {
            let lower = src.to_lowercase();
            if lower.ends_with(".png") || lower.ends_with(".jpg") {
                if let Some(f) = find_image(Path::new(src)) {
                    if let Ok(b) = fs::read(&f) {
                        let mime = if lower.ends_with(".jpg") { "jpeg" } else { "png" };
                        out.insert(src.clone(), format!("data:image/{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(b)));
                    }
                }
                continue;
            }
            let png = cache.join(format!("{}.png", hash(src)));
            if !png.exists() && Path::new(src).exists() {
                to_extract.push((src.clone(), png.clone()));
            }
        }
        #[cfg(windows)]
        if !to_extract.is_empty() {
            let mut script = String::from(
                "$ErrorActionPreference='SilentlyContinue'\nAdd-Type -AssemblyName System.Drawing\n",
            );
            for (src, png) in &to_extract {
                let s = src.replace('\'', "''");
                let d = png.to_string_lossy().replace('\'', "''");
                script.push_str(&format!(
                    "try{{ $i=[System.Drawing.Icon]::ExtractAssociatedIcon('{s}'); if($i){{ $i.ToBitmap().Save('{d}',[System.Drawing.Imaging.ImageFormat]::Png) }} }}catch{{}}\n"
                ));
            }
            let _ = scanner::win::run_ps(&script);
        }
        let _ = &to_extract;
        for src in &paths {
            if out.contains_key(src) {
                continue;
            }
            let png = cache.join(format!("{}.png", hash(src)));
            if let Ok(b) = fs::read(&png) {
                out.insert(src.clone(), format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(b)));
            }
        }
        out
    })
    .await
    .unwrap_or_default()
}

fn norm(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .collect::<String>()
        .to_lowercase()
        .replace("™", "")
        .replace("®", "")
}

/// Cherche l'ID Steam correspondant à un nom de jeu, pour récupérer une jaquette.
#[tauri::command]
async fn resolve_steam_id(name: String) -> Option<u32> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean: String = name.replace(['™', '®', '©'], "");
        let url = format!(
            "https://store.steampowered.com/api/storesearch/?term={}&l=english&cc=US",
            urlencode(&clean)
        );
        let v: serde_json::Value = ureq::get(&url)
            .timeout(std::time::Duration::from_secs(8))
            .call()
            .ok()?
            .into_json()
            .ok()?;
        let items = v.get("items")?.as_array()?;
        let target = norm(&clean);
        let pick = items
            .iter()
            .find(|i| i.get("name").and_then(|n| n.as_str()).map(|n| norm(n) == target).unwrap_or(false))
            .or_else(|| {
                items.iter().find(|i| {
                    i.get("name")
                        .and_then(|n| n.as_str())
                        .map(|n| {
                            let n = norm(n);
                            n.len() > 3 && (n.starts_with(&target) || target.starts_with(&n))
                        })
                        .unwrap_or(false)
                })
            })?;
        pick.get("id")?.as_u64().map(|x| x as u32)
    })
    .await
    .ok()
    .flatten()
}

fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_games,
            load_state,
            save_state,
            launch_game,
            open_folder,
            best_exe,
            get_icons,
            resolve_steam_id
        ])
        .run(tauri::generate_context!())
        .expect("erreur au démarrage de Hangar");
}
