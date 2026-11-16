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
use tauri::{AppHandle, Emitter, Manager, State};

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
    pub cloud: Arc<crate::cloud::Cloud>,
    pub presence: Arc<crate::presence::Presence>,
    /// Fichiers et dossiers choisis par l'utilisateur (voir `state::Granted`).
    pub granted: state::Granted,
}

type Ctxs<'a> = State<'a, Ctx>;

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| format!("Tâche interrompue : {e}"))
}

/// Scan complet en parallèle. Xbox (PowerShell, lent) répond plus tard via `scan://partial`.
#[tauri::command]
pub async fn scan_games(app: AppHandle, ctx: Ctxs<'_>, local_folders: Vec<String>) -> Result<Vec<Game>, String> {
    // Seuls les dossiers que l'utilisateur a choisis lui-même.
    let local_folders: Vec<String> = local_folders.into_iter().filter(|f| ctx.granted.has(f)).collect();
    let mut games = blocking(move || scanner::scan_fast(&local_folders)).await?;
    ctx.accounts.merge_into(&mut games);
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
            let mut xbox = scanner::scan_xbox(&first);
            if let Some(ctx) = tauri::Manager::try_state::<Ctx>(&app2) {
                ctx.accounts.merge_xbox(&mut xbox);
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

/// Connexion GOG / Epic dans une fenêtre de connexion officielle ; Xbox : attend la saisie du
/// code de `xbox_login_code` sur microsoft.com/link. Renvoie le nombre de jeux.
#[tauri::command]
pub async fn connect_account(app: AppHandle, ctx: Ctxs<'_>, store: String) -> Result<usize, String> {
    if store == "steam" || !accounts::CONNECTABLE.contains(&store.as_str()) {
        return Err("Ce launcher ne propose pas de connexion.".into());
    }
    let acc = ctx.accounts.clone();
    let app2 = app.clone();
    let n = blocking(move || {
        if store == "xbox" {
            acc.connect_xbox()
        } else {
            accounts::login(&app2, &store).and_then(|code| acc.finish_login(&store, &code))
        }
    })
    .await??;
    let _ = app.emit("accounts://synced", ());
    Ok(n)
}

/// Xbox : code à saisir sur microsoft.com/link (puis `connect_account("xbox")` attend).
#[tauri::command]
pub async fn xbox_login_code(ctx: Ctxs<'_>) -> Result<accounts::xbox::DeviceCode, String> {
    if !accounts::xbox::available() {
        return Err("La connexion Xbox n'est pas disponible dans cette version de Hangar.".into());
    }
    let acc = ctx.accounts.clone();
    blocking(move || acc.xbox_code()).await?
}

/// Xbox : abandonne l'attente de la connexion.
#[tauri::command]
pub fn xbox_login_cancel() {
    accounts::xbox::cancel();
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

// ─────────────────────────── Compte Hangar ───────────────────────────

#[tauri::command]
pub async fn cloud_status(ctx: Ctxs<'_>) -> Result<crate::cloud::Status, String> {
    let cloud = ctx.cloud.clone();
    blocking(move || cloud.status()).await
}

/// Connexion dans le navigateur ; Hangar revient devant une fois le compte relié.
#[tauri::command]
pub async fn cloud_login(app: AppHandle, ctx: Ctxs<'_>, device_id: String) -> Result<crate::cloud::Status, String> {
    let cloud = ctx.cloud.clone();
    let res = blocking(move || cloud.login(&device_id)).await?;
    if res.is_ok() {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
    res
}

#[tauri::command]
pub fn cloud_cancel_login() {
    crate::cloud::Cloud::cancel_login();
}

#[tauri::command]
pub async fn cloud_logout(ctx: Ctxs<'_>) -> Result<(), String> {
    let cloud = ctx.cloud.clone();
    blocking(move || cloud.logout()).await
}

#[tauri::command]
pub async fn cloud_rename_device(ctx: Ctxs<'_>, id: String, name: String) -> Result<crate::cloud::Status, String> {
    let cloud = ctx.cloud.clone();
    blocking(move || cloud.rename_device(&id, &name)).await?
}

#[tauri::command]
pub async fn cloud_forget_device(ctx: Ctxs<'_>, id: String) -> Result<crate::cloud::Status, String> {
    let cloud = ctx.cloud.clone();
    blocking(move || cloud.forget_device(&id)).await?
}

#[tauri::command]
pub async fn cloud_pull(ctx: Ctxs<'_>, since: u64) -> Result<crate::cloud::Page, String> {
    let cloud = ctx.cloud.clone();
    blocking(move || cloud.pull(since)).await?
}

#[tauri::command]
pub async fn cloud_push(ctx: Ctxs<'_>, changes: Vec<crate::cloud::Change>) -> Result<(), String> {
    let cloud = ctx.cloud.clone();
    blocking(move || cloud.push(changes)).await?
}

#[tauri::command]
pub async fn cloud_pull_sessions(ctx: Ctxs<'_>, since: u64) -> Result<crate::cloud::SessionPage, String> {
    let cloud = ctx.cloud.clone();
    blocking(move || cloud.pull_sessions(since)).await?
}

#[tauri::command]
pub async fn cloud_push_sessions(ctx: Ctxs<'_>, sessions: Vec<crate::cloud::PlaySession>) -> Result<(), String> {
    let cloud = ctx.cloud.clone();
    blocking(move || cloud.push_sessions(sessions)).await?
}

#[tauri::command]
pub async fn cloud_sync_steamgriddb(ctx: Ctxs<'_>, first: bool) -> Result<bool, String> {
    let cloud = ctx.cloud.clone();
    blocking(move || cloud.sync_steamgriddb(first)).await?
}

/// Profil du compte Hangar : nouveau pseudo.
#[tauri::command]
pub async fn cloud_set_profile(ctx: Ctxs<'_>, name: String) -> Result<crate::cloud::Status, String> {
    let cloud = ctx.cloud.clone();
    blocking(move || cloud.set_profile(name)).await?
}

/// Nouvel avatar, déjà réduit par le frontend (carré de 256 px).
#[tauri::command]
pub async fn cloud_set_avatar(ctx: Ctxs<'_>, bytes: Vec<u8>) -> Result<crate::cloud::Status, String> {
    let cloud = ctx.cloud.clone();
    blocking(move || cloud.set_avatar(bytes)).await?
}

#[tauri::command]
pub async fn cloud_remove_avatar(ctx: Ctxs<'_>) -> Result<crate::cloud::Status, String> {
    let cloud = ctx.cloud.clone();
    blocking(move || cloud.remove_avatar()).await?
}

/// Empreinte d'une jaquette en fichier local (aucun réseau). None : elle reste sur ce poste.
#[tauri::command]
pub async fn cloud_cover_hash(ctx: Ctxs<'_>, path: String) -> Result<Option<String>, String> {
    let covers = ctx.paths.covers.clone();
    blocking(move || crate::cloud::Cloud::cover_hash(&covers, &path)).await
}

#[tauri::command]
pub async fn cloud_upload_cover(ctx: Ctxs<'_>, path: String, hash: String) -> Result<bool, String> {
    let (cloud, covers) = (ctx.cloud.clone(), ctx.paths.covers.clone());
    blocking(move || cloud.upload_cover(&covers, &path, &hash)).await?
}

#[tauri::command]
pub async fn cloud_fetch_cover(ctx: Ctxs<'_>, hash: String) -> Result<Option<String>, String> {
    let (cloud, covers) = (ctx.cloud.clone(), ctx.paths.covers.clone());
    blocking(move || cloud.fetch_cover(&covers, &hash)).await?
}

/// Export des données du compte dans un fichier choisi par une boîte d'enregistrement du backend.
/// None : boîte fermée sans choisir.
#[tauri::command]
pub async fn cloud_export(app: AppHandle, ctx: Ctxs<'_>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = blocking(move || {
        let mut d = app
            .dialog()
            .file()
            .set_title("Exporter les données du compte")
            .set_file_name("compte-hangar.json")
            .add_filter("JSON", &["json"]);
        if let Some(w) = app.get_webview_window("main") {
            d = d.set_parent(&w);
        }
        d.blocking_save_file().and_then(|p| p.into_path().ok())
    })
    .await?;
    let Some(path) = path else { return Ok(None) };
    let cloud = ctx.cloud.clone();
    let data = blocking(move || cloud.export()).await??;
    std::fs::write(&path, data).map_err(|_| "Impossible d'écrire le fichier d'export.".to_string())?;
    log::info!("compte Hangar : données exportées");
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Supprime le compte Hangar et tout ce qu'il contient sur le serveur.
#[tauri::command]
pub async fn cloud_delete_account(ctx: Ctxs<'_>) -> Result<(), String> {
    let cloud = ctx.cloud.clone();
    blocking(move || cloud.delete_account()).await?
}

/// Appel de l'API sociale du compte (`/social/*`), avec le jeton du poste.
#[tauri::command]
pub async fn cloud_social(ctx: Ctxs<'_>, method: String, path: String, body: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let cloud = ctx.cloud.clone();
    blocking(move || cloud.social(&method, &path, body)).await?
}

/// Avatar ou bannière d'un autre compte, en `data:` (None : aucun).
#[tauri::command]
pub async fn cloud_social_image(ctx: Ctxs<'_>, kind: String, user_id: String) -> Result<Option<String>, String> {
    let cloud = ctx.cloud.clone();
    blocking(move || cloud.social_image(&kind, &user_id)).await?
}

/// Nouvelle bannière du profil (déjà recadrée par l'app) : rend sa version.
#[tauri::command]
pub async fn cloud_social_banner(ctx: Ctxs<'_>, bytes: Vec<u8>) -> Result<String, String> {
    let cloud = ctx.cloud.clone();
    blocking(move || cloud.social_banner(bytes)).await?
}

/// Ouvre ou ferme la connexion temps réel des amis (évènements `social://event`).
#[tauri::command]
pub fn cloud_live(app: AppHandle, on: bool) {
    crate::cloud::live(app, on);
}

/// Notification du système (nouveau message, demande d'ami), quand Hangar n'est pas au premier plan.
#[tauri::command]
pub fn social_notify(app: AppHandle, title: String, body: String) {
    let title: String = title.chars().take(80).collect();
    let body: String = body.chars().take(200).collect();
    let id = app.config().identifier.clone();
    std::thread::spawn(move || crate::cloud::notify(&id, &title, &body));
}

/// Ouvre une page d'aide connue dans le navigateur (liste fermée, pas d'URL libre).
#[tauri::command]
pub async fn open_link(link: String) -> Result<(), String> {
    let url = match link.as_str() {
        "steam-api-key" => "https://steamcommunity.com/dev/apikey",
        "microsoft-link" => "https://www.microsoft.com/link",
        "steamgriddb-api" => "https://www.steamgriddb.com/profile/preferences/api",
        "privacy" => "https://hangar.pamalstudio.fr/confidentialite.html",
        "gamebar-settings" if cfg!(windows) => "ms-settings:gaming-gamebar",
        _ => return Err("Lien inconnu.".into()),
    };
    blocking(move || launcher::shell_open(url, "", None, "open")).await?
}

/// Ouvre le lien d'installation d'un jeu dans le navigateur de la personne (`https://` seulement).
#[tauri::command]
pub async fn open_game_link(url: String) -> Result<(), String> {
    let url = crate::scanner::links::https(&url).ok_or("Ce lien n'est pas une adresse https valide.")?;
    blocking(move || launcher::shell_open(&url, "", None, "open")).await?
}

/// Le mode manette vient de se fermer : Hangar retourne là où il était si le bouton Xbox
/// l'avait ramené devant (`restore` : fermé par B, Start, Xbox ou Échap).
#[tauri::command]
pub fn pad_back(app: AppHandle, restore: bool) {
    crate::guide::back(&app, restore);
}

/// La Game Bar de Windows s'ouvre avec le bouton Xbox (faux hors Windows).
#[tauri::command]
pub fn game_bar_on_button() -> bool {
    crate::guide::game_bar_on_button()
}

/// Envoie un signalement de bug (titre, description, capture facultative) au développeur.
#[tauri::command]
pub async fn report_bug(ctx: Ctxs<'_>, title: String, description: String, screenshot: Option<String>) -> Result<(), String> {
    if screenshot.as_deref().is_some_and(|s| !ctx.granted.has(s)) {
        return Err("Choisis la capture avec le bouton de la fenêtre.".into());
    }
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

/// Réglages du bureau : fermeture de la fenêtre (`ask`, `tray`, `quit`), raccourci global,
/// bouton de la manette (mode manette activé).
#[tauri::command]
pub fn set_desktop(app: AppHandle, close_action: String, global_shortcut: bool, pad_button: bool) -> DesktopInfo {
    crate::desktop::set_close_mode(crate::desktop::CloseMode::parse(&close_action));
    crate::guide::set_enabled(pad_button);
    DesktopInfo {
        presence_available: !crate::presence::CLIENT_ID.is_empty(),
        shortcut: crate::desktop::SHORTCUT_LABEL,
        shortcut_ok: crate::desktop::set_shortcut(&app, global_shortcut),
    }
}

/// Réponse à la question posée en fermant la fenêtre : quitter Hangar, ou le garder en
/// arrière-plan (fenêtre cachée, icône dans la zone de notification).
#[tauri::command]
pub fn close_main(app: AppHandle, quit: bool) {
    if quit {
        crate::desktop::quit(&app);
    } else {
        crate::desktop::hide_main(&app);
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
pub fn load_state(ctx: Ctxs<'_>) -> Result<serde_json::Value, String> {
    let file = ctx.paths.state_file();
    let mut v = state::load_state(&file)?;
    migrate_grid_key(&file, &mut v);
    ctx.granted.trust_state(&v);
    ctx.known.set_manual_from_state(&v);
    Ok(v)
}

/// Les versions d'avant la 1.2.19 gardaient la clé SteamGridDB en clair dans state.json :
/// elle passe dans le coffre du système et disparaît du fichier (et de sa copie de secours).
fn migrate_grid_key(file: &std::path::Path, v: &mut serde_json::Value) {
    let Some(prefs) = v.get_mut("prefs").and_then(|p| p.as_object_mut()) else { return };
    let Some(key) = prefs.get("steamGridDbKey").and_then(|k| k.as_str()).map(|k| k.trim().to_string()) else { return };
    if !key.is_empty() && crate::accounts::set_steamgriddb_key(&key).is_err() {
        return; // coffre indisponible : on réessaiera au prochain démarrage
    }
    prefs.remove("steamGridDbKey");
    prefs.insert("steamGridDb".into(), (!key.is_empty()).into());
    if let Err(e) = state::save_state(file, v).and_then(|_| state::save_state(&state::state_backup(file), v)) {
        log::warn!("clé SteamGridDB retirée de state.json : enregistrement impossible : {e}");
    }
}

#[tauri::command]
pub fn save_state(ctx: Ctxs<'_>, mut state: serde_json::Value) -> Result<(), String> {
    if !state.is_object() {
        return Err("État invalide.".into());
    }
    ctx.granted.sanitize(&mut state);
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

/// Réponse à une question d'un launcher posée dans l'écran de lancement (`launch://prompt`) :
/// `show` montre sa boîte au-dessus de Hangar, sinon elle est annulée.
#[tauri::command]
pub fn answer_launcher_prompt(hwnd: i64, show: bool) -> Result<(), String> {
    crate::veil::answer(hwnd, show)
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

/// Revient sur un jeu en cours (mode manette) : sa fenêtre passe au premier plan.
#[tauri::command]
pub fn focus_game(ctx: Ctxs<'_>, game_id: String) -> Result<bool, String> {
    ctx.tracker.focus(&game_id)
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

/// Désinstalle un jeu. Steam et Epic (Windows) : Hangar supprime lui-même le dossier du jeu et
/// ses manifestes, avec les garde-fous de `manage.rs`. GOG : désinstalleur silencieux. Les
/// autres : la désinstallation du launcher ou des Applications de Windows. Renvoie le message
/// à afficher.
#[tauri::command]
pub async fn uninstall_game(ctx: Ctxs<'_>, game_id: String) -> Result<String, String> {
    let Some(game) = ctx.known.get(&game_id).filter(|g| !g.not_installed) else {
        return Err("Ce jeu n'est plus dans la bibliothèque. Actualise-la puis réessaie.".into());
    };
    if ctx.tracker.is_tracked(&game_id) {
        return Err("Ferme le jeu avant de le désinstaller.".into());
    }
    let others = ctx.known.install_dirs_except(&game_id);
    let msg = blocking(move || launcher::uninstall(&game, &others)).await??;
    log::info!("désinstallation ouverte : {game_id}");
    Ok(msg)
}

/// Ouvre les mises à jour d'un jeu installé dans son launcher. Renvoie le message à afficher.
#[tauri::command]
pub async fn update_game(ctx: Ctxs<'_>, game_id: String) -> Result<String, String> {
    let Some(game) = ctx.known.get(&game_id).filter(|g| !g.not_installed) else {
        return Err("Ce jeu n'est plus dans la bibliothèque. Actualise-la puis réessaie.".into());
    };
    // Mise à jour reportée par Steam : seul son bouton de téléchargement la lance, on montre sa page.
    let scheduled = cfg!(windows) && game.store == "steam" && game.steam_app_id.is_some_and(crate::manage::steam_update_scheduled);
    if scheduled {
        crate::veil::lift();
        let name = game.name.clone();
        blocking(|| launcher::launch(&crate::model::uri("steam://open/downloads"))).await??;
        log::info!("mise à jour Steam programmée, page des téléchargements ouverte : {game_id}");
        return Ok(format!("Steam a programmé la mise à jour de {name} : clique sur le bouton de téléchargement du jeu dans Steam pour la lancer maintenant."));
    }
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
pub async fn find_artwork(ctx: Ctxs<'_>, game_id: String, refresh: bool) -> Result<Artwork, String> {
    let Some(game) = ctx.known.get(&game_id) else { return Ok(Artwork::default()) };
    let aw = ctx.artwork.clone();
    blocking(move || {
        let key = crate::accounts::steamgriddb_key();
        aw.find(&game, key.as_deref(), refresh)
    })
    .await
}

/// Enregistre la clé API SteamGridDB dans le coffre du système (vide : la retire).
/// Une clé non vide est d'abord essayée sur l'API : refusée (401/403), elle n'est pas gardée.
#[tauri::command]
pub async fn set_steamgriddb_key(ctx: Ctxs<'_>, key: String) -> Result<(), String> {
    let art = ctx.art.clone();
    let cloud = ctx.cloud.clone();
    blocking(move || {
        let k = key.trim();
        if !k.is_empty() && k.chars().all(|c| c.is_ascii_alphanumeric()) {
            let url = "https://www.steamgriddb.com/api/v2/search/autocomplete/portal";
            if let Err(401 | 403) = art.get_json(url, Some(k)) {
                return Err("SteamGridDB ne reconnaît pas cette clé. Recopie-la en entier depuis la page API.".into());
            }
        }
        crate::accounts::set_steamgriddb_key(k)?;
        // Compte Hangar connecté : la clé le suit (chiffrée sur le serveur).
        cloud.share_steamgriddb(k);
        Ok(())
    })
    .await?
}

/// Genre d'un jeu (API appdetails de Steam, en cache). Jamais d'erreur.
#[tauri::command]
pub async fn game_info(ctx: Ctxs<'_>, game_id: String) -> Result<GameInfo, String> {
    let Some(game) = ctx.known.get(&game_id) else { return Ok(GameInfo::default()) };
    let info = ctx.info.clone();
    blocking(move || info.get(&game)).await
}

/// Succès Steam d'un jeu (compte Steam connecté seulement, en cache 1 h). Jamais d'erreur.
#[tauri::command]
pub async fn steam_achievements(ctx: Ctxs<'_>, game_id: String) -> Result<Option<accounts::Achievements>, String> {
    let Some(app_id) = ctx.known.get(&game_id).and_then(|g| g.steam_app_id) else { return Ok(None) };
    let acc = ctx.accounts.clone();
    blocking(move || acc.achievements(app_id)).await
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

/// Mode manette au démarrage du PC : si Hangar vient d'être lancé avec le système
/// (`--hidden`, fenêtre réduite), la fenêtre revient devant et la réponse est vraie, une
/// seule fois par lancement (un rechargement de l'interface ne rouvre rien).
#[tauri::command]
pub fn pad_at_login(app: AppHandle) -> bool {
    use std::sync::atomic::{AtomicBool, Ordering};
    static DONE: AtomicBool = AtomicBool::new(false);
    let at_login = std::env::args().any(|a| a == "--hidden");
    if !at_login || DONE.swap(true, Ordering::Relaxed) {
        return false;
    }
    crate::desktop::show_main(&app);
    true
}

#[tauri::command]
pub async fn import_cover(ctx: Ctxs<'_>, game_id: String, path: String) -> Result<String, String> {
    if !ctx.granted.has(&path) {
        return Err("Choisis l'image avec le bouton de la fenêtre.".into());
    }
    let covers = ctx.paths.covers.clone();
    blocking(move || art::import_cover(&covers, &game_id, &path).map(|p| p.to_string_lossy().into_owned())).await?
}

/// Boîte de choix d'un fichier ou d'un dossier, ouverte par le backend : ce qui y est choisi
/// devient un chemin autorisé (`state::Granted`). Le frontend n'a pas accès aux boîtes de
/// choix lui-même.
async fn pick(app: AppHandle, ctx: Ctxs<'_>, title: &'static str, filter: Option<(&'static str, &'static [&'static str])>, folder: bool) -> Result<Option<String>, String> {
    use tauri::Manager;
    use tauri_plugin_dialog::DialogExt;
    let path = blocking(move || {
        let mut d = app.dialog().file().set_title(title);
        if let Some(w) = app.get_webview_window("main") {
            d = d.set_parent(&w);
        }
        if let Some((name, ext)) = filter {
            d = d.add_filter(name, ext);
        }
        let picked = if folder { d.blocking_pick_folder() } else { d.blocking_pick_file() };
        picked.and_then(|p| p.into_path().ok()).map(|p| p.to_string_lossy().into_owned())
    })
    .await?;
    let Some(path) = path else { return Ok(None) };
    if !state::local_path(&path) {
        return Err("Choisis un fichier sur ce PC (pas sur un partage réseau).".into());
    }
    ctx.granted.add(&path);
    Ok(Some(path))
}

#[tauri::command]
pub async fn pick_exe(app: AppHandle, ctx: Ctxs<'_>) -> Result<Option<String>, String> {
    // Linux : les binaires des jeux n'ont souvent pas d'extension, pas de filtre.
    let filter: Option<(&str, &[&str])> =
        (!cfg!(target_os = "linux")).then_some(("Jeux et raccourcis", &["exe", "lnk", "url", "bat", "app"]));
    pick(app, ctx, "Choisir le jeu", filter, false).await
}

#[tauri::command]
pub async fn pick_folder(app: AppHandle, ctx: Ctxs<'_>) -> Result<Option<String>, String> {
    pick(app, ctx, "Choisir un dossier de jeux", None, true).await
}

#[tauri::command]
pub async fn pick_image(app: AppHandle, ctx: Ctxs<'_>) -> Result<Option<String>, String> {
    pick(app, ctx, "Choisir une image", Some(("Images", &["jpg", "jpeg", "png", "webp"])), false).await
}
