#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// Hors Windows, les parseurs des stores Windows restent compilés (et testés) sans être appelés.
#![cfg_attr(not(windows), allow(dead_code))]

mod accounts;
mod art;
mod artwork;
mod commands;
mod desktop;
mod info;
mod launcher;
mod model;
mod presence;
mod scanner;
mod size;
mod state;
mod tracker;
mod webgames;

use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_window_state::StateFlags;

fn main() {
    tauri::Builder::default()
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(desktop::shortcut_plugin())
        // Fermer la fenêtre principale la cache dans la zone de notification (si activé).
        .on_window_event(|w, e| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                desktop::on_close_requested(w, api);
            }
        })
        .setup(|app| {
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
            let art = Arc::new(art::Art::new(&paths.cache));
            let artworks = Arc::new(artwork::Artworks::new(art.clone(), &paths.cache));
            let ctx = commands::Ctx {
                info: Arc::new(info::Infos::new(art.clone(), artworks.clone(), &paths.cache)),
                artwork: artworks,
                art,
                sizes: Arc::new(size::Sizes::new(&paths.cache)),
                tracker: tracker::Tracker::start(app.handle().clone()),
                known: state::Known::default(),
                xbox_busy: Arc::new(AtomicBool::new(false)),
                accounts: Arc::new(accounts::Accounts::new(&paths.config)),
                presence: Arc::default(),
                paths,
            };
            app.manage(ctx);
            desktop::fix_restored_size(app.handle());
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
            commands::scan_games,
            commands::load_state,
            commands::save_state,
            commands::load_library,
            commands::save_library,
            commands::launch_game,
            commands::install_game,
            commands::stop_game,
            commands::open_folder,
            commands::resolve_steam_id,
            commands::search_steam,
            commands::image,
            commands::find_artwork,
            commands::game_info,
            commands::exe_icon,
            commands::folder_size,
            commands::set_autostart,
            commands::import_cover,
            commands::accounts_status,
            commands::connect_steam,
            commands::connect_account,
            commands::disconnect_account,
            commands::open_link,
            commands::open_web_game,
            commands::uninstall_game,
            commands::set_desktop,
            commands::set_tray_recents,
            commands::tray_state,
            commands::tray_action,
            commands::set_presence,
        ])
        .build(tauri::generate_context!())
        .expect("erreur au démarrage de Hangar")
        .run(|_app, _event| {
            // macOS : un clic sur l'icône du Dock rouvre la fenêtre cachée.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                desktop::show_main(_app);
            }
        });
}
