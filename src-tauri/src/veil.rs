//! Launchers invisibles : pendant une action de Hangar (lancement, mise à jour), chaque fenêtre
//! ouverte par un launcher (Steam, Epic, Ubisoft Connect, EA app...) est cachée dès qu'elle
//! apparaît. Le launcher continue de tourner dans la zone de notification (les DRM en ont besoin).
//!
//! Le voile s'arrête quelques secondes après la détection du jeu (les fenêtres restent cachées).
//! Si le jeu ne démarre pas, le launcher attend sans doute l'utilisateur (connexion, contrat) :
//! `lift` réaffiche ce qui a été caché.

use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Un peu plus que la recherche du jeu par le tracker, qui appelle `lift` à son abandon.
const COVER: Duration = Duration::from_secs(95);
/// Après la détection du jeu : certains launchers rouvrent une fenêtre juste après.
const GRACE: Duration = Duration::from_secs(10);

struct State {
    until: Option<Instant>,
    running: bool,
    /// Fenêtres cachées (HWND), réaffichées par `lift`.
    hidden: Vec<isize>,
}

static STATE: Mutex<State> = Mutex::new(State { until: None, running: false, hidden: Vec::new() });

fn state() -> std::sync::MutexGuard<'static, State> {
    STATE.lock().unwrap_or_else(|p| p.into_inner())
}

/// Cache les fenêtres des launchers pendant `COVER`.
pub fn cover() {
    let mut s = state();
    s.until = Some(Instant::now() + COVER);
    if s.running || !cfg!(windows) {
        return;
    }
    s.running = true;
    s.hidden.clear();
    std::thread::Builder::new()
        .name("hangar-voile".into())
        .spawn(run)
        .map_err(|e| log::warn!("voile impossible : {e}"))
        .ok();
}

/// Le jeu a démarré : le voile s'arrête bientôt, les fenêtres cachées le restent.
pub fn settle() {
    let mut s = state();
    if let Some(u) = s.until {
        s.until = Some(u.min(Instant::now() + GRACE));
    }
}

/// Arrête le voile et réaffiche les fenêtres cachées. Renvoie vrai s'il y en avait.
pub fn lift() -> bool {
    let hidden = {
        let mut s = state();
        s.until = None;
        std::mem::take(&mut s.hidden)
    };
    for &h in &hidden {
        win::show(h);
    }
    !hidden.is_empty()
}

fn run() {
    let mut names = std::collections::HashMap::<u32, bool>::new();
    let mut sys = sysinfo::System::new();
    loop {
        std::thread::sleep(Duration::from_millis(120));
        if !state().until.is_some_and(|u| Instant::now() < u) {
            state().running = false;
            return;
        }
        for (hwnd, pid) in win::visible_windows() {
            let launcher = *names.entry(pid).or_insert_with(|| {
                let p = sysinfo::Pid::from_u32(pid);
                sys.refresh_processes_specifics(
                    sysinfo::ProcessesToUpdate::Some(&[p]),
                    true,
                    sysinfo::ProcessRefreshKind::nothing(),
                );
                sys.process(p).is_some_and(|p| crate::tracker::is_launcher_process(&p.name().to_string_lossy()))
            });
            if launcher && win::hide(hwnd) {
                let mut s = state();
                if !s.hidden.contains(&hwnd) {
                    s.hidden.push(hwnd);
                }
            }
        }
    }
}

#[cfg(windows)]
mod win {
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, IsWindow, IsWindowVisible, ShowWindow, SW_HIDE, SW_SHOW,
    };

    /// Fenêtres de premier niveau visibles : (HWND, pid).
    pub fn visible_windows() -> Vec<(isize, u32)> {
        unsafe extern "system" fn each(h: HWND, out: LPARAM) -> BOOL {
            // SAFETY : `out` pointe sur le Vec de l'appelant, vivant pendant EnumWindows.
            unsafe {
                if IsWindowVisible(h) != 0 {
                    let mut pid = 0u32;
                    GetWindowThreadProcessId(h, &mut pid);
                    (*(out as *mut Vec<(isize, u32)>)).push((h as isize, pid));
                }
            }
            1
        }
        let mut out: Vec<(isize, u32)> = vec![];
        // SAFETY : rappel synchrone, le Vec vit jusqu'au retour.
        unsafe { EnumWindows(Some(each), &mut out as *mut _ as LPARAM) };
        out
    }

    pub fn hide(h: isize) -> bool {
        // SAFETY : un HWND périmé est refusé par Windows sans effet.
        unsafe { ShowWindow(h as HWND, SW_HIDE) != 0 }
    }

    pub fn show(h: isize) {
        // SAFETY : idem, IsWindow écarte les fenêtres fermées entre-temps.
        unsafe {
            if IsWindow(h as HWND) != 0 {
                ShowWindow(h as HWND, SW_SHOW);
            }
        }
    }
}

#[cfg(not(windows))]
mod win {
    pub fn visible_windows() -> Vec<(isize, u32)> {
        vec![]
    }
    pub fn hide(_: isize) -> bool {
        false
    }
    pub fn show(_: isize) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settle_raccourcit_et_lift_arrete() {
        state().until = Some(Instant::now() + COVER);
        settle();
        assert!(state().until.unwrap() <= Instant::now() + GRACE);
        assert!(!lift(), "rien de caché");
        assert!(state().until.is_none());
    }

    /// Ouvre les téléchargements de Steam, vérifie que la fenêtre est cachée puis la réaffiche :
    /// `cargo test voile_reel -- --ignored --nocapture` (Steam installé).
    #[test]
    #[ignore]
    fn voile_reel() {
        cover();
        crate::launcher::launch(&crate::model::uri("steam://open/downloads")).unwrap();
        std::thread::sleep(Duration::from_secs(6));
        let hidden = state().hidden.len();
        println!("fenêtres cachées : {hidden}");
        assert!(lift(), "la fenêtre de Steam aurait dû être cachée");
    }
}
