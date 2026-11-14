//! Launchers invisibles : pendant une action de Hangar (lancement, mise à jour), chaque fenêtre
//! ouverte par un launcher (Steam, Epic, Ubisoft Connect, EA app...) est cachée dès qu'elle
//! apparaît. Le launcher continue de tourner dans la zone de notification (les DRM en ont besoin).
//!
//! Le voile s'arrête quelques secondes après la détection du jeu (les fenêtres restent cachées).
//! Si le jeu ne démarre pas, le launcher attend sans doute l'utilisateur (connexion, contrat) :
//! `lift` réaffiche ce qui a été caché. Une petite fenêtre (boîte de dialogue) encore ouverte après
//! `STUCK` alors que le jeu n'a pas démarré attend une réponse : elle est réaffichée au premier plan
//! sans attendre.
//!
//! Les boîtes de Steam Cloud (synchronisation impossible, cloud obsolète, conflit) sont reconnues à
//! leur titre et restent cachées : Hangar pose la question dans son écran de lancement
//! (`launch://prompt`), puis ferme la boîte (Annuler) ou la montre au-dessus de Hangar pour le choix
//! (`answer`). Steam n'expose pas ses boutons aux autres programmes : Hangar ne clique pas à sa place.

use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::Emitter;

/// Un peu plus que la recherche du jeu par le tracker, qui appelle `lift` à son abandon.
const COVER: Duration = Duration::from_secs(95);
/// Après la détection du jeu : certains launchers rouvrent une fenêtre juste après.
const GRACE: Duration = Duration::from_secs(10);
/// Une boîte de dialogue encore ouverte après ce délai attend l'utilisateur (les fenêtres de
/// progression, elles, se ferment d'elles-mêmes).
const STUCK: Duration = Duration::from_secs(6);

struct State {
    until: Option<Instant>,
    running: bool,
    /// Le jeu a démarré : plus aucune fenêtre n'est réaffichée.
    settled: bool,
    /// Fenêtres cachées (HWND), réaffichées par `lift`.
    hidden: Vec<isize>,
    /// Boîtes du launcher dont Hangar pose la question, en attente de `answer`.
    prompts: Vec<isize>,
}

static STATE: Mutex<State> =
    Mutex::new(State { until: None, running: false, settled: false, hidden: Vec::new(), prompts: Vec::new() });
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();

/// Boîtes de Steam qui attendent une réponse avant de lancer le jeu, reconnues à leur titre
/// (Steam en français ou en anglais ; les autres langues passent par `STUCK`).
const PROMPTS: [(&str, &str); 6] = [
    ("synchronisation impossible", "syncFailed"),
    ("unable to sync", "syncFailed"),
    ("cloud obsolète", "pending"),
    ("cloud out of date", "pending"),
    ("conflit avec le cloud", "conflict"),
    ("cloud conflict", "conflict"),
];

fn prompt_kind(title: &str) -> Option<&'static str> {
    let t = title.to_lowercase();
    PROMPTS.iter().find(|(p, _)| t.contains(p)).map(|(_, k)| *k)
}

#[derive(serde::Serialize, Clone)]
struct PromptEvent {
    kind: &'static str,
    hwnd: i64,
}

/// À appeler au démarrage : les questions des launchers partent vers l'interface.
pub fn init(app: tauri::AppHandle) {
    let _ = APP.set(app);
}

fn state() -> std::sync::MutexGuard<'static, State> {
    STATE.lock().unwrap_or_else(|p| p.into_inner())
}

/// Cache les fenêtres des launchers pendant `COVER`.
pub fn cover() {
    let mut s = state();
    s.until = Some(Instant::now() + COVER);
    s.settled = false;
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
    s.settled = true;
    if let Some(u) = s.until {
        s.until = Some(u.min(Instant::now() + GRACE));
    }
}

/// Arrête le voile et réaffiche les fenêtres cachées. Renvoie vrai s'il y en avait.
/// Les questions encore ouvertes aussi : l'écran de lancement de Hangar n'est plus là pour elles.
pub fn lift() -> bool {
    let (hidden, prompts) = {
        let mut s = state();
        s.until = None;
        (std::mem::take(&mut s.hidden), std::mem::take(&mut s.prompts))
    };
    for &h in &hidden {
        win::show(h);
    }
    for &h in &prompts {
        win::reveal(h);
    }
    !hidden.is_empty() || !prompts.is_empty()
}

/// Réponse à une question posée dans Hangar : `show` montre la boîte du launcher au-dessus de
/// Hangar (le choix se fait dedans), sinon elle est fermée, ce qui l'annule.
pub fn answer(hwnd: i64, show: bool) -> Result<(), String> {
    let h = hwnd as isize;
    {
        let mut s = state();
        let Some(i) = s.prompts.iter().position(|&p| p == h) else {
            return Err("Cette demande du launcher n'est plus ouverte.".into());
        };
        s.prompts.remove(i);
    }
    if show {
        win::reveal_over_hangar(h);
    } else {
        win::close(h);
    }
    log::info!("voile : question du launcher, réponse {}", if show { "montrer" } else { "annuler" });
    Ok(())
}

fn run() {
    let mut names = std::collections::HashMap::<u32, bool>::new();
    let mut sys = sysinfo::System::new();
    // Première fois que chaque fenêtre a été cachée, et fenêtres rendues à l'utilisateur.
    let mut since = std::collections::HashMap::<isize, Instant>::new();
    let mut spared = std::collections::HashSet::<isize>::new();
    loop {
        std::thread::sleep(Duration::from_millis(120));
        if !state().until.is_some_and(|u| Instant::now() < u) {
            state().running = false;
            return;
        }
        check_hidden(&mut since, &mut spared);
        for (hwnd, pid) in win::visible_windows() {
            if spared.contains(&hwnd) {
                continue;
            }
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
                since.entry(hwnd).or_insert_with(Instant::now);
                let mut s = state();
                if !s.hidden.contains(&hwnd) {
                    s.hidden.push(hwnd);
                }
            }
        }
    }
}

/// Tant que le jeu n'a pas démarré, une fenêtre cachée peut attendre l'utilisateur : une boîte de
/// Steam Cloud devient une question de Hangar, une autre boîte encore ouverte après `STUCK` est
/// réaffichée au premier plan. Le titre est relu à chaque passage : Steam peut le donner après
/// l'apparition de la fenêtre.
fn check_hidden(
    since: &mut std::collections::HashMap<isize, Instant>,
    spared: &mut std::collections::HashSet<isize>,
) {
    let mut asks = vec![];
    let mut s = state();
    if s.settled {
        return;
    }
    s.hidden.retain(|&h| {
        if let Some(kind) = prompt_kind(&win::title(h)) {
            asks.push((h, kind));
            spared.insert(h);
            return false;
        }
        let stuck = since.get(&h).is_some_and(|t| t.elapsed() >= STUCK);
        if !stuck || !win::is_dialog(h) {
            return true;
        }
        log::info!("voile : une fenêtre du launcher attend l'utilisateur, réaffichée");
        win::reveal(h);
        spared.insert(h);
        false
    });
    s.prompts.extend(asks.iter().map(|&(h, _)| h));
    drop(s);
    for (h, kind) in asks {
        log::info!("voile : le launcher attend une réponse ({kind}), question posée dans Hangar");
        match APP.get() {
            Some(app) => {
                let _ = app.emit("launch://prompt", PromptEvent { kind, hwnd: h as i64 });
            }
            None => {
                let _ = answer(h as i64, true);
            }
        }
    }
}

#[cfg(windows)]
mod win {
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, GetSystemMetrics, GetWindowRect, GetWindowThreadProcessId,
        InternalGetWindowText, IsWindow, IsWindowVisible, PostMessageW, SetForegroundWindow, SetWindowPos, ShowWindow,
        SM_CXSCREEN, SM_CYSCREEN, SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER, SW_HIDE, SW_SHOW, WM_CLOSE,
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

    /// Fenêtre encore ouverte et petite par rapport à l'écran : une boîte de dialogue, pas la
    /// fenêtre principale du launcher (qui reste cachée).
    pub fn is_dialog(h: isize) -> bool {
        let mut r = RECT { left: 0, top: 0, right: 0, bottom: 0 };
        // SAFETY : `r` vit pendant l'appel ; un HWND fermé est écarté par IsWindow.
        let (w, hh, sw, sh) = unsafe {
            if IsWindow(h as HWND) == 0 || GetWindowRect(h as HWND, &mut r) == 0 {
                return false;
            }
            (r.right - r.left, r.bottom - r.top, GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN))
        };
        w > 0 && hh > 0 && w * 10 < sw * 6 && hh * 10 < sh * 6
    }

    /// Réaffiche la fenêtre et la passe au premier plan (Hangar l'est, il peut la céder).
    pub fn reveal(h: isize) {
        show(h);
        // SAFETY : idem, sans effet sur une fenêtre fermée.
        unsafe { SetForegroundWindow(h as HWND) };
    }

    /// Titre de la fenêtre, sans lui envoyer de message (un launcher figé ne bloque pas le voile).
    pub fn title(h: isize) -> String {
        let mut buf = [0u16; 256];
        // SAFETY : le tampon vit pendant l'appel, sa taille est passée.
        let n = unsafe { InternalGetWindowText(h as HWND, buf.as_mut_ptr(), buf.len() as i32) };
        String::from_utf16_lossy(&buf[..n.max(0) as usize])
    }

    fn rect(h: isize) -> Option<RECT> {
        let mut r = RECT { left: 0, top: 0, right: 0, bottom: 0 };
        // SAFETY : `r` vit pendant l'appel.
        (unsafe { GetWindowRect(h as HWND, &mut r) } != 0).then_some(r)
    }

    /// Montre la boîte centrée sur Hangar, au premier plan : l'utilisateur vient d'y cliquer.
    pub fn reveal_over_hangar(h: isize) {
        // SAFETY : aucun pointeur conservé ; un HWND fermé est refusé sans effet.
        unsafe {
            let fg = GetForegroundWindow();
            let mut pid = 0u32;
            GetWindowThreadProcessId(fg, &mut pid);
            if pid == std::process::id() {
                if let (Some(a), Some(b)) = (rect(fg as isize), rect(h)) {
                    let x = a.left + ((a.right - a.left) - (b.right - b.left)) / 2;
                    let y = a.top + ((a.bottom - a.top) - (b.bottom - b.top)) / 2;
                    SetWindowPos(h as HWND, std::ptr::null_mut(), x, y, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
                }
            }
        }
        reveal(h);
    }

    /// Ferme la boîte comme sa croix : le launcher l'annule.
    pub fn close(h: isize) {
        // SAFETY : message posté, sans effet sur une fenêtre fermée.
        unsafe { PostMessageW(h as HWND, WM_CLOSE, 0, 0) };
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
    pub fn is_dialog(_: isize) -> bool {
        false
    }
    pub fn reveal(_: isize) {}
    pub fn title(_: isize) -> String {
        String::new()
    }
    pub fn reveal_over_hangar(_: isize) {}
    pub fn close(_: isize) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn boites_de_steam_cloud() {
        assert_eq!(prompt_kind("Synchronisation impossible"), Some("syncFailed"));
        assert_eq!(prompt_kind("Cloud Out of Date"), Some("pending"));
        assert_eq!(prompt_kind("Conflit avec le cloud"), Some("conflict"));
        assert_eq!(prompt_kind("Steam"), None);
        assert!(answer(12345, false).is_err(), "seules les boîtes signalées par le voile");
    }

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
