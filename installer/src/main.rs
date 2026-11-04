// Installeur de Hangar : une fenêtre aux couleurs de l'app qui exécute en silence
// l'installeur NSIS embarqué (raccourcis, désinstalleur et registre restent gérés par NSIS).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

const NSIS: &[u8] = include_bytes!(env!("HANGAR_NSIS"));
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(serde::Serialize)]
struct Info {
    version: String,
    dir: String,
    update: bool,
}

/// Dossier d'une installation existante (clé de désinstallation écrite par NSIS, stable
/// même si l'éditeur change), sinon `%LOCALAPPDATA%\Hangar`.
fn current_dir() -> (PathBuf, bool) {
    #[cfg(windows)]
    {
        let key = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
            .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Hangar");
        if let Ok(dir) = key.and_then(|k| k.get_value::<String, _>("InstallLocation")) {
            let dir = PathBuf::from(dir.trim_matches('"'));
            if dir.join("hangar.exe").exists() {
                return (dir, true);
            }
        }
    }
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_default();
    (base.join("Hangar"), false)
}

/// Un dossier choisi par l'utilisateur reçoit un sous-dossier `Hangar`, comme dans NSIS.
fn with_hangar(dir: PathBuf) -> PathBuf {
    if dir.file_name().is_some_and(|n| n.eq_ignore_ascii_case("hangar")) {
        dir
    } else {
        dir.join("Hangar")
    }
}

#[tauri::command]
fn info(app: AppHandle) -> Info {
    let (dir, update) = current_dir();
    Info { version: app.package_info().version.to_string(), dir: dir.display().to_string(), update }
}

#[tauri::command]
async fn pick_dir(app: AppHandle, dir: String) -> Option<String> {
    let picked = app.dialog().file().set_directory(&dir).blocking_pick_folder()?;
    Some(with_hangar(picked.into_path().ok()?).display().to_string())
}

fn write_nsis() -> Result<PathBuf, String> {
    let path = std::env::temp_dir().join(format!("hangar-setup-{}.exe", std::process::id()));
    std::fs::write(&path, NSIS).map_err(|e| format!("Impossible d'extraire l'installeur : {e}"))?;
    Ok(path)
}

#[tauri::command]
async fn install(dir: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let setup = write_nsis()?;
        let mut cmd = Command::new(&setup);
        cmd.arg("/S");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(CREATE_NO_WINDOW);
            // /D doit être le dernier argument, sans guillemets (règle NSIS).
            cmd.raw_arg(format!("/D={dir}"));
        }
        let status = cmd.status();
        let _ = std::fs::remove_file(&setup);
        let status = status.map_err(|e| format!("Impossible de lancer l'installation : {e}"))?;
        if !status.success() {
            return Err(format!("L'installeur s'est arrêté (code {}).", status.code().unwrap_or(-1)));
        }
        if !Path::new(&dir).join("hangar.exe").exists() {
            return Err("Hangar n'a pas été trouvé après l'installation.".into());
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn launch(app: AppHandle, dir: String) -> Result<(), String> {
    Command::new(Path::new(&dir).join("hangar.exe"))
        .current_dir(&dir)
        .spawn()
        .map_err(|e| format!("Impossible de lancer Hangar : {e}"))?;
    app.exit(0);
    Ok(())
}

/// Sans WebView2, la fenêtre ne peut pas s'ouvrir : on passe la main à l'installeur NSIS
/// classique, qui sait installer WebView2.
fn fallback() {
    if let Ok(setup) = write_nsis() {
        let _ = Command::new(&setup).status();
        let _ = std::fs::remove_file(setup);
    }
}

fn main() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![info, pick_dir, install, launch])
        .setup(|app| {
            // Données WebView2 dans %TEMP% : rien ne reste dans AppData après l'installation.
            let built = WebviewWindowBuilder::new(app, "setup", WebviewUrl::default())
                .title("Installation de Hangar")
                .inner_size(860.0, 520.0)
                .resizable(false)
                .maximizable(false)
                .decorations(false)
                .center()
                .background_color(tauri::window::Color(10, 11, 15, 255))
                .data_directory(std::env::temp_dir().join("hangar-setup-webview"))
                .build();
            if built.is_err() {
                fallback();
                app.handle().exit(0);
            }
            Ok(())
        })
        .run(tauri::generate_context!());
    if result.is_err() {
        fallback();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ajoute_hangar_au_dossier_choisi() {
        assert_eq!(with_hangar(PathBuf::from(r"D:\Jeux")), PathBuf::from(r"D:\Jeux\Hangar"));
        assert_eq!(with_hangar(PathBuf::from(r"D:\Jeux\hangar")), PathBuf::from(r"D:\Jeux\hangar"));
    }

    #[test]
    fn nsis_embarque() {
        assert_eq!(&NSIS[..2], b"MZ");
    }
}
