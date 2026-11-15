// Page de connexion ouverte dans le navigateur de la personne par l'app.
// Une fois connectée, elle passe par /desktop/finish, qui renvoie un code à l'app (127.0.0.1).
import type { Provider } from './auth';

const LABELS: Record<Provider, string> = { discord: 'Discord', google: 'Google' };

const STYLE = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
  background: #0a0b0f; color: #eef0f6;
  font: 15px/1.5 'Segoe UI Variable Display', system-ui, sans-serif; }
main { width: 100%; max-width: 380px; background: #14161d; border: 1px solid #23262f;
  border-radius: 14px; padding: 28px; }
h1 { margin: 0 0 6px; font-size: 20px; }
p { margin: 0 0 18px; color: #a7acbd; }
label { display: block; margin-bottom: 6px; color: #c3c7d4; font-size: 13px; }
input { width: 100%; padding: 10px 12px; border-radius: 9px; border: 1px solid #2c303b;
  background: #0a0b0f; color: inherit; font: inherit; }
button { width: 100%; margin-top: 12px; padding: 10px 12px; border-radius: 9px; border: 0;
  background: #7c6cff; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
button.alt { background: #1c1f28; border: 1px solid #2c303b; color: #eef0f6; font-weight: 500; }
button:disabled { opacity: .6; cursor: default; }
:focus-visible { outline: 2px solid #a99fff; outline-offset: 2px; }
hr { border: 0; border-top: 1px solid #23262f; margin: 20px 0 8px; }
#msg { min-height: 22px; margin: 12px 0 0; color: #ff8f94; font-size: 13px; }
[hidden] { display: none; }
`;

const SCRIPT = `
const $ = (id) => document.getElementById(id);
const msg = (t) => { $('msg').textContent = t; };
const post = async (path, body) => {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};
const back = '/desktop/finish' + location.search;
let email = '';
$('mail').addEventListener('submit', async (e) => {
  e.preventDefault();
  email = $('email').value.trim();
  $('send').disabled = true; msg('');
  try {
    await post('/auth/email-otp/send-verification-otp', { email, type: 'sign-in' });
    $('mail').hidden = true; $('code').hidden = false; $('otp').focus();
  } catch (err) {
    msg(err.message === '429' ? 'Trop de demandes : réessayez dans une minute.' : "Le code n'a pas pu être envoyé.");
  }
  $('send').disabled = false;
});
$('code').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('check').disabled = true; msg('');
  try {
    await post('/auth/sign-in/email-otp', { email, otp: $('otp').value.trim() });
    location.assign(back);
  } catch (err) {
    msg('Code incorrect ou expiré.');
    $('check').disabled = false;
  }
});
$('again').addEventListener('click', () => { $('code').hidden = true; $('mail').hidden = false; msg(''); });
for (const b of document.querySelectorAll('[data-provider]')) {
  b.addEventListener('click', async () => {
    msg('');
    try {
      const r = await post('/auth/sign-in/social', { provider: b.dataset.provider, callbackURL: back });
      location.assign(r.url);
    } catch (err) { msg('Connexion impossible pour le moment.'); }
  });
}
`;

/** `error` : message affiché à la place du formulaire (lien de connexion invalide). */
export function loginPage(nonce: string, list: Provider[], error?: string): string {
  const social = list
    .map((p) => `<button type="button" class="alt" data-provider="${p}">Continuer avec ${LABELS[p]}</button>`)
    .join('');
  const body = error
    ? `<h1>Connexion à Hangar</h1><p>${error}</p>`
    : `<h1>Connexion à Hangar</h1>
<p>Le compte est facultatif : il garde vos réglages et les retrouve sur vos autres PC.</p>
<form id="mail">
  <label for="email">Adresse e-mail</label>
  <input id="email" type="email" autocomplete="email" required autofocus>
  <button id="send" type="submit">Recevoir un code</button>
</form>
<form id="code" hidden>
  <label for="otp">Code reçu par e-mail</label>
  <input id="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>
  <button id="check" type="submit">Se connecter</button>
  <button id="again" type="button" class="alt">Changer d'adresse</button>
</form>
${social ? `<hr>${social}` : ''}
<div id="msg" role="alert"></div>
<script nonce="${nonce}">${SCRIPT}</script>`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Connexion à Hangar</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

export function pageHeaders(nonce: string): Record<string, string> {
  return {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy':
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; ` +
      `connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store'
  };
}
