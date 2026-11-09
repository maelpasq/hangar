//! Commandes Tauri : fines, elles délèguent aux modules.

use crate::accounts::{self, Accounts};
use crate::art::{self, Art, SteamHit};
use crate::artwork::{Artwork, Artworks};
use crate::info::{GameInfo, Infos};
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
    pub artwork: Arc<Artworks>,
    pub info: Arc<Infos>,
    pub sizes: Arc<Sizes>,
    pub xbox_busy: Arc<AtomicBool>,
    pub accounts: Arc<Accounts>,
    pub presence: Arc<crate::presence::Presence>,
}

type Ctxs<'a> = State<'a, Ctx>;

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| format!("Tâche interrompue : {e}"))
}

/// Scan complet en parallèle. Xbox (PowerShell, lent) répond plus tard via `scan://partial`.
#[tauri::command]
pub async fn scan_games(app: AppHandle, ctx: Ctxs<'_>, local_folders: Vec<String>) -> Result<Vec<Game>, String> {
    let mut games = blocking(move || scanner::scan_fast(&local_folders)).await?;
    // Tant que Mojang n'a pas validé Hangar MC, personne ne garde le mod (dès le démarrage).
    if !accounts::microsoft::available() {
        let mc = minecraft(&ctx);
        std::thread::spawn(move || mc.remove_pack());
    }
    accounts::merge(&mut games, ctx.accounts.games());
    if cfg!(target_os = "linux") {
        games = blocking(move || {
            scanner::steam::mark_linux(&mut games);
            games
        })
        .await?;
    }
    ctx.accounts.apply_updates(&mut games);
    simulate_updates(&app, &mut games);
    ctx.known.replace_scanned(&games);
    if ctx.accounts.stale() {
        sync_in_background(&app, ctx.accounts.clone());
    }
    if ctx.accounts.gog_stale(&games) {
        let (app, accounts, list) = (app.clone(), ctx.accounts.clone(), games.clone());
        std::thread::spawn(move || {
            // Même événement que la synchro des comptes : le frontend rescanne.
            if accounts.check_gog(&list) {
                let _ = app.emit("accounts://synced", ());
            }
        });
    }

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

/// Hangar Test seulement, lancé avec `HANGAR_SIMULATE_UPDATES=1` : marque trois jeux installés
/// comme ayant une mise à jour, pour voir l'interface sans toucher aux fichiers des launchers.
fn simulate_updates(app: &AppHandle, games: &mut [Game]) {
    if !app.config().identifier.ends_with(".test") || std::env::var_os("HANGAR_SIMULATE_UPDATES").is_none() {
        return;
    }
    let sizes = [2_400_000_000, 850_000_000, 120_000_000];
    // Jeux d'un launcher qui a un écran de mises à jour : le bouton « Mettre à jour » y mène.
    let stores = ["steam", "epic", "gog", "xbox"];
    for (g, size) in games.iter_mut().filter(|g| !g.not_installed && stores.contains(&g.store.as_str())).zip(sizes) {
        g.update_pending = true;
        g.update_bytes = Some(size);
    }
}

/// Resynchronise les comptes puis prévient le frontend (`accounts://synced`), qui rescanne.
fn sync_in_background(app: &AppHandle, accounts: Arc<Accounts>) {
    let app = app.clone();
    std::thread::spawn(move || {
        if accounts.sync_all() {
            let _ = app.emit("accounts://synced", ());
        }
    });
}

/// État des launchers : détecté sur l'appareil, compte connecté (jamais de jeton).
#[tauri::command]
pub fn accounts_status(ctx: Ctxs<'_>) -> Vec<accounts::Status> {
    ctx.accounts.status()
}

/// Connecte Steam avec la clé d'API Web de l'utilisateur. Renvoie le nombre de jeux trouvés.
#[tauri::command]
pub async fn connect_steam(app: AppHandle, ctx: Ctxs<'_>, key: String) -> Result<usize, String> {
    let acc = ctx.accounts.clone();
    let n = blocking(move || acc.connect_steam(&key)).await??;
    let _ = app.emit("accounts://synced", ());
    Ok(n)
}

/// Connexion GOG / Epic dans une fenêtre de connexion officielle. Renvoie le nombre de jeux.
#[tauri::command]
pub async fn connect_account(app: AppHandle, ctx: Ctxs<'_>, store: String) -> Result<usize, String> {
    if store != "gog" && store != "epic" {
        return Err("Ce launcher ne propose pas de connexion.".into());
    }
    let acc = ctx.accounts.clone();
    let app2 = app.clone();
    let n = blocking(move || accounts::login(&app2, &store).and_then(|code| acc.finish_login(&store, &code))).await??;
    let _ = app.emit("accounts://synced", ());
    Ok(n)
}

#[tauri::command]
pub async fn disconnect_account(app: AppHandle, ctx: Ctxs<'_>, store: String) -> Result<(), String> {
    if !accounts::CONNECTABLE.contains(&store.as_str()) {
        return Err("Ce launcher ne propose pas de connexion.".into());
    }
    let acc = ctx.accounts.clone();
    blocking(move || acc.disconnect(&store)).await?;
    let _ = app.emit("accounts://synced", ());
    Ok(())
}

/// Ouvre une page d'aide connue dans le navigateur (liste fermée, pas d'URL libre).
#[tauri::command]
pub async fn open_link(link: String) -> Result<(), String> {
    let url = match link.as_str() {
        "steam-api-key" => "https://steamcommunity.com/dev/apikey",
        "microsoft-link" => "https://www.microsoft.com/link",
        _ => return Err("Lien inconnu.".into()),
    };
    blocking(move || launcher::shell_open(url, "", None, "open")).await?
}

/// Envoie un signalement de bug (titre, description, capture facultative) au développeur.
#[tauri::command]
pub async fn report_bug(title: String, description: String, screenshot: Option<String>) -> Result<(), String> {
    blocking(move || crate::report::send(&title, &description, screenshot.as_deref())).await?
}

/// Asynchrone : créer une fenêtre depuis une commande synchrone peut bloquer sous Windows.
#[tauri::command]
pub async fn open_web_game(app: AppHandle, id: String) -> Result<(), String> {
    crate::webgames::open(&app, &id)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopInfo {
    /// Discord Rich Presence possible (application Discord configurée dans cette version).
    presence_available: bool,
    shortcut: &'static str,
    /// Faux si un autre programme utilise déjà le raccourci.
    shortcut_ok: bool,
}

/// Réglages du bureau : fermeture dans la zone de notification, raccourci global.
#[tauri::command]
pub fn set_desktop(app: AppHandle, close_to_tray: bool, global_shortcut: bool) -> DesktopInfo {
    crate::desktop::set_close_to_tray(close_to_tray);
    DesktopInfo {
        presence_available: !crate::presence::CLIENT_ID.is_empty(),
        shortcut: crate::desktop::SHORTCUT_LABEL,
        shortcut_ok: crate::desktop::set_shortcut(&app, global_shortcut),
    }
}

/// Jeux récents du menu de l'icône (seulement des jeux connus) et apparence de l'app.
#[tauri::command]
pub fn set_tray_recents(
    app: AppHandle,
    ctx: Ctxs<'_>,
    games: Vec<crate::desktop::TrayGame>,
    theme: String,
    accent: String,
) {
    let games = games.into_iter().filter(|g| ctx.known.get(&g.id).is_some()).collect();
    crate::desktop::set_recents(&app, games, theme, accent);
}

/// Contenu du menu Hangar de l'icône (demandé par sa fenêtre).
#[tauri::command]
pub fn tray_state() -> crate::desktop::TrayState {
    crate::desktop::state()
}

/// Action du menu Hangar : `show`, `quit`, `hide` ou `game:<id>` d'un jeu connu.
#[tauri::command]
pub fn tray_action(app: AppHandle, ctx: Ctxs<'_>, action: String) -> Result<(), String> {
    let ok = matches!(action.as_str(), "show" | "quit" | "hide")
        || action.strip_prefix("game:").is_some_and(|id| ctx.known.get(id).is_some());
    if !ok {
        return Err("Action inconnue.".into());
    }
    crate::desktop::run_action(&app, &action);
    Ok(())
}

/// Discord : affiche le jeu connu `game_id` (début `start` en ms), ou efface (`None`).
#[tauri::command]
pub async fn set_presence(ctx: Ctxs<'_>, game_id: Option<String>, start: u64) -> Result<(), String> {
    // (nom, jaquette) : jeu web `web:<id>` du catalogue, ou jeu connu de la bibliothèque avec la
    // jaquette affichée dans Hangar (toutes sources), sinon le portrait Steam de l'appid natif.
    let game = match game_id.as_deref().and_then(|id| id.strip_prefix("web:")) {
        Some(web) => crate::webgames::presence(web),
        None => game_id.and_then(|id| ctx.known.get(&id)).map(|g| {
            let cover = ctx.artwork.cover_url(&g.id).or_else(|| {
                g.steam_app_id
                    .map(|id| format!("https://shared.steamstatic.com/store_item_assets/steam/apps/{id}/library_600x900.jpg"))
            });
            (g.name, cover)
        }),
    };
    let p = ctx.presence.clone();
    blocking(move || p.set(game.as_ref().map(|(name, cover)| (name.as_str(), start, cover.as_deref())))).await
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
            crate::veil::cover();
            ctx.tracker.track(&game);
        }
        Err(m) => fail(m),
    }
    Ok(())
}

/// Installe un jeu possédé : Steam en arrière-plan par Hangar (Windows), les autres dans leur
/// launcher. Renvoie le message à afficher.
#[tauri::command]
pub async fn install_game(ctx: Ctxs<'_>, game_id: String, dir: Option<String>) -> Result<String, String> {
    let Some(game) = ctx.known.get(&game_id).filter(|g| g.not_installed) else {
        return Err("Ce jeu n'est plus à installer. Actualise la bibliothèque puis réessaie.".into());
    };
    log::info!("installation demandée : {} ({})", game.name, game.id);
    if cfg!(windows) && (game.store == "steam" || game.store == "epic") {
        return blocking(move || {
            // Dossier venu du frontend : seulement l'un de ceux que Hangar a proposés.
            let dir = dir.map(|d| crate::manage::checked_target(&game, &d)).transpose()?;
            if game.store == "steam" {
                crate::manage::steam_install(&game, dir)
            } else {
                crate::manage::epic_install(&game, dir)
            }
        })
        .await?;
    }
    let msg = format!("Installation de {} ouverte dans {}", game.name, game.launcher_name);
    let launch = game.launch.clone();
    blocking(move || launcher::launch(&launch)).await??;
    Ok(msg)
}

/// Dossiers du launcher où installer le jeu (vide : le launcher choisit lui-même).
#[tauri::command]
pub async fn install_targets(ctx: Ctxs<'_>, game_id: String) -> Result<Vec<crate::manage::InstallTarget>, String> {
    let Some(game) = ctx.known.get(&game_id).filter(|g| g.not_installed) else { return Ok(vec![]) };
    blocking(move || crate::manage::install_targets(&game)).await
}

/// Progression (0 à 1) de l'installation ou de la mise à jour d'un jeu Steam ; `None` une fois finie.
#[tauri::command]
pub async fn install_progress(ctx: Ctxs<'_>, game_id: String) -> Result<Option<(f64, bool)>, String> {
    let id = ctx.known.get(&game_id).and_then(|g| g.steam_app_id);
    Ok(match id {
        Some(id) => blocking(move || crate::manage::steam_progress(id)).await?,
        None => None,
    })
}

/// Jeux Steam que Steam est en train de télécharger, pour reprendre leur suivi au démarrage.
#[tauri::command]
pub async fn steam_downloads() -> Result<Vec<String>, String> {
    blocking(|| crate::manage::steam_downloading().into_iter().map(|id| format!("steam:{id}")).collect()).await
}

/// Steam ne laisse pas une autre app piloter ses téléchargements : on affiche sa page des
/// téléchargements (pause, reprise, annulation), fenêtre visible.
#[tauri::command]
pub async fn show_steam_downloads() -> Result<(), String> {
    crate::veil::lift();
    blocking(|| launcher::launch(&crate::model::uri("steam://open/downloads"))).await?
}

/// Réaffiche les fenêtres de launcher cachées pendant un lancement ou une mise à jour.
#[tauri::command]
pub fn show_launchers() -> bool {
    crate::veil::lift()
}

#[tauri::command]
pub fn stop_game(ctx: Ctxs<'_>, game_id: String) -> Result<(), String> {
    ctx.tracker.stop(&game_id)
}

/// Chemin reçu du frontend : seulement ceux des jeux connus.
fn known_path(ctx: &Ctx, path: &str) -> Result<(), String> {
    if ctx.known.knows_path(path) {
        Ok(())
    } else {
        log::warn!("chemin refusé (aucun jeu connu)");
        Err("Ce dossier n'appartient à aucun jeu de la bibliothèque.".into())
    }
}

#[tauri::command]
pub async fn open_folder(ctx: Ctxs<'_>, path: String) -> Result<(), String> {
    known_path(&ctx, &path)?;
    blocking(move || launcher::open_folder(&path)).await?
}

/// Ouvre la désinstallation d'un jeu installé dans son launcher (ou les Applications de
/// Windows). Hangar ne supprime rien lui-même. Renvoie le message à afficher.
#[tauri::command]
pub async fn uninstall_game(ctx: Ctxs<'_>, game_id: String) -> Result<String, String> {
    let Some(game) = ctx.known.get(&game_id).filter(|g| !g.not_installed) else {
        return Err("Ce jeu n'est plus dans la bibliothèque. Actualise-la puis réessaie.".into());
    };
    if ctx.tracker.is_tracked(&game_id) {
        return Err("Ferme le jeu avant de le désinstaller.".into());
    }
    let msg = blocking(move || launcher::uninstall(&game)).await??;
    log::info!("désinstallation ouverte : {game_id}");
    Ok(msg)
}

/// Ouvre les mises à jour d'un jeu installé dans son launcher. Renvoie le message à afficher.
#[tauri::command]
pub async fn update_game(ctx: Ctxs<'_>, game_id: String) -> Result<String, String> {
    let Some(game) = ctx.known.get(&game_id).filter(|g| !g.not_installed) else {
        return Err("Ce jeu n'est plus dans la bibliothèque. Actualise-la puis réessaie.".into());
    };
    let msg = blocking(move || launcher::update(&game)).await??;
    crate::veil::cover();
    log::info!("mises à jour ouvertes : {game_id}");
    Ok(msg)
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

/// Jaquette et bannière d'un jeu connu, trouvées automatiquement (jamais d'erreur : vide si rien).
#[tauri::command]
pub async fn find_artwork(
    ctx: Ctxs<'_>,
    game_id: String,
    steam_grid_key: Option<String>,
    refresh: bool,
) -> Result<Artwork, String> {
    let Some(game) = ctx.known.get(&game_id) else { return Ok(Artwork::default()) };
    let aw = ctx.artwork.clone();
    blocking(move || aw.find(&game, steam_grid_key.as_deref(), refresh)).await
}

/// Genre d'un jeu (API appdetails de Steam, en cache). Jamais d'erreur.
#[tauri::command]
pub async fn game_info(ctx: Ctxs<'_>, game_id: String) -> Result<GameInfo, String> {
    let Some(game) = ctx.known.get(&game_id) else { return Ok(GameInfo::default()) };
    let info = ctx.info.clone();
    blocking(move || info.get(&game)).await
}

#[tauri::command]
pub async fn exe_icon(ctx: Ctxs<'_>, path: String) -> Result<Option<String>, String> {
    if known_path(&ctx, &path).is_err() {
        return Ok(None);
    }
    let art = ctx.art.clone();
    blocking(move || art.exe_icon(&path).map(|p| p.to_string_lossy().into_owned())).await
}

#[tauri::command]
pub async fn folder_size(ctx: Ctxs<'_>, path: String) -> Result<Option<u64>, String> {
    if known_path(&ctx, &path).is_err() {
        return Ok(None);
    }
    let sizes = ctx.sizes.clone();
    blocking(move || sizes.get(&path)).await
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, on: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let al = app.autolaunch();
    let r = if on { al.enable() } else { al.disable() };
    r.map_err(|e| format!("Impossible de modifier le démarrage automatique : {e}"))
}

#[tauri::command]
pub async fn import_cover(ctx: Ctxs<'_>, game_id: String, path: String) -> Result<String, String> {
    let covers = ctx.paths.covers.clone();
    blocking(move || art::import_cover(&covers, &game_id, &path).map(|p| p.to_string_lossy().into_owned())).await?
}

/// Hangar MC : `%APPDATA%\.hangarmc` à côté du `.minecraft` officiel (Mac : `hangarmc` à côté
/// de `minecraft` dans Application Support). Hangar Test a son propre dossier `-test`.
fn minecraft(ctx: &Ctx) -> crate::minecraft::Mc {
    let test = ctx.paths.config.extension().is_some_and(|e| e == "test");
    let name = format!("{}hangarmc{}", if cfg!(target_os = "macos") { "" } else { "." }, if test { "-test" } else { "" });
    // config = <APPDATA ou Application Support>/studio.pamal.hangar : son parent est ce dossier.
    crate::minecraft::Mc::new(ctx.paths.config.parent().unwrap_or(&ctx.paths.config).join(name))
}

#[tauri::command]
pub async fn mc_versions(ctx: Ctxs<'_>) -> Result<Vec<crate::minecraft::McVersion>, String> {
    let mc = minecraft(&ctx);
    blocking(move || mc.versions()).await?
}

/// Fichiers de Hangar MC (le mod) : "absent", "ok" ou "outdated".
#[tauri::command]
pub async fn mc_pack(ctx: Ctxs<'_>) -> Result<&'static str, String> {
    let mc = minecraft(&ctx);
    blocking(move || match mc.pack() {
        None => "absent",
        Some(true) => "ok",
        Some(false) => "outdated",
    })
    .await
}

/// Télécharge les fichiers de Hangar MC ; l'avancement arrive par `mc://progress` (version `hangarmc`).
#[tauri::command]
pub async fn mc_pack_install(app: AppHandle, ctx: Ctxs<'_>) -> Result<(), String> {
    if !crate::accounts::microsoft::available() {
        return Err("Hangar MC arrive bientôt : Mojang doit d'abord valider l'application.".into());
    }
    let mc = minecraft(&ctx);
    blocking(move || {
        mc.install_pack(&|done, total| {
            let p = crate::minecraft::Progress { version: "hangarmc".into(), step: "Hangar MC", done, total };
            let _ = app.emit("mc://progress", p);
        })
    })
    .await?
}

/// Installe une version ; l'avancement arrive par `mc://progress`.
#[tauri::command]
pub async fn mc_install(app: AppHandle, ctx: Ctxs<'_>, id: String) -> Result<(), String> {
    let mc = minecraft(&ctx);
    blocking(move || {
        mc.install(&id, &|p| {
            let _ = app.emit("mc://progress", p);
        })
    })
    .await?
}

/// Rafraîchit la session Microsoft puis lance la version installée `id`.
#[tauri::command]
pub async fn mc_launch(ctx: Ctxs<'_>, id: String) -> Result<(), String> {
    let mc = minecraft(&ctx);
    blocking(move || {
        let s = crate::accounts::microsoft::session()?;
        let profile = crate::minecraft::Profile { name: s.name, uuid: s.uuid, token: s.token, xuid: s.xuid };
        mc.launch(&id, &profile).map(|_| ())
    })
    .await?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McAccount {
    /// Connexion possible dans cette version (application Azure approuvée par Mojang).
    available: bool,
    accounts: Vec<crate::accounts::microsoft::Account>,
    /// UUID du compte qui joue.
    active: Option<String>,
}

#[tauri::command]
pub async fn mc_account() -> Result<McAccount, String> {
    let (accounts, active) = blocking(crate::accounts::microsoft::accounts).await?;
    Ok(McAccount { available: crate::accounts::microsoft::available(), accounts, active })
}

/// Choisit le compte qui jouera.
#[tauri::command]
pub async fn mc_select(uuid: String) -> Result<(), String> {
    blocking(move || crate::accounts::microsoft::select(&uuid)).await?
}

/// Abandonne la connexion en cours.
#[tauri::command]
pub fn mc_login_cancel() {
    crate::accounts::microsoft::cancel();
}

/// Code à saisir sur microsoft.com/link ; `mc_login_finish` attend ensuite la saisie.
#[tauri::command]
pub async fn mc_login_start() -> Result<crate::accounts::microsoft::DeviceCode, String> {
    blocking(crate::accounts::microsoft::start).await?
}

#[tauri::command]
pub async fn mc_login_finish() -> Result<String, String> {
    blocking(crate::accounts::microsoft::finish).await?
}

#[tauri::command]
pub async fn mc_logout(uuid: String) -> Result<(), String> {
    blocking(move || crate::accounts::microsoft::logout(&uuid)).await?
}
