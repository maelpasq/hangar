// E-mail du code de connexion : même présentation que la page de connexion, en tableaux et styles
// en ligne (seule mise en page fiable dans les messageries). Une seule image, le logo, servie par l'API.
// Le code est un seul texte (pas une case par chiffre) pour se copier d'un bloc.

export function mailSubject(code: string): string {
  return `${code} : ton code de connexion Hangar`;
}

export function mailText(code: string): string {
  return (
    `Ton code de connexion à Hangar : ${code}\n\n` +
    `Il est valable 10 minutes. Si tu n'as pas demandé ce code, ignore ce message.`
  );
}

/** `base` : adresse publique de l'API, qui sert le logo (seule image du message). */
export function mailHtml(code: string, base: string): string {
  const font = "font-family:'Segoe UI',system-ui,-apple-system,Helvetica,Arial,sans-serif";
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head>
<body style="margin:0;padding:0;background:#07080b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07080b">
<tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#14161d;border:1px solid #23262f;border-radius:20px">
<tr><td style="padding:34px 34px 30px;${font};color:#eef0f6">
<img src="${base}/login/logo.png" width="168" height="41" alt="Hangar" style="display:block;border:0;font-size:20px;font-weight:800;color:#eef0f6">
<div style="margin:22px 0 8px;font-size:26px;line-height:1.15;font-weight:800;letter-spacing:-.5px">Ton code de connexion</div>
<div style="margin:0 0 24px;font-size:14px;line-height:1.55;color:#a7acbd">Saisis-le sur la page de connexion ouverte par Hangar.</div>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding:14px 14px 14px 24px;border-radius:14px;background:#1d2029;border:1px solid #2c303b;font:700 30px Consolas,'Courier New',monospace;letter-spacing:10px;color:#eef0f6">${code}</td></tr></table>
<div style="margin:24px 0 0;font-size:13px;line-height:1.55;color:#8b90a3">Il est valable 10 minutes. Si tu n'as pas demandé ce code, ignore ce message : personne ne peut se connecter sans lui.</div>
</td></tr>
</table>
<div style="margin:18px 0 0;${font};font-size:12px;color:#8b90a3">Hangar fonctionne aussi sans compte.</div>
</td></tr>
</table>
</body>
</html>`;
}
