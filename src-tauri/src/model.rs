//! Modèle de données partagé avec le frontend (miroir de src/lib/types.ts, en camelCase).

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Launch {
    /// "uri" (protocole ou shell:AppsFolder) ou "exe"
    pub kind: String,
    pub target: String,
    #[serde(default)]
    pub args: String,
    #[serde(default)]
    pub cwd: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub id: String,
    pub name: String,
    pub store: String,
    #[serde(default)]
    pub install_dir: Option<String>,
    pub launch: Launch,
    #[serde(default)]
    pub launcher_name: String,
    #[serde(default)]
    pub steam_app_id: Option<u32>,
    /// Exécutable principal (icône et suivi de processus).
    #[serde(default)]
    pub exe_path: Option<String>,
    /// Image locale fournie par le store (logo Xbox).
    #[serde(default)]
    pub logo: Option<String>,
    /// Noms de processus qui signifient « le jeu tourne ».
    #[serde(default)]
    pub process_names: Vec<String>,
    #[serde(default)]
    pub genre: Option<String>,
    /// Temps de jeu total connu du store (ms).
    #[serde(default)]
    pub store_play_ms: Option<u64>,
    /// Dernière session connue du store (ms epoch).
    #[serde(default)]
    pub store_last_played: Option<u64>,
    /// Taille sur disque donnée par le store ou le registre (octets).
    #[serde(default)]
    pub size_bytes: Option<u64>,
    /// Date d'installation (ms epoch).
    #[serde(default)]
    pub installed_at: Option<u64>,
    /// Jeu possédé mais pas installé : `launch` ouvre alors son installation dans le launcher.
    #[serde(default)]
    pub not_installed: bool,
    /// Mise à jour en attente ou en cours dans le launcher (Steam seulement).
    #[serde(default)]
    pub update_pending: bool,
    /// Reste à télécharger pour cette mise à jour (octets), si le launcher le dit.
    #[serde(default)]
    pub update_bytes: Option<u64>,
    /// Version installée telle que le store la nomme (build Steam, version Epic, build GOG).
    #[serde(default)]
    pub version: Option<String>,
    /// Non installé et jouable sous Linux : version native (Steam, GOG) ou Vérifié / Jouable sur Steam Deck.
    #[serde(default)]
    pub linux: bool,
}

/// Session envoyée au frontend : `{ gameId, start, end }` en millisecondes epoch.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub game_id: String,
    pub start: u64,
    pub end: u64,
}

pub fn uri(target: impl Into<String>) -> Launch {
    Launch { kind: "uri".into(), target: target.into(), args: String::new(), cwd: None }
}

pub fn exe(path: &std::path::Path, args: &str) -> Launch {
    Launch {
        kind: "exe".into(),
        target: path.to_string_lossy().into_owned(),
        args: args.to_string(),
        cwd: path.parent().map(|p| p.to_string_lossy().into_owned()),
    }
}

/// Nom du lanceur affiché (« Se lance via ... ») par défaut pour un store.
pub fn default_launcher(store: &str) -> &'static str {
    match store {
        "steam" => "Steam",
        "epic" => "Epic Games Launcher",
        "gog" => "GOG Galaxy",
        "ubisoft" => "Ubisoft Connect",
        "ea" => "EA app",
        "battlenet" => "Battle.net",
        "riot" => "Riot Client",
        "xbox" => "Xbox",
        _ => "l'exécutable du jeu",
    }
}

impl Game {
    pub fn new(id: String, name: String, store: &str, launch: Launch) -> Self {
        Game {
            id,
            name,
            store: store.to_string(),
            launcher_name: default_launcher(store).to_string(),
            launch,
            ..Default::default()
        }
    }
}
