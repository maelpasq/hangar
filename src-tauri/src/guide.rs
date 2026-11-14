//! Bouton Xbox (Guide) d'une manette, lu partout, même quand une autre app est au premier plan :
//! il ramène Hangar devant et ouvre le mode manette. Quand Hangar a déjà le focus, la fenêtre
//! gère elle-même le bouton (API Gamepad : ouvre et ferme le mode manette comme Start).
//!
//! Windows seulement : `XInputGetStateEx` (ordinal 100 de xinput1_4.dll), seule façon de lire
//! le bouton Guide, que `XInputGetState` masque. Ailleurs, rien (l'API Gamepad de la fenêtre).

use tauri::AppHandle;

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

/// Bouton Guide enfoncé maintenant alors qu'il ne l'était pas avant.
fn pressed_now(prev: bool, now: bool) -> bool {
    now && !prev
}

#[cfg(windows)]
mod win {
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
        let Some(w) = app.get_webview_window("main") else { return };
        let front = w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false) && !w.is_minimized().unwrap_or(false);
        if front {
            return;
        }
        crate::desktop::show_main(app);
        let _ = app.emit_to("main", "pad://guide", ());
    }
}

#[cfg(test)]
mod tests {
    use super::pressed_now;

    #[test]
    fn appui_seulement_au_front_montant() {
        assert!(pressed_now(false, true));
        assert!(!pressed_now(true, true));
        assert!(!pressed_now(true, false));
        assert!(!pressed_now(false, false));
    }
}
