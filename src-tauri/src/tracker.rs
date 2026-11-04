//! Suivi des processus des jeux lancés : une seule boucle globale (pas un thread par jeu).
//!
//! Après un lancement, on cherche toutes les 2 s (90 s max) un processus dont l'exe est
//! dans le dossier du jeu ou dont le nom est connu. Une fois trouvé, on suit toutes les 5 s ;
//! la session se termine quand plus aucun processus du jeu n'existe.

use crate::model::{Game, Session};
use serde::Serialize;
use std::path::Path;
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use tauri::{AppHandle, Emitter};

const SEARCH_EVERY: Duration = Duration::from_secs(2);
const FOLLOW_EVERY: Duration = Duration::from_secs(5);
const SEARCH_MAX: Duration = Duration::from_secs(90);

/// Processus des launchers : jamais considérés comme « le jeu ».
const LAUNCHER_PROCESSES: &[&str] = &[
    "steam.exe", "steamwebhelper.exe", "steamservice.exe", "epicgameslauncher.exe", "epicwebhelper.exe",
    "battle.net.exe", "agent.exe", "riotclientservices.exe", "riotclientux.exe", "riotclientuxrender.exe",
    "riotclientcrashhandler.exe", "galaxyclient.exe", "galaxyclient helper.exe", "galaxycommunication.exe",
    "upc.exe", "uplaywebcore.exe", "ubisoftconnect.exe", "eadesktop.exe", "eabackgroundservice.exe",
    "eaconnect_microsoft.exe", "xboxapp.exe", "gamingservices.exe",
    // macOS
    "steam_osx", "steam helper", "epicgameslauncher", "epicwebhelper", "battle.net", "riotclientservices",
    "riot client", "gog galaxy",
];

pub fn is_launcher_process(name: &str) -> bool {
    let n = name.to_lowercase();
    LAUNCHER_PROCESSES.contains(&n.as_str())
}

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Ce qui permet de reconnaître les processus d'un jeu.
#[derive(Debug, Clone, Default)]
pub struct Spec {
    /// Dossiers (minuscules, terminés par `\`).
    dirs: Vec<String>,
    /// Noms d'exe (minuscules).
    names: Vec<String>,
    /// Exe à ignorer (minuscules) : les launchers lancés par ce jeu.
    ignore_exes: Vec<String>,
}

/// Chemin comparable : minuscules, séparateurs `\` (les chemins macOS en `/` aussi).
fn norm_path(p: &str) -> String {
    p.replace('/', "\\").to_lowercase()
}

fn norm_dir(d: &str) -> Option<String> {
    let d = norm_path(d).trim_end_matches('\\').to_string();
    // Un dossier racine (« c: ») reconnaîtrait n'importe quel processus.
    (d.len() > 3).then(|| format!("{d}\\"))
}

impl Spec {
    pub fn from_game(g: &Game) -> Spec {
        let mut s = Spec::default();
        if let Some(d) = g.install_dir.as_deref().and_then(norm_dir) {
            s.dirs.push(d);
        } else if g.launch.kind == "exe" && matches!(g.store.as_str(), "local" | "manual") {
            if let Some(d) = Path::new(&g.launch.target).parent().and_then(|p| norm_dir(&p.to_string_lossy())) {
                s.dirs.push(d);
            }
        }
        s.names = g.process_names.iter().map(|n| n.to_lowercase()).collect();
        if g.launch.kind == "exe" && matches!(g.store.as_str(), "riot" | "gog" | "battlenet") {
            s.ignore_exes.push(norm_path(&g.launch.target));
        }
        s
    }

    /// Vrai si le processus (nom, chemin de l'exe) appartient au jeu.
    pub fn matches(&self, name: &str, exe: Option<&str>) -> bool {
        let name = name.to_lowercase();
        if is_launcher_process(&name) {
            return false;
        }
        let exe = exe.map(norm_path);
        if let Some(e) = &exe {
            if self.ignore_exes.iter().any(|x| x == e) {
                return false;
            }
            if self.dirs.iter().any(|d| e.starts_with(d.as_str())) {
                return true;
            }
        }
        self.names.contains(&name)
    }
}

enum Phase {
    Searching { since: Instant },
    Running { start: u64, last_seen: u64, pids: Vec<u32> },
}

struct Entry {
    game_id: String,
    spec: Spec,
    phase: Phase,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RunningEvent {
    game_id: String,
    pid: u32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct EndedEvent {
    game_id: String,
    session: Option<Session>,
}

pub struct Tracker {
    entries: Arc<Mutex<Vec<Entry>>>,
    wake: Mutex<Sender<()>>,
}

struct Proc {
    pid: u32,
    name: String,
    exe: Option<String>,
}

fn refresh(sys: &mut System) -> Vec<Proc> {
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_exe(UpdateKind::OnlyIfNotSet),
    );
    sys.processes()
        .iter()
        .map(|(pid, p)| Proc {
            pid: pid.as_u32(),
            name: p.name().to_string_lossy().into_owned(),
            exe: p.exe().map(|e| e.to_string_lossy().into_owned()),
        })
        .collect()
}

impl Tracker {
    /// Démarre la boucle de suivi globale.
    pub fn start(app: AppHandle) -> Tracker {
        let (tx, rx) = mpsc::channel::<()>();
        let entries: Arc<Mutex<Vec<Entry>>> = Arc::default();
        let shared = entries.clone();
        std::thread::Builder::new()
            .name("hangar-tracker".into())
            .spawn(move || {
                let mut sys = System::new();
                loop {
                    let wait = {
                        let e = shared.lock().unwrap_or_else(|p| p.into_inner());
                        if e.is_empty() {
                            None
                        } else if e.iter().any(|x| matches!(x.phase, Phase::Searching { .. })) {
                            Some(SEARCH_EVERY)
                        } else {
                            Some(FOLLOW_EVERY)
                        }
                    };
                    match wait {
                        None => {
                            if rx.recv().is_err() {
                                return;
                            }
                        }
                        Some(d) => match rx.recv_timeout(d) {
                            Ok(()) | Err(RecvTimeoutError::Timeout) => {}
                            Err(RecvTimeoutError::Disconnected) => return,
                        },
                    }
                    let procs = refresh(&mut sys);
                    let now = now_ms();
                    let mut running = vec![];
                    let mut ended = vec![];
                    {
                        let mut list = shared.lock().unwrap_or_else(|p| p.into_inner());
                        list.retain_mut(|e| {
                            let pids: Vec<u32> = procs
                                .iter()
                                .filter(|p| e.spec.matches(&p.name, p.exe.as_deref()))
                                .map(|p| p.pid)
                                .collect();
                            match &mut e.phase {
                                Phase::Searching { since } => {
                                    if let Some(&pid) = pids.first() {
                                        running.push(RunningEvent { game_id: e.game_id.clone(), pid });
                                        e.phase = Phase::Running { start: now, last_seen: now, pids };
                                        true
                                    } else if since.elapsed() > SEARCH_MAX {
                                        log::info!("suivi : {} jamais détecté, abandon", e.game_id);
                                        ended.push(EndedEvent { game_id: e.game_id.clone(), session: None });
                                        false
                                    } else {
                                        true
                                    }
                                }
                                Phase::Running { start, last_seen, pids: old } => {
                                    if pids.is_empty() {
                                        let session =
                                            Session { game_id: e.game_id.clone(), start: *start, end: *last_seen };
                                        ended.push(EndedEvent { game_id: e.game_id.clone(), session: Some(session) });
                                        false
                                    } else {
                                        *last_seen = now;
                                        *old = pids;
                                        true
                                    }
                                }
                            }
                        });
                    }
                    for r in running {
                        log::info!("suivi : {} en cours (pid {})", r.game_id, r.pid);
                        let _ = app.emit("launch://running", r);
                    }
                    for e in ended {
                        log::info!("suivi : {} terminé", e.game_id);
                        let _ = app.emit("launch://ended", e);
                    }
                }
            })
            .expect("thread de suivi");
        Tracker { entries, wake: Mutex::new(tx) }
    }

    /// Commence à chercher les processus d'un jeu qui vient d'être lancé.
    pub fn track(&self, g: &Game) {
        {
            let mut list = self.entries.lock().unwrap_or_else(|p| p.into_inner());
            if list.iter().any(|e| e.game_id == g.id) {
                return; // déjà suivi (relancé pendant qu'il tourne)
            }
            list.push(Entry {
                game_id: g.id.clone(),
                spec: Spec::from_game(g),
                phase: Phase::Searching { since: Instant::now() },
            });
        }
        let _ = self.wake.lock().unwrap_or_else(|p| p.into_inner()).send(());
    }

    /// Termine proprement le jeu : demande de fermeture, puis arrêt forcé après 4 s.
    pub fn stop(&self, game_id: &str) -> Result<(), String> {
        let (pids, spec) = {
            let list = self.entries.lock().unwrap_or_else(|p| p.into_inner());
            let e = list.iter().find(|e| e.game_id == game_id).ok_or("Ce jeu n'est pas en cours.")?;
            match &e.phase {
                Phase::Running { pids, .. } => (pids.clone(), e.spec.clone()),
                Phase::Searching { .. } => return Err("Le jeu n'a pas encore démarré.".into()),
            }
        };
        std::thread::spawn(move || {
            for pid in &pids {
                request_close(*pid);
            }
            std::thread::sleep(Duration::from_secs(4));
            let mut sys = System::new();
            sys.refresh_processes_specifics(
                ProcessesToUpdate::All,
                true,
                ProcessRefreshKind::nothing().with_exe(UpdateKind::OnlyIfNotSet),
            );
            for pid in pids {
                if let Some(p) = sys.process(Pid::from_u32(pid)) {
                    // Vérifie que le pid n'a pas été réutilisé par un autre programme.
                    let exe = p.exe().map(|e| e.to_string_lossy().into_owned());
                    if spec.matches(&p.name().to_string_lossy(), exe.as_deref()) {
                        log::info!("arrêt forcé du pid {pid}");
                        p.kill();
                    }
                }
            }
        });
        Ok(())
    }
}

/// Demande la fermeture d'un processus (taskkill sans /F, sans fenêtre console).
#[cfg(windows)]
fn request_close(pid: u32) {
    use std::os::windows::process::CommandExt;
    let _ = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string()])
        .creation_flags(crate::launcher::CREATE_NO_WINDOW)
        .output();
}

/// Demande la fermeture d'un processus (SIGTERM, le jeu peut sauvegarder).
#[cfg(not(windows))]
fn request_close(pid: u32) {
    let _ = std::process::Command::new("kill").arg(pid.to_string()).output();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{uri, Launch};

    #[test]
    fn reconnait_par_dossier_et_par_nom() {
        let mut g = Game::new("steam:1".into(), "Jeu".into(), "steam", uri("steam://rungameid/1"));
        g.install_dir = Some(r"C:\Steam\steamapps\common\Jeu".into());
        g.process_names = vec!["JeuLauncher.exe".into()];
        let s = Spec::from_game(&g);
        assert!(s.matches("Jeu-Win64-Shipping.exe", Some(r"c:\steam\steamapps\COMMON\jeu\bin\Jeu-Win64-Shipping.exe")));
        assert!(!s.matches("Jeu2.exe", Some(r"C:\Steam\steamapps\common\Jeu2\Jeu2.exe")));
        assert!(s.matches("jeulauncher.exe", None));
        assert!(!s.matches("steam.exe", Some(r"C:\Steam\steamapps\common\Jeu\steam.exe")));
    }

    #[test]
    fn ignore_le_launcher_du_store() {
        let mut g = Game::new(
            "riot:valorant".into(),
            "VALORANT".into(),
            "riot",
            Launch { kind: "exe".into(), target: r"C:\Riot Games\Riot Client\RiotClientServices.exe".into(), args: String::new(), cwd: None },
        );
        g.install_dir = Some(r"C:\Riot Games".into());
        let s = Spec::from_game(&g);
        assert!(!s.matches("RiotClientServices.exe", Some(r"C:\Riot Games\Riot Client\RiotClientServices.exe")));
        assert!(s.matches("VALORANT.exe", Some(r"C:\Riot Games\VALORANT\live\VALORANT.exe")));
    }

    #[test]
    #[cfg(windows)] // chemin Windows : sous macOS `D:\...` n'a pas de dossier parent
    fn jeu_manuel_sans_dossier_et_racine_refusee() {
        let g = Game::new("manual:x".into(), "X".into(), "manual", crate::model::exe(Path::new(r"D:\Jeux\X\x.exe"), ""));
        let s = Spec::from_game(&g);
        assert!(s.matches("x.exe", Some(r"D:\Jeux\X\x.exe")));
        let mut r = Game::new("local:c".into(), "C".into(), "local", uri("x"));
        r.install_dir = Some(r"C:\".into());
        assert!(!Spec::from_game(&r).matches("explorer.exe", Some(r"C:\Windows\explorer.exe")));
    }
}
