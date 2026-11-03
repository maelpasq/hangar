//! Riot Games : `RiotClientInstalls.json` (`rc_default`) et `Metadata\<produit>.<patchline>`.

use crate::model::{Game, Launch};
use std::fs;
use std::path::Path;

/// Extrait `product_install_full_path` d'un `*.product_settings.yaml`.
pub fn parse_install_path(yaml: &str) -> Option<String> {
    yaml.lines().find_map(|l| {
        let l = l.trim();
        l.strip_prefix("product_install_full_path:")
            .map(|v| v.trim().trim_matches('"').trim_matches('\'').replace('/', "\\"))
            .filter(|v| !v.is_empty())
    })
}

pub fn product_name(product: &str) -> String {
    match product {
        "league_of_legends" => "League of Legends".to_string(),
        "valorant" => "VALORANT".to_string(),
        "bacon" => "Legends of Runeterra".to_string(),
        "lion" => "2XKO".to_string(),
        other => other.replace('_', " "),
    }
}

fn process_names(product: &str) -> Vec<String> {
    let names: &[&str] = match product {
        "valorant" => &["VALORANT-Win64-Shipping.exe", "VALORANT.exe"],
        "league_of_legends" => &["League of Legends.exe", "LeagueClient.exe"],
        "bacon" => &["LoR.exe"],
        _ => &[],
    };
    names.iter().map(|s| s.to_string()).collect()
}

pub fn detect() -> Vec<Game> {
    let base = super::program_data().join("Riot Games");
    let client = fs::read_to_string(base.join("RiotClientInstalls.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v.get("rc_default").and_then(|x| x.as_str()).map(|s| s.replace('/', "\\")));
    let Some(client) = client else {
        log::info!("Riot : client non installé");
        return vec![];
    };
    let Ok(rd) = fs::read_dir(base.join("Metadata")) else {
        log::warn!("Riot : dossier Metadata introuvable");
        return vec![];
    };
    let mut out = vec![];
    for e in rd.flatten() {
        let folder = e.file_name().to_string_lossy().to_string();
        let Some((product, patchline)) = folder.split_once('.') else { continue };
        if product == "riot_client" {
            continue;
        }
        let settings = e.path().join(format!("{folder}.product_settings.yaml"));
        let Ok(t) = fs::read_to_string(settings) else { continue };
        let Some(install) = parse_install_path(&t) else { continue };
        if !Path::new(&install).exists() {
            continue;
        }
        let mut g = Game::new(
            format!("riot:{product}"),
            product_name(product),
            "riot",
            Launch {
                kind: "exe".into(),
                target: client.clone(),
                args: format!("--launch-product={product} --launch-patchline={patchline}"),
                cwd: None,
            },
        );
        g.install_dir = Some(install);
        g.process_names = process_names(product);
        out.push(g);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn yaml_riot() {
        let y = "product_install_full_path: \"C:/Riot Games/VALORANT/live\"\nproduct_install_root: \"C:/Riot Games\"\n";
        assert_eq!(parse_install_path(y).as_deref(), Some(r"C:\Riot Games\VALORANT\live"));
        assert_eq!(parse_install_path("autre: 1"), None);
        assert_eq!(parse_install_path("product_install_full_path: \"\""), None);
    }

    #[test]
    fn noms() {
        assert_eq!(product_name("valorant"), "VALORANT");
        assert_eq!(product_name("nouveau_jeu"), "nouveau jeu");
        assert!(process_names("valorant").contains(&"VALORANT-Win64-Shipping.exe".to_string()));
    }
}
