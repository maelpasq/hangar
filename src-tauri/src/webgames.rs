//! Jeux web : catalogue fermé partagé avec le frontend (web-games.json).
//! Le frontend n'envoie qu'un identifiant, jamais une adresse.

use serde::Deserialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const CATALOG: &str = include_str!("../../src/lib/web-games.json");

#[derive(Deserialize)]
struct WebGame {
    id: String,
    name: String,
    url: String,
}

fn find(id: &str) -> Option<WebGame> {
    serde_json::from_str::<Vec<WebGame>>(CATALOG).ok()?.into_iter().find(|g| g.id == id)
}

/// Ouvre le jeu dans sa propre fenêtre (une par jeu) : sans accès aux commandes Tauri,
/// la capacité « default » ne vise que la fenêtre principale.
pub fn open(app: &AppHandle, id: &str) -> Result<(), String> {
    let game = find(id).ok_or("Jeu web inconnu.")?;
    let label = format!("web-{}", game.id);
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.unminimize();
        let _ = w.set_focus();
        return Ok(());
    }
    let url = game.url.parse().map_err(|_| "Adresse du jeu invalide.".to_string())?;
    WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url))
        .title(&game.name)
        .inner_size(1280.0, 800.0)
        .min_inner_size(640.0, 480.0)
        .center()
        .background_color(tauri::window::Color(10, 11, 15, 255))
        // Les liens du jeu restent en https ; le reste (schémas exotiques) est bloqué.
        .on_navigation(|u| u.scheme() == "https")
        .build()
        .map_err(|e| {
            log::error!("fenêtre du jeu web {id} : {e}");
            "Impossible d'ouvrir la fenêtre du jeu.".to_string()
        })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalogue_valide() {
        let games: Vec<WebGame> = serde_json::from_str(CATALOG).expect("web-games.json illisible");
        assert!(!games.is_empty());
        let mut ids = std::collections::HashSet::new();
        for g in &games {
            assert!(ids.insert(g.id.as_str()), "id en double : {}", g.id);
            assert!(g.url.starts_with("https://"), "{} n'est pas en https", g.id);
            assert!(!g.name.is_empty());
        }
        assert!(find("agar").is_some());
        assert!(find("inconnu").is_none());
    }
}
