//! Bouton Xbox (Guide) d'une manette, lu partout, même quand une autre app est au premier plan :
//! il ramène Hangar devant et ouvre le mode manette. Quand Hangar a déjà le focus, la fenêtre
//! gère elle-même le bouton (API Gamepad : ouvre et ferme le mode manette comme Start).
//! Fermer le mode manette ouvert ainsi rend la main à l'app d'avant : Hangar retourne là où il
//! était (caché, réduit ou derrière), sans rester en fenêtre par-dessus.
//!
//! Windows seulement : `XInputGetStateEx` (ordinal 100 de xinput1_4.dll), seule façon de lire
//! le bouton Guide, que `XInputGetState` masque. Ailleurs, rien (l'API Gamepad de la fenêtre).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Réglage « Mode manette » : le bouton ramène Hangar (désactivé par défaut).
static ENABLED: AtomicBool = AtomicBool::new(false);

/// Où était Hangar avant que le bouton le ramène devant.
#[derive(Clone, Copy, Debug, PartialEq)]
#[cfg_attr(not(windows), allow(dead_code))]
enum Before {
    Hidden,
    Minimized,
    Behind,
}

static BEFORE: Mutex<Option<Before>> = Mutex::new(None);

pub fn set_enabled(on: bool) {
    ENABLED.store(on, Ordering::Relaxed);
}

/// Hangar caché : l'état d'avant le bouton ne sert plus.
pub fn forget() {
    if let Ok(mut b) = BEFORE.lock() {
        *b = None;
    }
}

/// Le mode manette vient de se fermer : si le bouton l'avait ouvert depuis une autre app et
/// que `restore` est vrai (B, Start, Xbox, Échap), Hangar retourne là où il était.
pub fn back(app: &AppHandle, restore: bool) {
    let before = BEFORE.lock().ok().and_then(|mut b| b.take());
    let (Some(before), true) = (before, restore) else { return };
    if before == Before::Hidden {
        return crate::desktop::hide_main(app);
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_fullscreen(false);
        let _ = w.minimize();
    }
}

/// La Game Bar de Windows s'ouvre-t-elle avec le bouton Xbox ? (réglage « Ouvrir la Game Bar
/// avec ce bouton sur une manette », actif tant que la valeur n'existe pas). Faux ailleurs.
pub fn game_bar_on_button() -> bool {
    #[cfg(windows)]
    {
        use winreg::{enums::HKEY_CURRENT_USER, RegKey};
        RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(r"Software\Microsoft\GameBar")
            .and_then(|k| k.get_value::<u32, _>("UseNexusForGameBarEnabled"))
            .map(|v| v != 0)
            .unwrap_or(true)
    }
    #[cfg(not(windows))]
    false
}

/// Lance la lecture du bouton dans son propre fil (Windows).
pub fn start(app: AppHandle) {
    #[cfg(windows)]
    std::thread::Builder::new()
        .name("bouton-xbox".into())
        .spawn(move || win::run(app))
        .map(|_| ())
        .unwrap_or_else(|e| log::warn!("bouton Xbox : fil non lancé : {e}"));
    #[cfg(not(windows))]
    let _ = app;
}

/// État de la fenêtre avant que le bouton la ramène devant.
#[cfg_attr(not(windows), allow(dead_code))]
fn before_state(visible: bool, minimized: bool) -> Before {
    if !visible {
        Before::Hidden
    } else if minimized {
        Before::Minimized
    } else {
        Before::Behind
    }
}

/// Bouton Guide enfoncé maintenant alors qu'il ne l'était pas avant.
fn pressed_now(prev: bool, now: bool) -> bool {
    now && !prev
}

#[cfg(windows)]
mod win {
    use std::sync::atomic::Ordering;
    use std::time::{Duration, Instant};
    use tauri::{AppHandle, Emitter, Manager};
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

    const GUIDE: u16 = 0x0400;
    const SLOTS: u32 = 4;
    /// Lecture des manettes branchées.
    const TICK: Duration = Duration::from_millis(40);
    /// Recherche de nouvelles manettes (lire un emplacement vide est lent).
    const SCAN: Duration = Duration::from_secs(2);

    /// `XINPUT_STATE`, plus une marge : la version « Ex » écrit 4 octets de plus.
    #[repr(C)]
    #[derive(Default)]
    struct State {
        packet: u32,
        buttons: u16,
        triggers: [u8; 2],
        thumbs: [i16; 4],
        _ex: u32,
    }

    type GetStateEx = unsafe extern "system" fn(u32, *mut State) -> u32;

    fn load() -> Option<GetStateEx> {
        let name: Vec<u16> = "xinput1_4.dll\0".encode_utf16().collect();
        // SAFETY : chaîne terminée par un zéro ; l'ordinal 100 (MAKEINTRESOURCE) est
        // `XInputGetStateEx`, de signature `(DWORD, XINPUT_STATE*) -> DWORD`.
        unsafe {
            let lib = LoadLibraryW(name.as_ptr());
            if lib.is_null() {
                return None;
            }
            let f = GetProcAddress(lib, 100usize as *const u8)?;
            Some(std::mem::transmute::<unsafe extern "system" fn() -> isize, GetStateEx>(f))
        }
    }

    pub fn run(app: AppHandle) {
        let Some(get) = load() else {
            log::info!("bouton Xbox : XInput indisponible, lu seulement quand Hangar a le focus");
            return;
        };
        let mut connected = [false; SLOTS as usize];
        let mut held = [false; SLOTS as usize];
        let mut last_scan: Option<Instant> = None;
        loop {
            let scan = last_scan.is_none_or(|t| t.elapsed() >= SCAN);
            if scan {
                last_scan = Some(Instant::now());
            }
            for i in 0..SLOTS {
                let s = i as usize;
                if !connected[s] && !scan {
                    continue;
                }
                let mut st = State::default();
                // SAFETY : `st` vit pendant l'appel et est assez grand pour la version « Ex ».
                let ok = unsafe { get(i, &mut st) } == 0;
                connected[s] = ok;
                let now = ok && st.buttons & GUIDE != 0;
                if super::pressed_now(held[s], now) {
                    on_guide(&app);
                }
                held[s] = now;
            }
            std::thread::sleep(if connected.contains(&true) { TICK } else { SCAN });
        }
    }

    fn on_guide(app: &AppHandle) {
        if !super::ENABLED.load(Ordering::Relaxed) {
            return;
        }
        let Some(w) = app.get_webview_window("main") else { return };
        let visible = w.is_visible().unwrap_or(false);
        let minimized = w.is_minimized().unwrap_or(false);
        let focused = w.is_focused().unwrap_or(false);
        if visible && focused && !minimized {
            return; // la fenêtre lit le bouton elle-même
        }
        // Mode manette déjà affiché mais sans le focus parce que la Game Bar, ouverte par le
        // même bouton, l'a pris : le bouton le ferme, comme si Hangar avait le focus.
        if visible && !minimized && w.is_fullscreen().unwrap_or(false) && super::game_bar_on_button() {
            let _ = app.emit_to("main", "pad://guide", "close");
            return;
        }
        let before = super::before_state(visible, minimized);
        if let Ok(mut b) = super::BEFORE.lock() {
            *b = Some(before);
        }
        crate::desktop::show_main(app);
        let _ = app.emit_to("main", "pad://guide", "open");
    }
}

#[cfg(test)]
mod tests {
    use super::{before_state, pressed_now, Before};

    #[test]
    fn etat_avant_le_bouton() {
        assert_eq!(before_state(false, false), Before::Hidden);
        assert_eq!(before_state(false, true), Before::Hidden);
        assert_eq!(before_state(true, true), Before::Minimized);
        assert_eq!(before_state(true, false), Before::Behind);
    }

    #[test]
    fn appui_seulement_au_front_montant() {
        assert!(pressed_now(false, true));
        assert!(!pressed_now(true, true));
        assert!(!pressed_now(true, false));
        assert!(!pressed_now(false, false));
    }
}
