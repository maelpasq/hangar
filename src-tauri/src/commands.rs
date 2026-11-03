//! Commandes Tauri : fines, elles délèguent aux modules.

use crate::art::{self, Art, SteamHit};
use crate::model::Game;
use crate::size::Sizes;
use crate::state::{self, Known, Paths};
use crate::tracker::Tracker;
use crate::{launcher, scanner};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

/// État partagé du backend.
pub struct Ctx {
    pub paths: Paths,
    pub known: Known,
    pub tracker: Tracker,
    pub art: Arc<Art>,
    pub sizes: Arc<Sizes>,
    pub xbox_busy: Arc<AtomicBool>,
}

type Ctxs<'a> = State<'a, Ctx>;

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| format!("Tâche interrompue : {e}"))
}

/// Scan complet en parallèle. Xbox (PowerShell, lent) répond plus tard via `scan://partial`.
#[tauri::command]
pub async fn scan_games(app: AppHandle, ctx: Ctxs<'_>, local_folders: Vec<String>) -> Result<Vec<Game>, String> {
    let games = blocking(move || scanner::scan_fast(&local_folders)).await?;
    ctx.known.replace_scanned(&games);

    if !ctx.xbox_busy.swap(true, Ordering::SeqCst) {
        let busy = ctx.xbox_busy.clone();
        let first = games.clone();
        let app2 = app.clone();
        std::thread::spawn(move || {
            let xbox = scanner::scan_xbox(&first);
            if let Some(ctx) = tauri::Manager::try_state::<Ctx>(&app2) {
                ctx.known.add_scanned(&xbox);
            }
            let _ = app2.emit("scan://partial", xbox);
            busy.store(false, Ordering::SeqCst);
        });
    }
    Ok(games)
}

#[tauri::command]
pub fn load_state(ctx: Ctxs<'_>) -> serde_json::Value {
    let v = state::load_state(&ctx.paths.state_file());
    ctx.known.set_manual_from_state(&v);
    v
}

#[tauri::command]
pub fn save_state(ctx: Ctxs<'_>, state: serde_json::Value) -> Result<(), String> {
    if !state.is_object() {
        return Err("État invalide.".into());
    }
    ctx.known.set_manual_from_state(&state);
    state::save_state(&ctx.paths.state_file(), &state)
}

#[tauri::command]
pub fn load_library(ctx: Ctxs<'_>) -> Vec<Game> {
    let games = state::load_library(&ctx.paths.library_file());
    ctx.known.add_scanned(&games);
    games
}

#[tauri::command]
pub fn save_library(ctx: Ctxs<'_>, games: Vec<Game>) -> Result<(), String> {
    // Seuls les jeux connus du backend sont mis en cache.
    let games: Vec<Game> = games.into_iter().filter_map(|g| ctx.known.get(&g.id)).collect();
    state::save_library(&ctx.paths.library_file(), &games)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GameEvent {
    game_id: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FailedEvent {
    game_id: String,
    message: String,
}

/// Lance un jeu connu. Le résultat arrive par les événements `launch://*`
/// (un échec émet `launch://failed`, la commande elle-même réussit).
#[tauri::command]
pub async fn launch_game(app: AppHandle, ctx: Ctxs<'_>, game_id: String) -> Result<(), String> {
    let fail = |message: String| {
        log::warn!("lancement de {game_id} impossible : {message}");
        let _ = app.emit("launch://failed", FailedEvent { game_id: game_id.clone(), message });
    };
    let Some(game) = ctx.known.get(&game_id) else {
        fail("Ce jeu n'est plus dans la bibliothèque. Actualise-la puis réessaie.".into());
        return Ok(());
    };
    let launch = game.launch.clone();
    match blocking(move || launcher::launch(&launch)).await? {
        Ok(()) => {
            log::info!("lancé : {} ({})", game.name, game.id);
            let _ = app.emit("launch://started", GameEvent { game_id: game.id.clone() });
            ctx.tracker.track(&game);
        }
        Err(m) => fail(m),
    }
    Ok(())
}

#[tauri::command]
pub fn stop_game(ctx: Ctxs<'_>, game_id: String) -> Result<(), String> {
    ctx.tracker.stop(&game_id)
}

#[tauri::command]
pub async fn open_folder(path: String) -> Result<(), String> {
    blocking(move || launcher::open_folder(&path)).await?
}

#[tauri::command]
pub async fn resolve_steam_id(ctx: Ctxs<'_>, name: String) -> Result<Option<u32>, String> {
    let art = ctx.art.clone();
    blocking(move || art.resolve_steam_id(&name)).await
}

#[tauri::command]
pub async fn search_steam(ctx: Ctxs<'_>, query: String) -> Result<Vec<SteamHit>, String> {
    let art = ctx.art.clone();
    blocking(move || art.search_steam(&query)).await
}

#[tauri::command]
pub async fn image(ctx: Ctxs<'_>, url: String) -> Result<Option<String>, String> {
    let art = ctx.art.clone();
    blocking(move || art.image(&url).map(|p| p.to_string_lossy().into_owned())).await
}

#[tauri::command]
pub async fn exe_icon(ctx: Ctxs<'_>, path: String) -> Result<Option<String>, String> {
    let art = ctx.art.clone();
    blocking(move || art.exe_icon(&path).map(|p| p.to_string_lossy().into_owned())).await
}

#[tauri::command]
pub async fn folder_size(ctx: Ctxs<'_>, path: String) -> Result<Option<u64>, String> {
    let sizes = ctx.sizes.clone();
    blocking(move || sizes.get(&path)).await
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, on: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let al = app.autolaunch();
    let r = if on { al.enable() } else { al.disable() };
    r.map_err(|e| format!("Impossible de modifier le démarrage avec Windows : {e}"))
}

#[tauri::command]
pub async fn import_cover(ctx: Ctxs<'_>, game_id: String, path: String) -> Result<String, String> {
    let covers = ctx.paths.covers.clone();
    blocking(move || art::import_cover(&covers, &game_id, &path).map(|p| p.to_string_lossy().into_owned())).await?
}
