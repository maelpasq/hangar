#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// Hors Windows, les parseurs des stores Windows restent compilés (et testés) sans être appelés.
#![cfg_attr(not(windows), allow(dead_code))]

mod accounts;
mod art;
mod artwork;
mod cloud;
mod commands;
mod desktop;
mod guide;
mod info;
mod launcher;
mod manage;
mod model;
mod presence;
mod report;
mod scanner;
mod size;
mod state;
mod tracker;
mod veil;
mod webgames;

use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_window_state::StateFlags;

fn main() {
    // Linux avec le pilote NVIDIA : le rendu DMA-BUF de WebKitGTK rend l'app très lente (ou
    // blanche). Désactivé avant la création de la fenêtre, sauf si l'utilisateur l'a réglé.
    if cfg!(target_os = "linux")
        && std::path::Path::new("/proc/driver/nvidia/version").exists()
        && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    let context = tauri::generate_context!();
    // Environnement de test (`npm run dev`, tauri.test.conf.json) : identité, dossiers, coffre et
    // démarrage avec le système à part, sans mise à jour automatique (elle installerait la
    // vraie version par-dessus l'app de l'utilisateur).
    let test_env = context.config().identifier.ends_with(".test");
    // Nom de l'environnement : titre de la fenêtre et coffre à part.
    let env_name = if test_env { "Hangar Test" } else { "Hangar" };
    // Le coffre est fixé une seule fois (le premier nom gagne) : ici, avant le setup.
    accounts::set_vault(env_name);
    let builder = tauri::Builder::default()
        // Doit être enregistré en premier : une 2e instance ramène la fenêtre existante.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::LogDir { file_name: Some("hangar".into()) }),
                    Target::new(TargetKind::Stdout),
                ])
                .level(log::LevelFilter::Info)
                // Les journaux de débogage du client HTTP contiennent les URL (clé Steam) : jamais écrits.
                .level_for("ureq", log::LevelFilter::Warn)
                .level_for("rustls", log::LevelFilter::Warn)
                .max_file_size(2_000_000)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        // Le cadre vient de la config (natif sur macOS), jamais de l'état mémorisé d'une ancienne
        // version. Le plein écran (mode manette) n'est jamais rouvert au lancement suivant.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() - StateFlags::DECORATIONS - StateFlags::FULLSCREEN)
                // Le menu de l'icône est placé à chaque ouverture, jamais rouvert au démarrage.
                .with_denylist(&["tray"])
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .plugin(desktop::shortcut_plugin())
        // Fermer la fenêtre principale : question, zone de notification ou quitter (réglage).
        .on_window_event(|w, e| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                desktop::on_close_requested(w, api);
            }
        })
        ;
    let builder = if test_env { builder } else { builder.plugin(tauri_plugin_updater::Builder::new().build()) };
    builder
        .setup(move |app| {
            // Compte Hangar : Hangar Test parle à son propre serveur.
            cloud::set_test_env(test_env);
            veil::init(app.handle().clone());
            accounts::set_vault(if test_env { "Hangar Test" } else { "Hangar" });
            if test_env {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.set_title(env_name);
                }
                log::info!("environnement de test : données à part, mises à jour désactivées");
            }
            // Version Linux désactivée (trop de bugs, à refaire) : l'interface n'affiche qu'un
            // écran de blocage (LinuxBlocked.svelte), qui garde la recherche de mise à jour pour
            // recevoir la future version. Rien d'autre ne démarre : pas de scan, pas d'icône,
            // fermer la fenêtre quitte et Hangar ne se lance plus avec le système.
            if cfg!(target_os = "linux") {
                use tauri_plugin_autostart::ManagerExt;
                if let Err(e) = app.autolaunch().disable() {
                    log::warn!("démarrage automatique : {e}");
                }
                desktop::set_close_mode(desktop::CloseMode::Quit);
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.unminimize();
                    let _ = w.show();
                }
                log::info!("Hangar {} : version Linux désactivée", app.package_info().version);
                return Ok(());
            }
            let p = app.path();
            let config = p.app_config_dir()?;
            let paths = state::Paths {
                covers: p.app_data_dir()?.join("covers"),
                cache: p.app_local_data_dir()?.join("cache"),
                config,
            };
            for d in [&paths.config, &paths.covers, &paths.cache] {
                if let Err(e) = std::fs::create_dir_all(d) {
                    log::error!("dossier {} : {e}", d.display());
                }
            }
            // La portée du protocole `asset:` est calculée avant la création de ces dossiers :
            // au tout premier lancement elle ne les couvre pas (jaquettes vides jusqu'au
            // redémarrage). On les autorise une fois créés.
            for d in [&paths.covers, &paths.cache] {
                if let Err(e) = app.asset_protocol_scope().allow_directory(d, true) {
                    log::error!("images de {} : {e}", d.display());
                }
            }
            let art = Arc::new(art::Art::new(&paths.cache));
            let artworks = Arc::new(artwork::Artworks::new(art.clone(), &paths.cache));
            let accounts = Arc::new(accounts::Accounts::new(&paths.config));
            let cloud = Arc::new(cloud::Cloud::new(&paths.config));
            // Connexions des launchers partagées par le compte Hangar.
            accounts.set_shared(cloud.clone());
            let ctx = commands::Ctx {
                info: Arc::new(info::Infos::new(art.clone(), artworks.clone(), &paths.cache)),
                artwork: artworks,
                art,
                sizes: Arc::new(size::Sizes::new(&paths.cache)),
                tracker: tracker::Tracker::start(app.handle().clone()),
                known: state::Known::default(),
                xbox_busy: Arc::new(AtomicBool::new(false)),
                accounts,
                cloud,
                presence: Arc::default(),
                granted: state::Granted::default(),
                paths,
            };
            app.manage(ctx);
            desktop::fix_restored_size(app.handle());
            guide::start(app.handle().clone());
            if let Err(e) = desktop::init_tray(app.handle()) {
                log::error!("icône de la zone de notification : {e}");
            }

            // Démarrage avec le système : la fenêtre s'ouvre réduite.
            if std::env::args().any(|a| a == "--hidden") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.minimize();
                }
            }
            log::info!("Hangar {} démarré", app.package_info().version);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::cloud_status,
            commands::cloud_login,
            commands::cloud_cancel_login,
            commands::cloud_logout,
            commands::cloud_rename_device,
            commands::cloud_forget_device,
            commands::cloud_pull,
            commands::cloud_push,
            commands::cloud_pull_sessions,
            commands::cloud_push_sessions,
            commands::cloud_sync_steamgriddb,
            commands::cloud_sync_launchers,
            commands::cloud_set_profile,
            commands::cloud_set_avatar,
            commands::cloud_remove_avatar,
            commands::cloud_cover_hash,
            commands::cloud_upload_cover,
            commands::cloud_fetch_cover,
            commands::cloud_export,
            commands::cloud_delete_account,
            commands::cloud_social,
            commands::cloud_social_image,
            commands::cloud_social_banner,
            commands::cloud_live,
            commands::social_notify,
            commands::scan_games,
            commands::open_game_link,
            commands::open_store_page,
            commands::open_launcher,
            commands::load_state,
            commands::save_state,
            commands::load_library,
            commands::save_library,
            commands::launch_game,
            commands::answer_launcher_prompt,
            commands::install_game,
            commands::stop_game,
            commands::focus_game,
            commands::show_launchers,
            commands::install_progress,
            commands::steam_downloads,
            commands::show_steam_downloads,
            commands::install_targets,
            commands::open_folder,
            commands::resolve_steam_id,
            commands::official_site,
            commands::wikidata_site,
            commands::search_steam,
            commands::image,
            commands::find_artwork,
            commands::find_social_artwork,
            commands::set_steamgriddb_key,
            commands::pick_exe,
            commands::pick_folder,
            commands::pick_image,
            commands::game_info,
            commands::exe_icon,
            commands::presence_icon,
            commands::folder_size,
            commands::set_autostart,
            commands::pad_at_login,
            commands::import_cover,
            commands::accounts_status,
            commands::steam_achievements,
            commands::connect_steam,
            commands::connect_account,
            commands::disconnect_account,
            commands::xbox_login_code,
            commands::xbox_login_cancel,
            commands::open_link,
            commands::report_bug,
            commands::open_web_game,
            commands::uninstall_game,
            commands::update_game,
            commands::set_desktop,
            commands::close_main,
            commands::pad_back,
            commands::game_bar_on_button,
            commands::set_tray_recents,
            commands::tray_state,
            commands::tray_action,
            commands::set_presence,
        ])
        .build(context)
        .expect("erreur au démarrage de Hangar")
        .run(|_app, _event| {
            // macOS : un clic sur l'icône du Dock rouvre la fenêtre cachée.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                desktop::show_main(_app);
            }
        });
}
