// Pages vues dans le navigateur pendant la connexion : la page de connexion ouverte par l'app,
// puis la page de fin vers laquelle l'app renvoie (elle a reçu son code sur 127.0.0.1).
// Présentation : docs/DESIGN.md, section « Pages du compte ».
import type { Provider } from './auth';

const SOCIAL: Record<Provider, { label: string; dot: string }> = {
  discord: { label: 'Discord', dot: '#5865f2' },
  google: { label: 'Google', dot: '#ea4335' }
};

/** Arche du logo (design/brand/hangar-mark.svg). */
const ARCH =
  'M50 682 L50 315 Q50 275 84.9 255.4 L430.1 61.6 Q465 42 499.9 61.6 L845.1 255.4 Q880 275 880 315 L880 682 ' +
  'L725 612 L725 359 Q725 345 712.8 338.1 L477.2 204.9 Q465 198 452.8 204.9 L217.2 338.1 Q205 345 205 359 L205 612 Z';
const STAR = 'M467 345 Q477 450 627 460 Q477 470 467 575 Q457 470 310 460 Q457 450 467 345 Z';

const FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 930 720"><path d="${ARCH}" fill="#cfc9dc"/><path d="${STAR}" fill="#7440f4"/></svg>`
  );

/** Logo, centré en haut de la carte. Le fond de la page est la bannière de la marque sans logo. */
const MARK = `<div class="brand"><svg viewBox="0 0 930 720" role="img" aria-label="Hangar">
<defs>
<path id="hg" d="${ARCH}"/>
<linearGradient id="m-a" x1="0" y1="42" x2="0" y2="682" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#dcd8e3"/><stop offset=".42" stop-color="#d4cfde"/><stop offset="1" stop-color="#6f6683"/>
</linearGradient>
<radialGradient id="m-g" cx="30" cy="730" r="430" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#6e3bf6"/><stop offset=".5" stop-color="#7a52f0" stop-opacity=".75"/><stop offset="1" stop-color="#8a6ff0" stop-opacity="0"/>
</radialGradient>
<linearGradient id="m-s" x1="0" y1="345" x2="0" y2="575" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#8f6bff"/><stop offset="1" stop-color="#6e3bf6"/>
</linearGradient>
</defs>
<use href="#hg" fill="url(#m-a)"/><use href="#hg" fill="url(#m-g)"/>
<path class="star" d="${STAR}" fill="url(#m-s)"/>
</svg></div>`;

const STYLE = `
@font-face { font-family: Geist; src: url(/login/geist.woff2) format('woff2'); font-weight: 100 900; font-display: swap; }
:root { color-scheme: dark; --bg: #07080b; --panel: rgba(20,22,29,.82); --s2: rgba(255,255,255,.045);
  --s3: rgba(255,255,255,.07); --b1: rgba(255,255,255,.05); --b2: rgba(255,255,255,.08); --b3: rgba(255,255,255,.14);
  --text: #eef0f6; --text-3: #a7acbd; --muted: #8b90a3; --accent: #7c6cff; --accent-soft: rgba(139,123,255,.14);
  --ok: #6ee7b7; --bad: #ff8f94; --ease: cubic-bezier(.2,.8,.2,1); --cell: 51px; --gap: 8px; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; min-height: 100vh; min-height: 100dvh; display: grid; place-items: center; align-content: center;
  gap: 18px; padding: 24px 16px; overflow-x: hidden; color: var(--text); -webkit-font-smoothing: antialiased;
  font: 14px/1.55 Geist, 'Segoe UI Variable Display', system-ui, sans-serif;
  background: #030304 url(/login/fond.webp) center / cover no-repeat fixed; }
main { position: relative; z-index: 1; width: 100%; max-width: 420px; padding: 36px 36px 30px;
  background: var(--panel); border: 1px solid var(--b2); border-radius: 20px;
  -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 40px 90px -30px rgba(0,0,0,.85);
  animation: enter .5s var(--ease) both; }
.brand { position: relative; width: 52px; height: 40px; margin: 0 auto 22px; }
.brand::before { content: ''; position: absolute; inset: -22px; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(124,108,255,.5), transparent); opacity: .7;
  animation: halo 2.2s ease-in-out infinite alternate; }
.brand svg { position: relative; display: block; width: 100%; height: 100%; }
.star { transform-box: fill-box; transform-origin: center; animation: pop .7s cubic-bezier(.2,1.4,.4,1) .15s both; }
h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.15; font-weight: 800; letter-spacing: -.6px; }
p { margin: 0; color: var(--text-3); }
.lead { margin-bottom: 24px; }
.lead b { color: var(--text); font-weight: 600; overflow-wrap: anywhere; }
section { animation: enter .5s var(--ease) both; }
label { display: block; margin-bottom: 7px; color: var(--text-3); font-size: 13px; font-weight: 500; }
input { font: inherit; color: inherit; }
#email { width: 100%; height: 46px; padding: 0 14px; border-radius: 13px; border: 1px solid var(--b2);
  background: var(--s2); outline: 0; transition: border-color .15s, box-shadow .15s, background .15s; }
#email::placeholder { color: var(--muted); opacity: .7; }
#email:hover { background: var(--s3); }
#email:focus { border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
button { font: inherit; color: inherit; cursor: pointer; }
button:disabled { cursor: default; }
.btn { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; height: 46px;
  border-radius: 14px; border: 1px solid transparent; font-weight: 600;
  transition: transform .15s var(--ease), filter .15s, background .15s, border-color .15s; }
.btn:active:not(:disabled) { transform: scale(.98); }
.go { margin-top: 14px; background: var(--accent); color: #fff;
  box-shadow: 0 12px 30px -12px color-mix(in srgb, var(--accent) 80%, transparent); }
.go:hover:not(:disabled) { filter: brightness(1.1); }
.go:disabled { opacity: .65; }
.go.busy::before { content: ''; width: 15px; height: 15px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.35); border-top-color: #fff; animation: spin .7s linear infinite; }
.alt { margin-top: 10px; background: var(--s2); border-color: var(--b2); font-weight: 500; }
.alt:hover { background: var(--s3); border-color: var(--b3); }
.alt i { width: 8px; height: 8px; border-radius: 50%; }
.d-discord { background: ${SOCIAL.discord.dot}; }
.d-google { background: ${SOCIAL.google.dot}; }
:focus-visible { outline: 2px solid #a99fff; outline-offset: 2px; }
.hint { margin-top: 12px; font-size: 12.5px; color: var(--muted); }
.or { display: flex; align-items: center; gap: 12px; margin: 22px 0 12px; color: var(--muted);
  font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; }
.or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--b2); }
.otp { position: relative; width: calc(6 * var(--cell) + 5 * var(--gap)); height: 58px; }
.cells { display: flex; gap: var(--gap); height: 100%; }
.cells i { flex: none; width: var(--cell); border-radius: 13px; border: 1px solid var(--b2); background: var(--s2);
  transition: border-color .15s, box-shadow .15s, background .15s; }
.cells i.full { border-color: var(--b3); background: var(--s3); }
.otp:focus-within .cells i.on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent), inset 0 0 14px var(--accent-soft); }
#otp { position: absolute; inset: 0; width: calc(100% + var(--cell)); height: 100%; padding: 0;
  padding-left: calc((var(--cell) - 1ch) / 2); border: 0; outline: 0; background: none; caret-color: var(--accent);
  font: 600 24px/1 ui-monospace, 'Cascadia Mono', Consolas, monospace;
  letter-spacing: calc(var(--cell) + var(--gap) - 1ch); }
.otp.no { animation: shake .35s; }
.otp.no .cells i { border-color: rgba(229,72,77,.6); }
.links { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 16px; }
.link { padding: 2px 0; border: 0; background: none; color: var(--text-3); font-size: 13px;
  text-decoration: underline; text-decoration-color: var(--b3); text-underline-offset: 3px; border-radius: 4px; }
.link:hover:not(:disabled) { color: var(--text); text-decoration-color: currentColor; }
.link:disabled { color: var(--muted); text-decoration: none; font-variant-numeric: tabular-nums; }
#msg { min-height: 20px; margin-top: 14px; font-size: 13px; color: var(--bad); }
#msg.ok { color: var(--ok); }
.foot { position: relative; z-index: 1; font-size: 12.5px; color: var(--muted); text-align: center; }
.state { display: flex; align-items: center; gap: 10px; margin-top: 22px; padding: 12px 14px;
  border-radius: 13px; border: 1px solid var(--b1); background: var(--s2); font-size: 13px; color: var(--text-3); }
.state i { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--ok);
  animation: ring 1.6s ease-out infinite; }
.state.bad i { background: #e5484d; animation: none; }
@keyframes enter { from { opacity: 0; transform: translateY(10px); } }
@keyframes pop { from { opacity: 0; transform: scale(.4) rotate(-30deg); } }
@keyframes halo { to { opacity: .45; transform: scale(1.12); } }
@keyframes spin { to { transform: rotate(1turn); } }
@keyframes shake { 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
@keyframes ring { from { box-shadow: 0 0 0 0 rgba(52,211,153,.5); } to { box-shadow: 0 0 0 8px rgba(52,211,153,0); } }
@media (max-width: 440px) { main { padding: 28px 24px 24px; } :root { --cell: 42px; --gap: 7px; } h1 { font-size: 25px; } }
@media (max-width: 350px) { :root { --cell: 34px; --gap: 5px; } #otp { font-size: 20px; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;

const SCRIPT = `
const $ = (id) => document.getElementById(id);
const msg = (t, ok) => { $('msg').textContent = t; $('msg').classList.toggle('ok', !!ok); };
const post = async (path, body) => {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};
const busy = (b, on) => { b.disabled = on; b.classList.toggle('busy', on); };
const query = new URLSearchParams(location.search);
const failed = query.has('error');
query.delete('error'); query.delete('error_description');
const search = '?' + query.toString();
const back = '/desktop/finish' + search;
const cells = [...document.querySelectorAll('.cells i')];
let email = '';
let timer = 0;

const paint = () => {
  const n = $('otp').value.length;
  cells.forEach((c, i) => { c.classList.toggle('full', i < n); c.classList.toggle('on', i === Math.min(n, 5)); });
};
const show = (code) => {
  $('step-mail').hidden = code; $('step-code').hidden = !code; msg('');
  if (code) { $('sent').textContent = email; $('otp').value = ''; paint(); $('otp').focus(); }
  else $('email').focus();
};
const cooldown = () => {
  let left = 30;
  const tick = () => {
    $('again').disabled = left > 0;
    $('again').textContent = left > 0 ? 'Renvoyer le code (' + left + ' s)' : 'Renvoyer le code';
    if (left-- <= 0) clearInterval(timer);
  };
  clearInterval(timer); tick(); timer = setInterval(tick, 1000);
};
const send = async () => {
  await post('/auth/email-otp/send-verification-otp', { email, type: 'sign-in' });
  cooldown();
};
const sendError = (err) =>
  msg(err.message === '429' ? 'Trop de demandes : réessaie dans une minute.' : "Le code n'a pas pu être envoyé.");

$('mail').addEventListener('submit', async (e) => {
  e.preventDefault();
  email = $('email').value.trim();
  busy($('send'), true); msg('');
  try { await send(); show(true); } catch (err) { sendError(err); }
  busy($('send'), false);
});
// Pas de maxlength sur le champ : un code collé avec des espaces ou des tabulations serait coupé
// avant d'être nettoyé ici.
$('otp').addEventListener('input', () => {
  const o = $('otp');
  o.value = o.value.replace(/\\D/g, '').slice(0, 6);
  $('box').classList.remove('no'); paint();
  if (o.value.length === 6) $('code').requestSubmit();
});
$('code').addEventListener('submit', async (e) => {
  e.preventDefault();
  if ($('check').disabled) return;
  busy($('check'), true); msg('');
  try {
    await post('/auth/sign-in/email-otp', { email, otp: $('otp').value });
    location.assign(back);
  } catch (err) {
    msg('Code incorrect ou expiré.');
    $('otp').value = ''; paint(); $('box').classList.add('no'); $('otp').focus();
    busy($('check'), false);
  }
});
$('again').addEventListener('click', async () => {
  msg('');
  try { await send(); msg('Nouveau code envoyé.', true); $('otp').focus(); } catch (err) { sendError(err); }
});
$('change').addEventListener('click', () => show(false));
for (const b of document.querySelectorAll('[data-provider]')) {
  b.addEventListener('click', async () => {
    msg('');
    try {
      const r = await post('/auth/sign-in/social',
        { provider: b.dataset.provider, callbackURL: back, errorCallbackURL: '/login' + search });
      location.assign(r.url);
    } catch (err) { msg('Connexion impossible pour le moment.'); }
  });
}
paint();
if (failed) msg("La connexion avec ce service n'a pas abouti. Réessaie, ou utilise ton adresse e-mail.");
`;

function shell(nonce: string, title: string, inner: string, script = '', style = ''): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#07080b">
<title>${title}</title>
<link rel="icon" href="${FAVICON}">
<style nonce="${nonce}">${STYLE}${style}</style>
</head>
<body>
<main>${MARK}${inner}</main>
<p class="foot">Hangar fonctionne aussi sans compte.</p>
${script ? `<script nonce="${nonce}">${script}</script>` : ''}
</body>
</html>`;
}

/** Page de connexion : adresse e-mail puis code à 6 chiffres, ou un service de `list`. */
export function loginPage(nonce: string, list: Provider[]): string {
  const social = list
    .map(
      (p) =>
        `<button type="button" class="btn alt" data-provider="${p}"><i class="d-${p}"></i>Continuer avec ${SOCIAL[p].label}</button>`
    )
    .join('');
  return shell(
    nonce,
    'Connexion à Hangar',
    `<section id="step-mail">
<h1>Connexion à Hangar</h1>
<p class="lead">Ton compte garde tes réglages et les retrouve sur tes autres PC.</p>
<form id="mail">
<label for="email">Adresse e-mail</label>
<input id="email" type="email" autocomplete="email" placeholder="toi@exemple.fr" required autofocus>
<button id="send" type="submit" class="btn go">Recevoir un code</button>
</form>
<p class="hint">Pas de mot de passe : un code à 6 chiffres arrive par e-mail.</p>
${social ? `<div class="or">ou</div>${social}` : ''}
</section>
<section id="step-code" hidden>
<h1>Vérifie tes e-mails</h1>
<p class="lead">Code envoyé à <b id="sent"></b>. Il est valable 10 minutes.</p>
<form id="code">
<label for="otp">Code à 6 chiffres</label>
<div class="otp" id="box">
<div class="cells" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
<input id="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required>
</div>
<button id="check" type="submit" class="btn go">Se connecter</button>
</form>
<div class="links">
<button id="again" type="button" class="link">Renvoyer le code</button>
<button id="change" type="button" class="link">Changer d'adresse</button>
</div>
</section>
<div id="msg" role="alert"></div>`,
    SCRIPT
  );
}

export type Status = 'done' | 'refused' | 'invalid';

const STATUS: Record<Status, { title: string; text: string; state: string; ok: boolean }> = {
  done: {
    title: 'Connexion réussie',
    text: 'Tu peux fermer cet onglet et revenir dans Hangar.',
    state: 'Hangar a pris le relais sur ce PC.',
    ok: true
  },
  refused: {
    title: 'Connexion refusée',
    text: 'Cette page ne correspond pas à la connexion en cours.',
    state: 'Recommence depuis Hangar : Paramètres, puis Compte.',
    ok: false
  },
  invalid: {
    title: 'Lien de connexion incomplet',
    text: "Cette page s'ouvre depuis Hangar, pas directement.",
    state: 'Relance la connexion depuis Hangar : Paramètres, puis Compte.',
    ok: false
  }
};

/** Pages sans formulaire : fin de connexion (réussie ou refusée) et lien de connexion invalide. */
export function statusPage(nonce: string, kind: Status): string {
  const s = STATUS[kind];
  return shell(
    nonce,
    s.title,
    `<h1>${s.title}</h1><p>${s.text}</p><div class="state${s.ok ? '' : ' bad'}"><i></i>${s.state}</div>`
  );
}

export function pageHeaders(nonce: string): Record<string, string> {
  return {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy':
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; font-src 'self'; ` +
      `img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store'
  };
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

/** Profil public d'un compte : ce que la personne a choisi de montrer, rien d'autre. */
export interface PublicProfile {
  name: string;
  /** Image en `data:` (la page ne charge rien d'ailleurs), ou null : initiale. */
  avatar: string | null;
  since: number;
  playMs: number;
  games: number;
}

const PROFILE_STYLE = `
.who { display: flex; align-items: center; gap: 16px; margin-bottom: 22px; }
.who img, .who .ini { flex: none; width: 72px; height: 72px; border-radius: 50%; object-fit: cover;
  border: 1px solid var(--b3); }
.who .ini { display: grid; place-items: center; background: var(--accent); color: #fff; font-size: 30px; font-weight: 800; }
.who h1 { margin: 0 0 2px; overflow-wrap: anywhere; }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.stats div { padding: 14px; border-radius: 13px; border: 1px solid var(--b1); background: var(--s2); }
.stats b { display: block; font-size: 22px; font-weight: 750; letter-spacing: -.4px; font-variant-numeric: tabular-nums; }
.stats span { font-size: 12.5px; color: var(--muted); }`;

/** Durée lisible : minutes sous une heure, heures ensuite. */
export function playLabel(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  return `${Math.round(min / 60).toLocaleString('fr-FR')} h`;
}

/** Page publique d'un profil (`/u/<id>`), ou page « introuvable » quand le profil est privé. */
export function profilePage(nonce: string, p: PublicProfile | null): string {
  if (!p) {
    return shell(nonce, 'Profil introuvable', `<h1>Profil introuvable</h1><p>Ce profil Hangar n'existe pas ou n'est pas public.</p>`);
  }
  const name = escapeHtml(p.name);
  const pic = p.avatar
    ? `<img src="${p.avatar}" alt="">`
    : `<span class="ini" aria-hidden="true">${escapeHtml(p.name.charAt(0).toUpperCase())}</span>`;
  const since = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(p.since);
  const games = `${p.games.toLocaleString('fr-FR')}`;
  return shell(
    nonce,
    `${name} sur Hangar`,
    `<div class="who">${pic}<div><h1>${name}</h1><p>Sur Hangar depuis ${since}</p></div></div>
<div class="stats"><div><b>${playLabel(p.playMs)}</b><span>de jeu avec Hangar</span></div><div><b>${games}</b><span>${p.games > 1 ? 'jeux joués' : 'jeu joué'}</span></div></div>`,
    '',
    PROFILE_STYLE
  );
}
