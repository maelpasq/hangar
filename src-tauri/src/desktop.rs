//! Bureau : icône dans la zone de notification (petit menu Hangar au clic gauche, menu
//! natif au clic droit), fermeture dans la zone plutôt que quitter, raccourci global.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Fermer la fenêtre la cache dans la zone de notification (réglage, vrai par défaut).
pub static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);
/// Dernière fois que le menu s'est caché en perdant le focus (ms) : un clic sur l'icône
/// juste après sert à le fermer, pas à le rouvrir.
static MENU_BLUR_MS: AtomicU64 = AtomicU64::new(0);
/// Ouverture du menu (ms). Windows : la barre des tâches reprend le focus juste après le clic
/// sur l'icône ; une perte de focus aussitôt après l'ouverture ne ferme donc pas le menu.
static MENU_SHOWN_MS: AtomicU64 = AtomicU64::new(0);
const MENU_GRACE_MS: u64 = 600;

const TRAY_ID: &str = "hangar";
const MENU: &str = "tray";
const MENU_W: f64 = 300.0;
/// Jeux récents dans le menu de l'icône.
pub const MAX_RECENTS: usize = 5;

pub const SHORTCUT_LABEL: &str = if cfg!(target_os = "macos") { "⌃⌥H" } else { "Ctrl+Alt+H" };

/// Un jeu récent du menu : id connu, nom affiché, jaquette en cache (adresse `asset:`).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrayGame {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub cover: Option<String>,
}

/// Ce qu'affiche le menu Hangar : jeux récents et apparence de l'app.
#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrayState {
    games: Vec<TrayGame>,
    theme: String,
    accent: String,
}

static STATE: Mutex<Option<TrayState>> = Mutex::new(None);

pub fn shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyH)
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Sort du plein écran (mode manette). Vrai s'il y était.
fn leave_fullscreen(w: &WebviewWindow) -> bool {
    let full = w.is_fullscreen().unwrap_or(false);
    if full {
        let _ = w.set_fullscreen(false);
    }
    full
}

/// Cache la fenêtre principale : jamais en plein écran (le frontend quitte le mode manette).
pub fn hide_main(app: &AppHandle) {
    let Some(w) = main_window(app) else { return };
    leave_fullscreen(&w);
    let _ = w.hide();
    let _ = app.emit_to("main", "main://hidden", ());
}

/// Quitte Hangar. En plein écran, on en sort d'abord et on laisse la fenêtre reprendre sa
/// taille : sinon la taille de l'écran serait mémorisée et rouverte au lancement suivant.
pub fn quit(app: &AppHandle) {
    let full = main_window(app).is_some_and(|w| leave_fullscreen(&w));
    if !full {
        return app.exit(0);
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(350));
        app.exit(0);
    });
}

/// Fermeture de la fenêtre principale : cachée dans la zone de notification si le réglage
/// est actif, sinon vraie fermeture (après la sortie du plein écran, même raison que `quit`).
pub fn on_close_requested(w: &tauri::Window, api: &tauri::CloseRequestApi) {
    if w.label() != "main" {
        return;
    }
    let app = w.app_handle();
    if close_to_tray() {
        api.prevent_close();
        hide_main(app);
    } else if main_window(app).is_some_and(|m| m.is_fullscreen().unwrap_or(false)) {
        api.prevent_close();
        quit(app);
    }
}

/// Démarrage : une ancienne version a pu mémoriser la taille de l'écran entier (fermée en
/// mode manette). On remet la taille par défaut, centrée.
pub fn fix_restored_size(app: &AppHandle) {
    let Some(w) = main_window(app) else { return };
    let _ = w.set_fullscreen(false);
    let (Ok(size), Ok(Some(m))) = (w.outer_size(), w.current_monitor()) else { return };
    let screen = m.size();
    if !w.is_maximized().unwrap_or(false) && size.width >= screen.width && size.height >= screen.height {
        log::info!("taille de fenêtre plein écran mémorisée : remise à la taille par défaut");
        let _ = w.set_size(tauri::LogicalSize::new(1320.0, 840.0));
        let _ = w.center();
    }
}

/// Raccourci global : Hangar au premier plan, ou caché s'il l'est déjà.
fn toggle_main(app: &AppHandle) {
    let Some(w) = main_window(app) else { return };
    let front = w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false) && !w.is_minimized().unwrap_or(false);
    if front {
        hide_main(app);
    } else {
        show_main(app);
    }
}

fn native_menu(app: &AppHandle, recents: &[TrayGame]) -> tauri::Result<Menu<tauri::Wry>> {
    let m = Menu::new(app)?;
    m.append(&MenuItem::with_id(app, "show", "Ouvrir Hangar", true, None::<&str>)?)?;
    if !recents.is_empty() {
        m.append(&PredefinedMenuItem::separator(app)?)?;
        for g in recents {
            // Windows : « & » marque la lettre de raccourci d'un menu ; doublé, il s'affiche.
            let name = if cfg!(windows) { g.name.replace('&', "&&") } else { g.name.clone() };
            m.append(&MenuItem::with_id(app, format!("game:{}", g.id), name, true, None::<&str>)?)?;
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

/// Action d'un élément de menu (natif ou menu Hangar).
pub fn run_action(app: &AppHandle, action: &str) {
    hide_menu(app);
    match action {
        "show" => show_main(app),
        "quit" => quit(app),
        id => {
            if let Some(game) = id.strip_prefix("game:") {
                // Le frontend lance le jeu comme depuis la bibliothèque (jeu connu vérifié par
                // launch_game), fenêtre affichée pour voir le lancement.
                show_main(app);
                let _ = app.emit_to("main", "tray://launch", game.to_string());
            }
        }
    }
}

pub fn init_tray(app: &AppHandle) -> tauri::Result<()> {
    let mut b = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Hangar")
        .menu(&native_menu(app, &[])?)
        // Clic gauche : menu Hangar. Clic droit : menu natif (le même, en plus simple).
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| run_action(app, e.id().as_ref()))
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, position, .. } = e {
                toggle_menu(tray.app_handle(), position);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        b = b.icon(icon.clone());
    }
    b.build(app)?;
    Ok(())
}

/// Hauteur du menu Hangar (logique) : en-tête, une ligne par jeu (au moins une), deux actions.
pub fn menu_height(games: usize) -> f64 {
    180.0 + 52.0 * games.clamp(1, MAX_RECENTS) as f64
}

/// Position du menu (physique) : centré sur le clic, au-dessus de l'icône si elle est en bas
/// de l'écran (barre des tâches), en dessous sinon (barre des menus macOS), dans l'écran.
pub fn menu_position(click: (f64, f64), menu: (f64, f64), area: (f64, f64, f64, f64)) -> (f64, f64) {
    let (ax, ay, aw, ah) = area;
    let margin = 8.0;
    let x = (click.0 - menu.0 / 2.0).clamp(ax + margin, (ax + aw - menu.0 - margin).max(ax + margin));
    let y = if click.1 > ay + ah / 2.0 {
        (click.1.min(ay + ah) - menu.1 - margin).max(ay + margin)
    } else {
        (click.1.max(ay) + margin).min((ay + ah - menu.1 - margin).max(ay + margin))
    };
    (x, y)
}

fn hide_menu(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MENU) {
        let _ = w.hide();
    }
}

fn toggle_menu(app: &AppHandle, click: PhysicalPosition<f64>) {
    if let Some(w) = app.get_webview_window(MENU) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
            return;
        }
    }
    // Le clic qui vient de faire perdre le focus au menu ne le rouvre pas.
    if crate::tracker::now_ms().saturating_sub(MENU_BLUR_MS.load(Ordering::Relaxed)) < 300 {
        return;
    }
    let w = match app.get_webview_window(MENU) {
        Some(w) => w,
        None => match build_menu(app) {
            Ok(w) => w,
            Err(e) => {
                log::warn!("menu de l'icône : {e}");
                return;
            }
        },
    };
    let games = STATE.lock().unwrap_or_else(|p| p.into_inner()).as_ref().map_or(0, |s| s.games.len());
    // Écran du clic, sinon l'écran principal (un clic simulé n'a pas toujours de position).
    let monitor = app.monitor_from_point(click.x, click.y).ok().flatten().or_else(|| app.primary_monitor().ok().flatten());
    let Some(m) = monitor else {
        log::warn!("menu de l'icône : aucun écran trouvé");
        return;
    };
    let scale = m.scale_factor();
    let (mw, mh) = (MENU_W * scale, menu_height(games) * scale);
    let wa = m.work_area();
    let area = (wa.position.x as f64, wa.position.y as f64, wa.size.width as f64, wa.size.height as f64);
    let (x, y) = menu_position((click.x, click.y), (mw, mh), area);
    let _ = w.set_size(tauri::PhysicalSize::new(mw, mh));
    let _ = w.set_position(PhysicalPosition::new(x, y));
    MENU_SHOWN_MS.store(crate::tracker::now_ms(), Ordering::Relaxed);
    let _ = w.show();
    let _ = w.set_focus();
}

/// Fenêtre du menu Hangar : même frontend que l'app (`index.html#tray`), sans cadre,
/// au-dessus de tout, hors de la barre des tâches, cachée dès qu'elle perd le focus.
fn build_menu(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let w = WebviewWindowBuilder::new(app, MENU, WebviewUrl::App("index.html#tray".into()))
        .title("Hangar")
        .inner_size(MENU_W, menu_height(MAX_RECENTS))
        .decorations(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .shadow(true)
        .visible(false)
        .background_color(tauri::window::Color(16, 17, 22, 255))
        .build()?;
    let me = w.clone();
    w.on_window_event(move |e| {
        if let tauri::WindowEvent::Focused(false) = e {
            let now = crate::tracker::now_ms();
            if now.saturating_sub(MENU_SHOWN_MS.load(Ordering::Relaxed)) < MENU_GRACE_MS {
                let _ = me.set_focus();
                return;
            }
            MENU_BLUR_MS.store(now, Ordering::Relaxed);
            let _ = me.hide();
        }
    });
    Ok(w)
}

/// Contenu du menu Hangar, demandé par sa fenêtre à chaque ouverture.
pub fn state() -> TrayState {
    STATE.lock().unwrap_or_else(|p| p.into_inner()).clone().unwrap_or_default()
}

/// Jaquette acceptée seulement si c'est une image locale en cache (protocole `asset:`).
fn local_image(src: Option<String>) -> Option<String> {
    src.filter(|s| s.starts_with("http://asset.localhost/") || s.starts_with("asset://localhost/"))
}

/// Remplace les jeux récents (au plus MAX_RECENTS, noms raccourcis) et l'apparence du menu.
pub fn set_recents(app: &AppHandle, games: Vec<TrayGame>, theme: String, accent: String) {
    let games: Vec<TrayGame> = games
        .into_iter()
        .take(MAX_RECENTS)
        .map(|g| {
            let mut name: String = g.name.chars().take(48).collect();
            if name.len() < g.name.len() {
                name.push('…');
            }
            TrayGame { id: g.id, name, cover: local_image(g.cover) }
        })
        .collect();
    let theme = if matches!(theme.as_str(), "dark" | "light" | "system") { theme } else { "dark".into() };
    let accent = if accent.len() == 7 && accent.starts_with('#') && accent[1..].chars().all(|c| c.is_ascii_hexdigit()) {
        accent
    } else {
        "#7c6cff".into()
    };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        match native_menu(app, &games) {
            Ok(m) => {
                let _ = tray.set_menu(Some(m));
            }
            Err(e) => log::warn!("menu de l'icône : {e}"),
        }
    }
    *STATE.lock().unwrap_or_else(|p| p.into_inner()) = Some(TrayState { games, theme, accent });
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn position_du_menu() {
        // Écran 1920 x 1040 (barre des tâches de 40 px en bas), icône en bas à droite.
        let area = (0.0, 0.0, 1920.0, 1040.0);
        let (x, y) = menu_position((1850.0, 1060.0), (300.0, 400.0), area);
        assert_eq!((x, y), (1612.0, 632.0));
        // Barre des menus macOS en haut : le menu s'ouvre sous l'icône.
        let (x, y) = menu_position((100.0, 12.0), (300.0, 400.0), (0.0, 25.0, 1440.0, 875.0));
        assert_eq!((x, y), (8.0, 33.0));
        assert_eq!(menu_height(0), menu_height(1));
    }

    #[test]
    fn jaquettes_locales_seulement() {
        assert!(local_image(Some("http://asset.localhost/C%3A/cache/a.jpg".into())).is_some());
        assert!(local_image(Some("https://evil.io/a.jpg".into())).is_none());
        assert!(local_image(Some("javascript:alert(1)".into())).is_none());
    }
}
