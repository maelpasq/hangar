// Génère les déclinaisons du logo Hangar à partir de design/brand/hangar-mark.svg.
// Usage : npm run brand  (puis les icônes Tauri sont régénérées avec `tauri icon`).

import { Resvg } from '@resvg/resvg-js';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const BRAND = 'design/brand';
const mark = readFileSync(`${BRAND}/hangar-mark.svg`, 'utf8');
// Contenu intérieur du SVG du logo (defs + formes), réutilisé dans les autres compositions.
const inner = mark.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>.*?<\/title>/, '');

const render = (svg, width) => new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();

// Icône d'application : tuile sombre arrondie, lueurs violettes de la DA, logo centré.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#17131f"/>
      <stop offset="1" stop-color="#08070c"/>
    </linearGradient>
    <radialGradient id="g1" cx="0" cy="0" r="620" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#5a2fd6" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#5a2fd6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="1024" cy="1024" r="620" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#6a3cf0" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#6a3cf0" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="clip"><rect x="40" y="40" width="944" height="944" rx="216"/></clipPath>
  </defs>
  <g clip-path="url(#clip)">
    <rect width="1024" height="1024" fill="url(#tile)"/>
    <rect width="1024" height="1024" fill="url(#g1)"/>
    <rect width="1024" height="1024" fill="url(#g2)"/>
  </g>
  <rect x="40.5" y="40.5" width="943" height="943" rx="216" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="3"/>
  <g transform="translate(512 528) scale(0.8) translate(-465 -362)">${inner}</g>
</svg>`;

// Favicon : logo seul sur fond transparent, cadré au carré.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="15 -53 900 900" width="64" height="64">${inner}</svg>`;

mkdirSync('public', { recursive: true });
writeFileSync(`${BRAND}/hangar-icon.svg`, icon);
writeFileSync(`${BRAND}/hangar-icon-1024.png`, render(icon, 1024));
writeFileSync(`${BRAND}/hangar-mark-1024.png`, render(mark, 1024));
writeFileSync('public/favicon.svg', favicon);
writeFileSync('public/favicon-32.png', render(favicon, 32));

execSync(`npx tauri icon ${BRAND}/hangar-icon-1024.png -o src-tauri/icons`, { stdio: 'inherit' });
// Hangar ne cible que Windows : les icônes mobiles ne servent pas.
rmSync('src-tauri/icons/android', { recursive: true, force: true });
rmSync('src-tauri/icons/ios', { recursive: true, force: true });
console.log('Logo, icône, favicon et icônes Tauri générés.');
