// Aperçu des pages du compte sans base ni secrets : `npm run preview`, puis http://127.0.0.1:8788.
// La connexion y est simulée : n'importe quelle adresse, code 123456 (un autre code est refusé).
import { createServer } from 'node:http';
import { GEIST_WOFF2 } from '../src/font.ts';
import { loginPage, pageHeaders, statusPage } from '../src/login-page.ts';
import { LOGO_PNG } from '../src/logo.ts';
import { mailHtml } from '../src/mail.ts';

const PORT = 8788;
const LOGIN = `/login?port=45123&challenge=${'c'.repeat(43)}&state=apercu-local`;
const INDEX = [
  [LOGIN, 'Page de connexion'],
  [`${LOGIN}&social=0`, 'Page de connexion, e-mail seul'],
  [`${LOGIN}&error=access_denied`, 'Retour en erreur de Discord ou Google'],
  ['/login', 'Lien de connexion incomplet'],
  ['/login/done', 'Connexion réussie'],
  ['/login/refused', 'Connexion refusée'],
  ['/mail', 'E-mail du code']
];

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const nonce = 'apercu';
  const html = (body, status = 200) => res.writeHead(status, pageHeaders(nonce)).end(body);
  const json = (body, status = 200) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  if (req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || '{}');
    await new Promise((r) => setTimeout(r, 600));
    if (url.pathname === '/auth/email-otp/send-verification-otp') return json({ success: true });
    if (url.pathname === '/auth/sign-in/email-otp') return body.otp === '123456' ? json({}) : json({}, 400);
    return json({}, 400);
  }
  switch (url.pathname) {
    case '/':
      return res
        .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        .end(`<!doctype html><meta charset="utf-8"><title>Pages du compte</title><ul>${INDEX.map(([href, label]) => `<li><a href="${href}">${label}</a>`).join('')}</ul>`);
    case '/login':
      if (!url.searchParams.has('port')) return html(statusPage(nonce, 'invalid'), 400);
      return html(loginPage(nonce, url.searchParams.get('social') === '0' ? [] : ['discord', 'google']));
    case '/login/done':
    case '/login/refused':
      return html(statusPage(nonce, url.pathname.slice(7)));
    case '/login/geist.woff2':
      return res.writeHead(200, { 'content-type': 'font/woff2' }).end(Buffer.from(GEIST_WOFF2, 'base64'));
    case '/desktop/finish':
      return res.writeHead(302, { location: '/login/done' }).end();
    case '/mail':
      return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(mailHtml('482913', ''));
    case '/login/logo.png':
      return res.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.from(LOGO_PNG, 'base64'));
    default:
      return res.writeHead(404).end();
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Aperçu des pages du compte : http://127.0.0.1:${PORT}`));
