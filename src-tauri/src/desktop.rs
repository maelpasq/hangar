//! Bureau : icône dans la zone de notification (jeux récents), fermeture dans la zone
//! plutôt que quitter, raccourci global pour afficher ou cacher Hangar.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Fermer la fenêtre la cache dans la zone de notification (réglage, vrai par défaut).
pub static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

const TRAY_ID: &str = "hangar";
/// Jeux récents dans le menu de l'icône.
pub const MAX_RECENTS: usize = 5;

pub const SHORTCUT_LABEL: &str = if cfg!(target_os = "macos") { "⌃⌥H" } else { "Ctrl+Alt+H" };

pub fn shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyH)
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Raccourci global : Hangar au premier plan, ou caché s'il l'est déjà.
fn toggle_main(app: &AppHandle) {
    let Some(w) = app.get_webview_window("main") else { return };
    let front = w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false) && !w.is_minimized().unwrap_or(false);
    if front {
        let _ = w.hide();
    } else {
        show_main(app);
    }
}

fn menu(app: &AppHandle, recents: &[(String, String)]) -> tauri::Result<Menu<tauri::Wry>> {
    let m = Menu::new(app)?;
    m.append(&MenuItem::with_id(app, "show", "Ouvrir Hangar", true, None::<&str>)?)?;
    if !recents.is_empty() {
        m.append(&PredefinedMenuItem::separator(app)?)?;
        for (id, name) in recents {
            m.append(&MenuItem::with_id(app, format!("game:{id}"), name, true, None::<&str>)?)?;
        }
    }
    m.append(&PredefinedMenuItem::separator(app)?)?;
    m.append(&MenuItem::with_id(app, "quit", "Quitter Hangar", true, None::<&str>)?)?;
    Ok(m)
}

/// Le plugin du raccourci global, avec son action.
pub fn shortcut_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, sc, ev| {
            if ev.state == ShortcutState::Pressed && *sc == shortcut() {
                toggle_main(app);
            }
        })
        .build()
}

pub fn init_tray(app: &AppHandle) -> tauri::Result<()> {
    let mut b = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Hangar")
        .menu(&menu(app, &[])?)
        // Windows : clic gauche = ouvrir, clic droit = menu. macOS : le menu, comme partout.
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_menu_event(|app, e| match e.id().as_ref() {
            "show" => show_main(app),
            "quit" => app.exit(0),
            id => {
                if let Some(game) = id.strip_prefix("game:") {
                    // Le frontend lance le jeu comme depuis la bibliothèque (jeu connu vérifié par launch_game).
                    let _ = app.emit("tray://launch", game.to_string());
                }
            }
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                if !cfg!(target_os = "macos") {
                    show_main(tray.app_handle());
                }
            }
        });
    if let Some(icon) = app.default_window_icon() {
        b = b.icon(icon.clone());
    }
    b.build(app)?;
    Ok(())
}

/// Remplace les jeux récents du menu de l'icône (au plus MAX_RECENTS, noms raccourcis).
pub fn set_recents(app: &AppHandle, recents: Vec<(String, String)>) {
    let recents: Vec<(String, String)> = recents
        .into_iter()
        .take(MAX_RECENTS)
        .map(|(id, name)| {
            let mut n: String = name.chars().take(48).collect();
            if n.len() < name.len() {
                n.push('…');
            }
            // Windows : « & » marque la lettre de raccourci d'un menu ; doublé, il s'affiche.
            if cfg!(windows) {
                n = n.replace('&', "&&");
            }
            (id, n)
        })
        .collect();
    let Some(tray) = app.tray_by_id(TRAY_ID) else { return };
    match menu(app, &recents) {
        Ok(m) => {
            let _ = tray.set_menu(Some(m));
        }
        Err(e) => log::warn!("menu de l'icône : {e}"),
    }
}

/// Active ou coupe le raccourci global. Faux si un autre programme l'utilise déjà.
pub fn set_shortcut(app: &AppHandle, on: bool) -> bool {
    let gs = app.global_shortcut();
    let sc = shortcut();
    let registered = gs.is_registered(sc);
    match (on, registered) {
        (true, false) => match gs.register(sc) {
            Ok(()) => true,
            Err(e) => {
                log::warn!("raccourci {SHORTCUT_LABEL} indisponible : {e}");
                false
            }
        },
        (false, true) => {
            let _ = gs.unregister(sc);
            true
        }
        _ => true,
    }
}

pub fn set_close_to_tray(on: bool) {
    CLOSE_TO_TRAY.store(on, Ordering::Relaxed);
}

pub fn close_to_tray() -> bool {
    CLOSE_TO_TRAY.load(Ordering::Relaxed)
}
