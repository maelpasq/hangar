"use strict";

/* ───────────────────────── Pont Tauri (avec mode démo navigateur) ───────────────────────── */
const T = window.__TAURI__;
const invoke = T ? T.core.invoke : mockInvoke;

const STORES = {
  steam: { label: "Steam", color: "#66c0f4" },
  epic: { label: "Epic Games", color: "#e7e7e7" },
  gog: { label: "GOG", color: "#b95ce6" },
  ubisoft: { label: "Ubisoft Connect", color: "#3b82f6" },
  ea: { label: "EA app", color: "#ff4747" },
  battlenet: { label: "Battle.net", color: "#148eff" },
  xbox: { label: "Xbox", color: "#3fbf3f" },
  riot: { label: "Riot Games", color: "#ff4655" },
  local: { label: "Local", color: "#f59e0b" },
  manual: { label: "Ajoutés", color: "#a78bfa" },
};

const ICONS = {
  all: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3 3.9M6.6 6.6A16.6 16.6 0 0 0 2.5 12S6 19 12 19a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  dots: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>',
};

/* ───────────────────────── État ───────────────────────── */
let games = [];
let loading = true;
let view = "all"; // all | favorites | recent | store:<id>
let query = "";
const S = {
  favorites: [], hidden: [], renames: {}, recents: {}, launches: {},
  localFolders: [], manualGames: [], coverCache: {}, sort: "az", cardSize: 180,
};
const icons = {}; // chemin -> data URI

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => invoke("save_state", { state: S }).catch(() => {}), 250);
}

const nameOf = (g) => S.renames[g.id] || g.name;
const isFav = (g) => S.favorites.includes(g.id);
const steamId = (g) => g.steamAppId || (S.coverCache[g.id] > 0 ? S.coverCache[g.id] : null);

function allGames() {
  const manual = S.manualGames.map((g) => ({ ...g, store: "manual" }));
  return [...games, ...manual].filter((g) => !S.hidden.includes(g.id));
}

/* ───────────────────────── Jaquettes ───────────────────────── */
const CDN = "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps";
const CDN_OLD = "https://cdn.cloudflare.steamstatic.com/steam/apps";

function hue(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

function generatedCover(g) {
  const h = hue(g.id);
  const icon = g.iconSource && icons[g.iconSource];
  return `<div class="gen" style="background:linear-gradient(160deg,hsl(${h} 70% 42%),hsl(${(h + 50) % 360} 65% 22%) 70%,hsl(${(h + 80) % 360} 60% 12%))">
    <div class="ico">${icon ? `<img src="${icon}" alt="">` : ICONS.play.replace("<svg", '<svg style="width:22px;height:22px;fill:#fff;stroke:none"')}</div>
    <div class="t">${esc(nameOf(g))}</div></div>`;
}

function coverHTML(g) {
  const id = steamId(g);
  if (!id) return generatedCover(g);
  return `<img class="art" loading="lazy" data-step="0" data-app="${id}" src="${CDN}/${id}/library_600x900_2x.jpg" alt="">`;
}

// Chaîne de repli : 600x900 (nouveau CDN) -> 600x900 (ancien CDN) -> header paysage -> jaquette générée
function onCoverError(img) {
  const card = img.closest(".card");
  const app = img.dataset.app;
  const step = +img.dataset.step + 1;
  img.dataset.step = step;
  if (step === 1) img.src = `${CDN_OLD}/${app}/library_600x900_2x.jpg`;
  else if (step === 2) {
    img.closest(".cover").classList.add("landscape");
    img.insertAdjacentHTML("beforebegin", `<div class="blur" style="background-image:url(${CDN_OLD}/${app}/header.jpg)"></div>`);
    img.src = `${CDN_OLD}/${app}/header.jpg`;
  } else {
    const g = findGame(card?.dataset.id);
    const cover = img.closest(".cover");
    cover.classList.remove("landscape");
    cover.querySelector(".blur")?.remove();
    img.outerHTML = g ? generatedCover(g) : "";
  }
}
document.addEventListener("error", (e) => { if (e.target.matches?.("img.art")) onCoverError(e.target); }, true);
document.addEventListener("load", (e) => { if (e.target.matches?.("img.art")) e.target.classList.add("ok"); }, true);

// Recherche des jaquettes manquantes via l'API de recherche Steam (une fois par jeu, mise en cache)
let resolving = false;
async function resolveCovers() {
  if (resolving || !T) return;
  resolving = true;
  const todo = allGames().filter((g) => !g.steamAppId && !(g.id in S.coverCache));
  for (const g of todo) {
    try {
      const id = await invoke("resolve_steam_id", { name: nameOf(g) });
      S.coverCache[g.id] = id || 0;
      if (id) refreshCard(g.id);
    } catch { S.coverCache[g.id] = 0; }
    save();
  }
  resolving = false;
}

async function loadIcons() {
  const paths = [...new Set(allGames().map((g) => g.iconSource).filter((p) => p && !(p in icons)))];
  if (!paths.length) return;
  try {
    Object.assign(icons, await invoke("get_icons", { paths }));
    for (const p of paths) icons[p] ??= null;
    render();
  } catch {}
}

/* ───────────────────────── Rendu ───────────────────────── */
function findGame(id) { return allGames().find((g) => g.id === id); }

function cardHTML(g, i = 0) {
  const st = STORES[g.store] || STORES.local;
  return `<div class="card" tabindex="0" data-id="${esc(g.id)}" style="animation-delay:${Math.min(i, 30) * 18}ms">
    <div class="cover">${coverHTML(g)}
      <div class="badge"><span class="dot" style="background:${st.color};color:${st.color}"></span>${st.label}</div>
      <button class="fav ${isFav(g) ? "on" : ""}" data-act="fav" title="Favori">${ICONS.star}</button>
      <div class="overlay"><span class="play">${ICONS.play}Jouer</span></div>
    </div>
    <div class="meta"><div class="name" title="${esc(nameOf(g))}">${esc(nameOf(g))}</div>
      <div class="sub">${S.recents[g.id] ? ago(S.recents[g.id]) : st.label}</div></div>
  </div>`;
}

function refreshCard(id) {
  const g = findGame(id);
  if (!g) return;
  document.querySelectorAll(`.card[data-id="${CSS.escape(id)}"]`).forEach((c) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = cardHTML(g);
    const n = tmp.firstElementChild;
    n.style.animation = "none";
    c.replaceWith(n);
  });
  if (heroGame()?.id === id) renderHero();
}

function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "À l'instant";
  if (s < 3600) return `Il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `Il y a ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "Hier" : d < 30 ? `Il y a ${d} jours` : new Date(ts).toLocaleDateString("fr-FR");
}

function filtered() {
  let list = allGames();
  if (view === "favorites") list = list.filter(isFav);
  else if (view === "recent") list = list.filter((g) => S.recents[g.id]);
  else if (view.startsWith("store:")) list = list.filter((g) => g.store === view.slice(6));
  if (query) {
    const q = query.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    list = list.filter((g) => nameOf(g).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").includes(q));
  }
  const by = view === "recent" ? "recent" : S.sort;
  const cmpName = (a, b) => nameOf(a).localeCompare(nameOf(b), "fr", { sensitivity: "base" });
  list.sort((a, b) =>
    by === "recent" ? (S.recents[b.id] || 0) - (S.recents[a.id] || 0) || cmpName(a, b)
    : by === "store" ? a.store.localeCompare(b.store) || cmpName(a, b)
    : cmpName(a, b));
  return list;
}

function heroGame() {
  const list = allGames();
  if (!list.length) return null;
  const recent = list.filter((g) => S.recents[g.id]).sort((a, b) => S.recents[b.id] - S.recents[a.id])[0];
  return recent || list.find(isFav) || list.find((g) => steamId(g)) || list[0];
}

function renderHero() {
  const hero = $("#hero");
  const g = heroGame();
  const show = g && !query && (view === "all" || view === "favorites");
  if (!show) { hero.innerHTML = ""; $("#ambient").style.backgroundImage = ""; return; }
  const id = steamId(g);
  const st = STORES[g.store] || STORES.local;
  const h = hue(g.id);
  const grad = `radial-gradient(circle at 80% 30%,hsl(${h} 70% 40%),transparent 60%),linear-gradient(120deg,hsl(${(h + 40) % 360} 50% 14%),#0a0b0f)`;
  const bg = id
    ? `background-image:url(${CDN_OLD}/${id}/library_hero.jpg), url(${CDN_OLD}/${id}/header.jpg), ${grad}`
    : `background-image:${grad}`;
  $("#ambient").style.backgroundImage = id ? `url(${CDN_OLD}/${id}/library_hero.jpg)` : "";
  const label = S.recents[g.id] ? `Reprendre · ${ago(S.recents[g.id])}` : isFav(g) ? "Favori" : "À découvrir";
  hero.innerHTML = `<div class="hero-bg" style="${bg}"></div>
    <div class="hero-inner">
      <div class="eyebrow"><span class="dot" style="background:${st.color};color:${st.color}"></span>${st.label} · ${label}</div>
      <h1>${esc(nameOf(g))}</h1>
      <div class="hero-actions">
        <button class="btn-play" data-hero="play">${ICONS.play}Jouer</button>
        <button class="btn-ghost ${isFav(g) ? "on" : ""}" data-hero="fav" title="Favori">${ICONS.star}</button>
        <button class="btn-ghost" data-hero="menu" title="Plus">${ICONS.dots}</button>
        ${S.launches[g.id] ? `<span class="hero-meta">${S.launches[g.id]} lancement${S.launches[g.id] > 1 ? "s" : ""}</span>` : ""}
      </div>
    </div>`;
  hero.dataset.id = g.id;
}

function renderNav() {
  const list = allGames();
  const counts = {};
  list.forEach((g) => (counts[g.store] = (counts[g.store] || 0) + 1));
  const item = (v, icon, label, n) =>
    `<button class="nav-item ${view === v ? "active" : ""}" data-view="${v}">${icon}<span class="l">${label}</span><span class="n">${n ?? ""}</span></button>`;
  $("#nav-main").innerHTML =
    item("all", ICONS.all, "Tous les jeux", list.length) +
    item("favorites", ICONS.star, "Favoris", list.filter(isFav).length) +
    item("recent", ICONS.clock, "Récemment lancés", list.filter((g) => S.recents[g.id]).length);
  $("#nav-stores").innerHTML = Object.entries(STORES)
    .filter(([k]) => counts[k])
    .map(([k, s]) => item(`store:${k}`, `<span class="dot" style="background:${s.color};color:${s.color}"></span>`, s.label, counts[k]))
    .join("") || `<p class="hint" style="padding:4px 12px">Aucun store détecté</p>`;
}

function render() {
  renderNav();
  renderHero();
  document.documentElement.style.setProperty("--card", S.cardSize + "px");
  $("#size").value = S.cardSize;
  document.querySelectorAll("#sort button").forEach((b) => b.classList.toggle("on", b.dataset.sort === S.sort));
  $("#sort").style.visibility = view === "recent" ? "hidden" : "";

  const titles = { all: "Tous les jeux", favorites: "Favoris", recent: "Récemment lancés" };
  $("#grid-title").textContent = query ? `Résultats pour « ${query} »` : titles[view] || STORES[view.slice(6)]?.label || "";

  const recent = allGames().filter((g) => S.recents[g.id]).sort((a, b) => S.recents[b.id] - S.recents[a.id]).slice(0, 12);
  const showRecent = view === "all" && !query && recent.length > 1;
  $("#recent-section").hidden = !showRecent;
  if (showRecent) $("#recent-row").innerHTML = recent.map(cardHTML).join("");

  const grid = $("#grid");
  const empty = $("#empty");
  if (loading && !games.length) {
    grid.innerHTML = Array.from({ length: 14 }, () => `<div class="card skeleton"><div class="cover"></div><div class="meta"><div class="name"></div></div></div>`).join("");
    $("#grid-count").textContent = "Recherche des jeux…";
    empty.hidden = true;
    return;
  }
  const list = filtered();
  $("#grid-count").textContent = `${list.length} jeu${list.length > 1 ? "x" : ""}`;
  grid.innerHTML = list.map(cardHTML).join("");
  empty.hidden = list.length > 0;
  if (!list.length) {
    empty.innerHTML = query
      ? `<h3>Aucun résultat</h3><p>Aucun jeu ne correspond à « ${esc(query)} ».</p>`
      : view === "favorites"
      ? `<h3>Pas encore de favoris</h3><p>Clique sur l'étoile d'une jaquette pour épingler tes jeux préférés ici.</p>`
      : view === "recent"
      ? `<h3>Rien de lancé pour l'instant</h3><p>Les jeux que tu lances depuis Hangar apparaîtront ici.</p>`
      : `<h3>Aucun jeu trouvé</h3><p>Ajoute un dossier contenant tes jeux ou un exécutable à la main.</p><button class="btn-play" data-act="add">${ICONS.play}Ajouter un jeu</button>`;
  }
}

/* ───────────────────────── Actions ───────────────────────── */
async function play(g) {
  try {
    await invoke("launch_game", { launch: g.launch });
    S.recents[g.id] = Date.now();
    S.launches[g.id] = (S.launches[g.id] || 0) + 1;
    save();
    toast(`Lancement de <b>${esc(nameOf(g))}</b>`, g);
    setTimeout(render, 400);
  } catch (e) {
    toast(esc(e), null, true);
  }
}

function toggleFav(g) {
  const i = S.favorites.indexOf(g.id);
  i >= 0 ? S.favorites.splice(i, 1) : S.favorites.push(g.id);
  save();
  render();
}

function hide(g) {
  S.hidden.push(g.id);
  save();
  render();
  toast(`<b>${esc(nameOf(g))}</b> masqué · <button class="link" data-undo="${esc(g.id)}" style="color:var(--accent);font-weight:600">Annuler</button>`);
}

function toast(html, g, err) {
  const el = document.createElement("div");
  el.className = "toast" + (err ? " err" : "");
  const id = g && steamId(g);
  el.innerHTML = (id ? `<img src="${CDN_OLD}/${id}/capsule_184x69.jpg" alt="">` : "") + `<span>${html}</span>`;
  $("#toasts").append(el);
  el.querySelector("[data-undo]")?.addEventListener("click", (e) => {
    S.hidden = S.hidden.filter((x) => x !== e.target.dataset.undo);
    save(); render(); el.remove();
  });
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, err ? 5000 : 3200);
}

function openMenu(g, x, y) {
  const m = $("#menu");
  const canFolder = !!g.installDir;
  m.innerHTML = `
    <button data-m="play">${ICONS.play}Jouer</button>
    <button data-m="fav">${ICONS.star}${isFav(g) ? "Retirer des favoris" : "Ajouter aux favoris"}</button>
    <hr>
    <button data-m="rename">${ICONS.edit}Renommer</button>
    <button data-m="cover">${ICONS.image}Corriger la jaquette</button>
    ${canFolder ? `<button data-m="folder">${ICONS.folder}Ouvrir le dossier</button>` : ""}
    <hr>
    ${g.store === "manual"
      ? `<button data-m="remove" class="danger">${ICONS.trash}Retirer de Hangar</button>`
      : `<button data-m="hide" class="danger">${ICONS.eyeOff}Masquer</button>`}`;
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 10) + "px";
  m.style.top = Math.min(y, innerHeight - r.height - 10) + "px";
  m.onclick = (e) => {
    const a = e.target.closest("button")?.dataset.m;
    if (!a) return;
    closeMenu();
    if (a === "play") play(g);
    if (a === "fav") toggleFav(g);
    if (a === "rename") renameModal(g);
    if (a === "cover") coverModal(g);
    if (a === "folder") invoke("open_folder", { path: g.installDir }).catch((e) => toast(esc(e), null, true));
    if (a === "hide") hide(g);
    if (a === "remove") { S.manualGames = S.manualGames.filter((x) => x.id !== g.id); save(); render(); }
  };
}
function closeMenu() { $("#menu").hidden = true; }

/* ───────────────────────── Modales ───────────────────────── */
function modal(html, onReady) {
  $("#modal-body").innerHTML = html;
  $("#modal").hidden = false;
  onReady?.($("#modal-body"));
  $("#modal-body").querySelector("input")?.focus();
}
function closeModal() { $("#modal").hidden = true; }
$("#modal").addEventListener("mousedown", (e) => { if (e.target.id === "modal") closeModal(); });

function renameModal(g) {
  modal(`<h3>Renommer</h3><p class="lead">Nom d'origine : ${esc(g.name)}</p>
    <input class="field" id="f-name" value="${esc(nameOf(g))}">
    <div class="modal-actions"><button class="btn" data-x>Réinitialiser</button><button class="btn primary" data-ok>Enregistrer</button></div>`, (m) => {
    const ok = () => {
      const v = m.querySelector("#f-name").value.trim();
      if (v && v !== g.name) S.renames[g.id] = v; else delete S.renames[g.id];
      save(); closeModal(); render();
    };
    m.querySelector("[data-ok]").onclick = ok;
    m.querySelector("#f-name").onkeydown = (e) => e.key === "Enter" && ok();
    m.querySelector("[data-x]").onclick = () => { delete S.renames[g.id]; save(); closeModal(); render(); };
    m.querySelector("#f-name").select();
  });
}

function coverModal(g) {
  modal(`<h3>Corriger la jaquette</h3>
    <p class="lead">Saisis le nom exact du jeu sur Steam, ou directement son ID Steam (le nombre dans l'URL de sa page).</p>
    <input class="field" id="f-q" value="${esc(nameOf(g))}">
    <div class="modal-actions"><button class="btn" data-none>Pas de jaquette</button><button class="btn primary" data-ok>Chercher</button></div>`, (m) => {
    const ok = async () => {
      const v = m.querySelector("#f-q").value.trim();
      let id = /^\d+$/.test(v) ? +v : await invoke("resolve_steam_id", { name: v }).catch(() => null);
      if (!id) return toast("Aucun jeu Steam trouvé pour cette recherche", null, true);
      S.coverCache[g.id] = id; save(); closeModal(); render();
    };
    m.querySelector("[data-ok]").onclick = ok;
    m.querySelector("#f-q").onkeydown = (e) => e.key === "Enter" && ok();
    m.querySelector("[data-none]").onclick = () => { S.coverCache[g.id] = 0; save(); closeModal(); render(); };
  });
}

async function pickExe() {
  if (!T) return "C:\\Jeux\\Demo\\Demo.exe";
  return T.dialog.open({ multiple: false, directory: false, filters: [{ name: "Programmes", extensions: ["exe", "lnk", "url", "bat"] }] });
}
async function pickFolder() {
  if (!T) return "D:\\Jeux";
  return T.dialog.open({ multiple: false, directory: true });
}

function addModal() {
  modal(`<h3>Ajouter un jeu</h3>
    <p class="lead">Choisis l'exécutable du jeu (ou de son launcher). Hangar le lancera tel quel.</p>
    <div class="field-row"><input class="field" id="f-exe" placeholder="Chemin de l'exécutable" readonly><button class="btn" data-pick>Parcourir</button></div>
    <input class="field" id="f-n" placeholder="Nom du jeu" style="margin-bottom:10px">
    <input class="field" id="f-args" placeholder="Arguments (facultatif)">
    <h4>Ou un dossier entier</h4>
    <p class="hint">Ajoute un dossier qui contient plusieurs jeux (ex. D:\\Jeux) : chaque sous-dossier sera détecté automatiquement.</p>
    <div class="modal-actions"><button class="btn" data-folder>Ajouter un dossier</button><button class="btn primary" data-ok>Ajouter</button></div>`, (m) => {
    m.querySelector("[data-pick]").onclick = async () => {
      const p = await pickExe();
      if (!p) return;
      m.querySelector("#f-exe").value = p;
      const n = m.querySelector("#f-n");
      if (!n.value) n.value = p.split("\\").pop().replace(/\.(exe|lnk|url|bat)$/i, "");
    };
    m.querySelector("[data-folder]").onclick = async () => { closeModal(); addFolder(); };
    m.querySelector("[data-ok]").onclick = () => {
      const exe = m.querySelector("#f-exe").value.trim();
      const name = m.querySelector("#f-n").value.trim();
      if (!exe || !name) return toast("Choisis un exécutable et un nom", null, true);
      const dir = exe.split("\\").slice(0, -1).join("\\");
      S.manualGames.push({
        id: "manual:" + exe.toLowerCase(), name, store: "manual", installDir: dir,
        launch: { kind: "exe", target: exe, args: m.querySelector("#f-args").value.trim(), cwd: dir },
        steamAppId: null, iconSource: exe,
      });
      save(); closeModal(); render(); loadIcons(); resolveCovers();
      toast(`<b>${esc(name)}</b> ajouté`);
    };
  });
}

async function addFolder() {
  const p = await pickFolder();
  if (!p || S.localFolders.includes(p)) return;
  S.localFolders.push(p);
  save();
  await scan();
}

function settingsModal() {
  const hidden = S.hidden.map((id) => [...games, ...S.manualGames].find((g) => g.id === id)).filter(Boolean);
  modal(`<h3>Paramètres</h3><p class="lead">Gère les sources de ta bibliothèque.</p>
    <h4>Dossiers de jeux locaux</h4>
    <div class="list">${S.localFolders.map((f, i) => `<div class="list-item">${ICONS.folder}<span class="grow">${esc(f)}</span><button data-rmf="${i}">Retirer</button></div>`).join("") || `<p class="hint">Aucun dossier. Les jeux des stores sont détectés automatiquement.</p>`}</div>
    <div class="modal-actions" style="justify-content:flex-start;margin-top:10px"><button class="btn" data-addf>Ajouter un dossier</button></div>
    <h4>Jeux ajoutés à la main</h4>
    <div class="list">${S.manualGames.map((g, i) => `<div class="list-item"><span class="grow">${esc(g.name)} <span class="muted">${esc(g.launch.target)}</span></span><button data-rmm="${i}">Retirer</button></div>`).join("") || `<p class="hint">Aucun.</p>`}</div>
    <h4>Jeux masqués</h4>
    <div class="list">${hidden.map((g) => `<div class="list-item"><span class="grow">${esc(g.name)} <span class="muted">${STORES[g.store]?.label || ""}</span></span><button data-unh="${esc(g.id)}">Afficher</button></div>`).join("") || `<p class="hint">Aucun.</p>`}</div>
    <h4>Jaquettes</h4>
    <p class="hint">Les jaquettes des jeux hors Steam sont trouvées automatiquement via la recherche Steam.</p>
    <div class="modal-actions"><button class="btn" data-recover>Relancer la recherche des jaquettes</button><button class="btn primary" data-close>Fermer</button></div>`, (m) => {
    m.onclick = async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.close != null) return closeModal();
      if (b.dataset.addf != null) { await addFolder(); return settingsModal(); }
      if (b.dataset.rmf) { S.localFolders.splice(+b.dataset.rmf, 1); save(); scan(); return settingsModal(); }
      if (b.dataset.rmm) { S.manualGames.splice(+b.dataset.rmm, 1); save(); render(); return settingsModal(); }
      if (b.dataset.unh) { S.hidden = S.hidden.filter((x) => x !== b.dataset.unh); save(); render(); return settingsModal(); }
      if (b.dataset.recover != null) {
        for (const k in S.coverCache) if (!S.coverCache[k]) delete S.coverCache[k];
        save(); closeModal(); resolveCovers(); toast("Recherche des jaquettes en cours");
      }
    };
  });
}

/* ───────────────────────── Évènements ───────────────────────── */
function gameFromEvent(e) {
  const card = e.target.closest(".card:not(.skeleton)");
  return card ? findGame(card.dataset.id) : null;
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("#menu")) closeMenu();
  const nav = e.target.closest("[data-view]");
  if (nav) { view = nav.dataset.view; $("#content").scrollTop = 0; return render(); }
  if (e.target.closest("[data-act=add]")) return addModal();
  const hb = e.target.closest("[data-hero]");
  if (hb) {
    const g = findGame($("#hero").dataset.id);
    if (!g) return;
    if (hb.dataset.hero === "play") play(g);
    if (hb.dataset.hero === "fav") toggleFav(g);
    if (hb.dataset.hero === "menu") { const r = hb.getBoundingClientRect(); openMenu(g, r.left, r.bottom + 6); }
    return;
  }
  const g = gameFromEvent(e);
  if (!g) return;
  if (e.target.closest("[data-act=fav]")) return toggleFav(g);
  play(g);
});

document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const g = gameFromEvent(e);
  if (g) openMenu(g, e.clientX, e.clientY);
});

document.addEventListener("keydown", (e) => {
  const s = $("#search");
  if (e.key === "Escape") {
    if (!$("#modal").hidden) return closeModal();
    if (!$("#menu").hidden) return closeMenu();
    if (query) { s.value = ""; query = ""; render(); }
    s.blur();
    return;
  }
  if (!$("#modal").hidden) return;
  if ((e.ctrlKey && e.key.toLowerCase() === "k") || (e.key === "/" && document.activeElement !== s)) {
    e.preventDefault(); s.focus(); s.select(); return;
  }
  if (e.key === "Enter") {
    const card = document.activeElement?.closest?.(".card");
    if (card) return play(findGame(card.dataset.id));
    if (document.activeElement === s) { const first = filtered()[0]; if (first) play(first); }
    return;
  }
  // Taper n'importe où lance la recherche
  if (document.activeElement !== s && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey && /\S/.test(e.key)) {
    s.focus();
  }
});

$("#search").addEventListener("input", (e) => { query = e.target.value.trim(); render(); });
$("#sort").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.sort = b.dataset.sort; save(); render(); } });
$("#size").addEventListener("input", (e) => { S.cardSize = +e.target.value; document.documentElement.style.setProperty("--card", S.cardSize + "px"); save(); });
$("#btn-add").addEventListener("click", addModal);
$("#btn-settings").addEventListener("click", settingsModal);
$("#btn-rescan").addEventListener("click", () => scan(true));

if (T) {
  const w = T.window.getCurrentWindow();
  $("#win-min").onclick = () => w.minimize();
  $("#win-max").onclick = () => w.toggleMaximize();
  $("#win-close").onclick = () => w.close();
  $(".titlebar").addEventListener("dblclick", (e) => { if (e.target.closest("[data-tauri-drag-region]") === e.target) w.toggleMaximize(); });
}

/* ───────────────────────── Démarrage ───────────────────────── */
async function scan(manual) {
  loading = true;
  $("#btn-rescan").classList.add("spin");
  if (!games.length) render();
  try {
    games = await invoke("scan_games", { localFolders: S.localFolders });
    try { localStorage.setItem("hangar.games", JSON.stringify(games)); } catch {}
    if (manual) toast(`${allGames().length} jeux dans ta bibliothèque`);
  } catch (e) {
    toast("Erreur pendant la détection : " + esc(e), null, true);
  }
  loading = false;
  $("#btn-rescan").classList.remove("spin");
  render();
  loadIcons();
  resolveCovers();
}

(async function init() {
  try { Object.assign(S, await invoke("load_state")); } catch {}
  // Affichage instantané depuis le dernier scan, puis actualisation en arrière-plan
  try { const c = JSON.parse(localStorage.getItem("hangar.games") || "null"); if (Array.isArray(c)) games = c; } catch {}
  render();
  scan();
})();

/* ───────────────────────── Mode démo (hors Tauri) ───────────────────────── */
function mockInvoke(cmd, args) {
  const demo = [
    ["steam:1245620", "ELDEN RING", "steam", 1245620], ["steam:1091500", "Cyberpunk 2077", "steam", 1091500],
    ["steam:730", "Counter-Strike 2", "steam", 730], ["steam:1086940", "Baldur's Gate 3", "steam", 1086940],
    ["steam:413150", "Stardew Valley", "steam", 413150], ["steam:1145360", "Hades", "steam", 1145360],
    ["epic:fn", "Fortnite", "epic", null], ["epic:rl", "Rocket League", "epic", 252950],
    ["gog:1", "The Witcher 3: Wild Hunt", "gog", 292030], ["ubisoft:1", "Assassin's Creed Mirage", "ubisoft", 3035570],
    ["riot:valorant", "VALORANT", "riot", null], ["riot:lol", "League of Legends", "riot", null],
    ["battlenet:Pro", "Overwatch 2", "battlenet", 2357570], ["xbox:fh5", "Forza Horizon 5", "xbox", 1551360],
    ["ea:fc", "EA SPORTS FC 25", "ea", 2669320], ["local:mc", "Minecraft", "local", null],
  ].map(([id, name, store, sid]) => ({ id, name, store, installDir: "C:\\Games", steamAppId: sid, iconSource: null, launch: { kind: "uri", target: "", args: "" } }));
  const r = {
    scan_games: () => new Promise((ok) => setTimeout(() => ok(demo), 600)),
    load_state: () => ({ recents: { "steam:1245620": Date.now() - 7200e3, "steam:1086940": Date.now() - 86400e3 * 2, "epic:rl": Date.now() - 86400e3 * 5 }, favorites: ["steam:1086940", "riot:valorant"], launches: { "steam:1245620": 12 } }),
  };
  return Promise.resolve(r[cmd] ? r[cmd](args) : null);
}
