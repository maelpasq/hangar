//! Xbox / Microsoft Store : `Get-AppxPackage` via PowerShell, uniquement les paquets
//! qui contiennent `MicrosoftGame.config`. Lent : appelé en tâche de fond.

use crate::model::Game;

#[cfg(windows)]
const XBOX_PS: &str = r#"
$ErrorActionPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$out=@()
foreach($p in Get-AppxPackage){
  if($p.IsFramework -or $p.SignatureKind -eq 'System'){continue}
  $loc=$p.InstallLocation; if(-not $loc){continue}
  $cfg=Join-Path $loc 'MicrosoftGame.config'
  if(-not (Test-Path -LiteralPath $cfg)){continue}
  $m=Get-AppxPackageManifest $p
  $app=@($m.Package.Applications.Application)[0]
  $name=$null; $logo=$null
  try{ [xml]$x=Get-Content -LiteralPath $cfg -Raw; $name=$x.Game.ShellVisuals.DefaultDisplayName; $logo=$x.Game.ShellVisuals.Square150x150Logo }catch{}
  if(-not $name -or $name -like 'ms-resource*'){ $name=$m.Package.Properties.DisplayName }
  if(-not $name -or $name -like 'ms-resource*'){ $name=$p.Name }
  $exe=$null; try{ $exe=[string]@($x.Game.ExecutableList.Executable)[0].Name }catch{}
  $lp=$null; if($logo){ $lp=Join-Path $loc $logo }
  $out+=[pscustomobject]@{ name=[string]$name; family=$p.PackageFamilyName; appId=[string]$app.Id; dir=$loc; logo=$lp; exe=$exe }
}
ConvertTo-Json -InputObject @($out) -Compress
"#;

#[cfg(windows)]
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct XboxPkg {
    name: String,
    family: String,
    app_id: String,
    dir: String,
    logo: Option<String>,
    exe: Option<String>,
}

/// Exécute un script PowerShell sans fenêtre console et renvoie sa sortie standard.
#[cfg(windows)]
pub fn run_ps(script: &str) -> Option<String> {
    use base64::Engine;
    use std::os::windows::process::CommandExt;
    let wide: Vec<u8> = script.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    let enc = base64::engine::general_purpose::STANDARD.encode(wide);
    let o = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", &enc])
        .creation_flags(crate::launcher::CREATE_NO_WINDOW)
        .output()
        .map_err(|e| log::warn!("PowerShell indisponible : {e}"))
        .ok()?;
    Some(String::from_utf8_lossy(&o.stdout).into_owned())
}

#[cfg(windows)]
pub fn detect() -> Vec<Game> {
    use crate::model::uri;
    use std::path::Path;

    let Some(txt) = run_ps(XBOX_PS) else { return vec![] };
    let txt = txt.trim().trim_start_matches('\u{feff}');
    if txt.is_empty() {
        return vec![];
    }
    let pkgs = match serde_json::from_str::<Vec<XboxPkg>>(txt) {
        Ok(p) => p,
        Err(e) => {
            log::warn!("Xbox : sortie PowerShell illisible ({e})");
            return vec![];
        }
    };
    pkgs.into_iter()
        .filter(|p| !p.app_id.is_empty())
        .map(|p| {
            let mut g = Game::new(
                format!("xbox:{}", p.family),
                p.name,
                "xbox",
                uri(format!("shell:AppsFolder\\{}!{}", p.family, p.app_id)),
            );
            if let Some(x) = p.exe.filter(|x| !x.is_empty()) {
                if let Some(f) = Path::new(&x).file_name() {
                    g.process_names.push(f.to_string_lossy().into_owned());
                }
            }
            g.install_dir = Some(p.dir);
            g.logo = p.logo;
            g
        })
        .collect()
}

#[cfg(not(windows))]
pub fn detect() -> Vec<Game> {
    vec![]
}
