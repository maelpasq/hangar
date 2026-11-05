<script lang="ts">
  // Paramètres, rangés par thème : apparence, bibliothèque, lancement et jaquettes, mise à jour.
  import { addFolder, removeFolder } from '../actions';
  import { api } from '../api';
  import Icon from '../components/Icon.svelte';
  import Segmented from '../components/Segmented.svelte';
  import StoreLogo from '../components/StoreLogo.svelte';
  import Toggle from '../components/Toggle.svelte';
  import { ACCENTS, STORE_ORDER, STORES } from '../stores-meta';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Prefs, Theme } from '../types';
  import { art } from '../art.svelte';
  import { plural } from '../util/format';
  import { isMac } from '../util/platform';
  import { updater } from '../stores/update.svelte';
  import { accounts } from '../stores/accounts.svelte';
  import { relativeDay } from '../util/format';
  import type { AccountStatus, StoreId } from '../types';

  let version = $state('');
  api.appVersion().then(
    (v) => (version = v),
    () => {}
  );

  void accounts.refresh();
  let steamKey = $state('');

  /** Tag d'un store : Connecté, Détecté (launcher ou jeux trouvés), Non trouvé. */
  function tag(s: StoreId): { label: string; kind: 'conn' | 'ok' | 'off' } | null {
    if (s === 'local' || s === 'manual') return null;
    const a = accounts.byStore.get(s);
    if (a?.connected) return { label: 'Connecté', kind: 'conn' };
    if (a?.detected || (library.countsAll[s] ?? 0) > 0) return { label: 'Détecté', kind: 'ok' };
    return { label: 'Non trouvé', kind: 'off' };
  }

  async function connectSteam(e: Event) {
    e.preventDefault();
    if (await accounts.connectSteam(steamKey)) steamKey = '';
  }

  const loginStores: { store: StoreId; desc: string }[] = [
    { store: 'gog', desc: 'Tous tes jeux GOG, même sans GOG Galaxy' },
    { store: 'epic', desc: 'Toute ta bibliothèque Epic, à jour' }
  ];

  const stores = $derived(STORE_ORDER.filter((s) => s !== 'manual' || (library.countsAll.manual ?? 0) > 0));
  const hidden = $derived(library.all.filter((g) => library.state.hidden.includes(g.id)));

  function folderCount(dir: string): number {
    // Chemins Windows (\) et macOS (/) comparés sous la même forme.
    const norm = (p: string) => p.toLowerCase().replace(/\//g, '\\');
    const d = norm(dir).replace(/\\+$/, '') + '\\';
    return library.all.filter((g) => g.store === 'local' && norm(g.installDir ?? '').startsWith(d)).length;
  }

  type BoolPref = Exclude<keyof Prefs, 'steamGridDbKey'>;
  const prefs: { key: BoolPref; label: string; desc: string }[] = [
    {
      key: 'minimizeOnLaunch',
      label: "Réduire Hangar au lancement d'un jeu",
      desc: 'La fenêtre revient quand tu quittes le jeu'
    },
    { key: 'startWithWindows', label: `Démarrer avec ${isMac ? 'macOS' : 'Windows'}`, desc: "Hangar s'ouvre en arrière-plan à la connexion" },
    {
      key: 'showUninstalled',
      label: 'Afficher les jeux non installés',
      desc: 'Onglet « À installer » avec les jeux de tes launchers'
    }
  ];

  const themes: { value: Theme; label: string }[] = [
    { value: 'dark', label: 'Sombre' },
    { value: 'light', label: 'Clair' },
    { value: 'system', label: 'Appareil' }
  ];

  function setTheme(t: Theme) {
    library.state.theme = t;
    library.save();
  }

  async function setPref(key: BoolPref, on: boolean) {
    library.state.prefs[key] = on;
    library.save();
    if (key === 'startWithWindows') {
      try {
        await api.setAutostart(on);
      } catch (e) {
        library.state.prefs[key] = !on;
        library.save();
        ui.toast(`Impossible de modifier le démarrage automatique : ${String(e)}`, { error: true });
      }
    }
    if (key === 'autoCovers') art.reset();
  }

  let gridKey = $state(library.state.prefs.steamGridDbKey);
  let showKey = $state(false);
  const keyDirty = $derived(gridKey.trim() !== library.state.prefs.steamGridDbKey);

  function saveGridKey(e?: Event) {
    e?.preventDefault();
    const k = gridKey.trim();
    if (k === library.state.prefs.steamGridDbKey) return;
    library.state.prefs.steamGridDbKey = k;
    library.save();
    art.reset();
    ui.toast(k ? 'Clé SteamGridDB enregistrée, recherche des jaquettes...' : 'Clé SteamGridDB retirée');
  }

  const accent = $derived(library.state.accent.toLowerCase());
  const custom = $derived(!ACCENTS.some((a) => a.color === accent));

  // Pendant le glisser du sélecteur : aperçu en direct, enregistrement au relâcher.
  function setAccent(c: string, save = true) {
    library.state.accent = c;
    if (save) library.save();
  }
</script>

<div class="screen scroll page">
  <h1>Paramètres</h1>
  <p class="lead">Apparence, sources de ta bibliothèque et comportement au lancement.</p>

  <h2 class="group">Apparence</h2>
  <div class="grid">
    <section class="card-section">
      <h3>Thème</h3>
      <p class="desc">« Appareil » suit le réglage clair ou sombre de {isMac ? 'macOS' : 'Windows'}.</p>
      <Segmented value={library.state.theme} options={themes} label="Thème" onchange={setTheme} />
    </section>

    <section class="card-section">
      <h3>Couleur d'accent</h3>
      <p class="desc">Boutons, sélection et lueurs. Choisis une teinte ou la tienne.</p>
      <div class="swatches">
        <div class="swatches" role="radiogroup" aria-label="Couleur d'accent">
          {#each ACCENTS as a (a.color)}
            {@const on = accent === a.color}
            <button
              class="sw"
              class:on
              role="radio"
              aria-checked={on}
              aria-label="Accent {a.name}"
              title={a.name}
              style:background={a.color}
              onclick={() => setAccent(a.color)}
            ></button>
          {/each}
        </div>
        <label class="sw custom" class:on={custom} title="Couleur personnalisée" style:background={custom ? accent : undefined}>
          <span class="sr-only">Couleur personnalisée</span>
          {#if !custom}<Icon name="plus" size={16} stroke={2.2} />{/if}
          <input
            type="color"
            value={accent}
            oninput={(e) => setAccent(e.currentTarget.value, false)}
            onchange={(e) => setAccent(e.currentTarget.value)}
          />
        </label>
        <span class="meta mono hex">{accent}</span>
      </div>
    </section>
  </div>

  <h2 class="group">Bibliothèque</h2>
  <div class="grid">
    <div class="col">
      <section class="card-section">
        <h3>Stores détectés</h3>
        <p class="desc">Hangar cherche automatiquement les jeux de ces launchers.</p>
        {#each stores as s (s)}
          {@const on = !library.state.disabledStores.includes(s)}
          <div class="line">
            <StoreLogo store={s} size={16} />
            <span class="grow">{STORES[s].label}</span>
            {#if tag(s)}{@const t = tag(s)!}<span class="tag {t.kind}">{t.label}</span>{/if}
            <span class="meta">{plural(library.countsAll[s] ?? 0, 'jeu', 'jeux')}</span>
            <Toggle {on} label="Activer {STORES[s].label}" onchange={(v) => library.setStoreEnabled(s, v)} />
          </div>
        {/each}
      </section>
    </div>

    <div class="col">
      <section class="card-section">
        <h3>Dossiers de jeux locaux</h3>
        <p class="desc">Chaque sous-dossier devient un jeu. Le launcher du jeu est lancé en priorité.</p>
        {#each library.state.localFolders as f (f)}
          <div class="folder">
            <span class="grow mono path">{f}</span>
            <span class="swap">
              <span class="meta cnt">{plural(folderCount(f), 'jeu', 'jeux')}</span>
              <button class="remove" aria-label="Retirer {f}" onclick={() => removeFolder(f)}>Retirer</button>
            </span>
          </div>
        {/each}
        <button class="chip-btn add" onclick={addFolder}><Icon name="plus" size={15} stroke={2} />Ajouter un dossier</button>
      </section>

      <section class="card-section">
        <h3>Jeux ajoutés à la main</h3>
        <p class="desc">Les exécutables que tu as ajoutés toi-même.</p>
        {#each library.state.manualGames as g (g.id)}
          <div class="line">
            <span class="grow txt"
              ><span class="ell">{library.name(g)}</span><span class="meta mono ell">{g.launch.target}</span></span
            >
            <button class="chip-btn" onclick={() => library.removeManual(g.id)}
              ><Icon name="trash" size={15} />Retirer</button
            >
          </div>
        {:else}
          <p class="none">Aucun jeu ajouté à la main.</p>
        {/each}
        <button class="chip-btn add" onclick={() => { ui.modal = { kind: 'add' }; }}
          ><Icon name="plus" size={15} stroke={2} />Ajouter un jeu</button
        >
      </section>

      <section class="card-section">
        <h3>Jeux masqués</h3>
        <p class="desc">Ils restent installés, Hangar ne les affiche simplement plus.</p>
        {#each hidden as g (g.id)}
          <div class="line">
            <StoreLogo store={g.store} size={16} />
            <span class="grow ell">{library.name(g)}</span>
            <button class="chip-btn" onclick={() => library.unhide(g.id)}><Icon name="eye" size={15} />Afficher</button>
          </div>
        {:else}
          <p class="none">Aucun jeu masqué.</p>
        {/each}
      </section>
    </div>
  </div>

  {#snippet linked(a: AccountStatus)}
    <div class="line acc">
      <StoreLogo store={a.store} size={16} />
      <span class="grow txt">
        <span class="ell">{STORES[a.store].label}{a.user ? ` · ${a.user}` : ''}</span>
        {#if a.error}
          <span class="meta err">{a.error}</span>
        {:else}
          <span class="meta"
            >{plural(a.games, 'jeu', 'jeux')}{a.syncedAt ? ` · synchronisé ${relativeDay(a.syncedAt).toLowerCase()}` : ''}</span
          >
        {/if}
      </span>
      <span class="tag conn">Connecté</span>
      <button class="chip-btn" onclick={() => accounts.disconnect(a.store)}>Déconnecter</button>
    </div>
  {/snippet}

  <h2 class="group">Comptes des launchers</h2>
  <div class="grid">
    <section class="card-section">
      <h3>Steam</h3>
      <p class="desc">Tous tes jeux Steam et ton temps de jeu, même ceux jamais affichés sur cet appareil.</p>
      {#if accounts.byStore.get('steam')?.connected}
        {@render linked(accounts.byStore.get('steam')!)}
      {:else}
        <form class="gridkey" onsubmit={connectSteam}>
          <label class="field" for="steam-key">
            <span class="txt"
              ><span class="lbl">Clé d'API Web Steam</span><span class="meta"
                >Crée ta clé personnelle sur Steam (nom de domaine : « localhost »), puis colle-la ici. Elle est
                gardée dans le coffre de {isMac ? 'macOS' : 'Windows'}, jamais dans les fichiers de Hangar.</span
              ></span
            >
          </label>
          <div class="keyrow">
            <input
              id="steam-key"
              type="password"
              autocomplete="off"
              spellcheck="false"
              maxlength="64"
              placeholder="32 caractères"
              bind:value={steamKey}
            />
            <button type="button" class="chip-btn" onclick={() => api.openLink('steam-api-key').catch(() => {})}
              >Créer ma clé</button
            >
            <button type="submit" class="chip-btn primary" disabled={!steamKey.trim() || !!accounts.busy}
              >{accounts.busy === 'steam' ? 'Vérification...' : 'Connecter'}</button
            >
          </div>
        </form>
      {/if}
    </section>

    <section class="card-section">
      <h3>GOG et Epic Games</h3>
      <p class="desc">Connexion sur la page officielle du launcher : Hangar ne voit jamais ton mot de passe.</p>
      {#each loginStores as l (l.store)}
        {@const a = accounts.byStore.get(l.store)}
        {#if a?.connected}
          {@render linked(a)}
        {:else}
          <div class="line acc">
            <StoreLogo store={l.store} size={16} />
            <span class="grow txt"><span>{STORES[l.store].label}</span><span class="meta">{l.desc}</span></span>
            <button class="chip-btn primary" disabled={!!accounts.busy} onclick={() => accounts.connect(l.store)}
              >{accounts.busy === l.store ? 'Connexion...' : 'Se connecter'}</button
            >
          </div>
        {/if}
      {/each}
      <p class="note">
        Ubisoft Connect, EA app, Battle.net et Xbox n'offrent pas de connexion sûre aux apps tierces : Hangar y lit
        seulement les jeux présents sur l'appareil.
      </p>
    </section>
  </div>

  <h2 class="group">Lancement et jaquettes</h2>
  <div class="grid">
    <section class="card-section">
      <h3 class="mb6">Comportement</h3>
      {#each prefs as p (p.key)}
        <div class="line pref">
          <span class="grow txt"><span>{p.label}</span><span class="meta">{p.desc}</span></span>
          <Toggle on={library.state.prefs[p.key]} label={p.label} onchange={(v) => setPref(p.key, v)} />
        </div>
      {/each}
    </section>

    <section class="card-section">
      <h3 class="mb6">Jaquettes</h3>
      <div class="line pref">
        <span class="grow txt"
          ><span>Jaquettes automatiques</span><span class="meta"
            >Cherche jaquette et bannière de chaque jeu (store, Steam, SteamGridDB)</span
          ></span
        >
        <Toggle on={library.state.prefs.autoCovers} label="Jaquettes automatiques" onchange={(v) => setPref('autoCovers', v)} />
      </div>
      <form class="gridkey" onsubmit={saveGridKey}>
        <label class="field" for="sgdb-key">
          <span class="txt"
            ><span class="lbl">Clé API SteamGridDB <span class="meta">(facultatif)</span></span><span class="meta"
              >Trouve les jaquettes et bannières des jeux absents de Steam (Hytale, Roblox, VALORANT...). Clé
              gratuite sur steamgriddb.com, menu Préférences puis API.</span
            ></span
          >
        </label>
        <div class="keyrow">
          <input
            id="sgdb-key"
            type={showKey ? 'text' : 'password'}
            autocomplete="off"
            spellcheck="false"
            placeholder="Colle ta clé ici"
            bind:value={gridKey}
            onblur={() => saveGridKey()}
          />
          <button type="button" class="chip-btn" onclick={() => (showKey = !showKey)}
            >{showKey ? 'Masquer' : 'Afficher'}</button
          >
          <button type="submit" class="chip-btn" disabled={!keyDirty}>Enregistrer</button>
        </div>
      </form>
    </section>
  </div>

  <h2 class="group">À propos</h2>
  <div class="grid">
    <section class="card-section">
      <h3>Mise à jour</h3>
      <p class="desc">Hangar {version}. Les nouvelles versions s'installent sans repasser par l'installeur.</p>
      <div class="line">
        <span class="grow" aria-live="polite">{updater.label}</span>
        {#if updater.phase === 'available'}
          <button class="chip-btn primary" onclick={() => updater.install()}>Installer et redémarrer</button>
        {:else}
          <button
            class="chip-btn"
            disabled={updater.phase === 'checking' || updater.phase === 'installing'}
            onclick={() => updater.check()}
            ><Icon name="refresh" size={15} class={updater.phase === 'checking' ? 'spin' : ''} />Rechercher</button
          >
        {/if}
      </div>
    </section>
  </div>
</div>

<style>
  .page {
    flex: 1;
    padding: 8px 28px 48px;
  }

  h1 {
    font-size: 34px;
    font-weight: 800;
    letter-spacing: -0.9px;
  }

  .lead {
    margin: 6px 0 8px;
    color: var(--muted);
  }

  .group {
    margin: 28px 0 12px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--muted);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
    gap: 18px;
    align-items: start;
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;
  }

  .gridkey {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 0 2px;
    border-top: 1px solid var(--border-1);
  }

  .gridkey .lbl {
    color: var(--text);
    font-size: 14px;
  }

  .gridkey .txt {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  /* La description est longue : elle passe à la ligne (les autres .meta restent sur une ligne). */
  .gridkey .meta {
    white-space: normal;
    line-height: 1.45;
  }

  .gridkey .lbl .meta {
    white-space: nowrap;
  }

  .keyrow {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .keyrow input {
    flex: 1;
    min-width: 0;
    height: 36px;
    padding: 0 12px;
    border-radius: 10px;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    color: var(--strong);
    font-family: var(--mono);
    font-size: 13px;
    outline: none;
  }

  .keyrow input:focus {
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    box-shadow: 0 0 0 4px var(--accent-soft);
  }

  .tag {
    flex-shrink: 0;
    height: 22px;
    padding: 0 9px;
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 600;
    white-space: nowrap;
  }

  .tag.conn {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .tag.ok {
    background: rgba(46, 204, 113, 0.14);
    color: #3fcf7f;
  }

  .tag.off {
    background: rgb(var(--ink) / 0.05);
    color: var(--muted);
  }

  .acc .txt {
    min-width: 0;
  }

  .acc .meta {
    white-space: normal;
  }

  .meta.err {
    color: #ff6b6b;
  }

  .note {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border-1);
    font-size: 12px;
    line-height: 1.45;
    color: var(--muted);
  }

  .chip-btn.primary {
    background: var(--accent);
    border-color: transparent;
    color: #fff;
    font-weight: 600;
  }

  .chip-btn.primary:hover {
    background: color-mix(in srgb, var(--accent) 85%, #fff);
  }

  .chip-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .mb6 {
    margin-bottom: 6px;
  }

  .line {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-top: 1px solid var(--border-1);
    min-width: 0;
  }

  .line.pref {
    padding: 12px 0;
  }

  /* Descriptions des réglages : à la ligne si la colonne est étroite. */
  .line.pref .meta {
    white-space: normal;
  }

  .grow {
    flex: 1;
    min-width: 0;
  }

  .txt {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .ell {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
  }

  .none {
    font-size: 13px;
    color: var(--muted);
    padding: 10px 0 2px;
    border-top: 1px solid var(--border-1);
  }

  .folder {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    background: rgb(var(--ink) / 0.04);
    margin-bottom: 8px;
    min-width: 0;
  }

  .path {
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .remove {
    font-size: 12px;
    font-weight: 600;
    color: var(--danger-text);
    padding: 3px 8px;
    border-radius: 7px;
    opacity: 0;
    transition:
      opacity 0.15s,
      background 0.15s;
  }

  .swap {
    display: grid;
    justify-items: end;
    align-items: center;
  }

  .swap > * {
    grid-area: 1 / 1;
  }

  .cnt {
    transition: opacity 0.15s;
  }

  .folder:hover .remove,
  .remove:focus-visible {
    opacity: 1;
  }

  .folder:hover .cnt,
  .folder:focus-within .cnt {
    opacity: 0;
  }

  .remove:hover {
    background: rgba(229, 72, 77, 0.12);
  }

  .chip-btn {
    height: 34px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: 999px;
    border: 1px solid rgb(var(--ink) / 0.09);
    background: rgb(var(--ink) / 0.03);
    font-size: 13px;
    color: var(--text-3);
    transition: all 0.18s;
    flex-shrink: 0;
  }

  .chip-btn:hover {
    background: var(--surface-3);
    color: var(--strong);
  }

  .chip-btn.add {
    margin-top: 4px;
  }

  .swatches {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .sw {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    transition:
      transform 0.2s,
      box-shadow 0.2s;
  }

  .sw:hover {
    transform: scale(1.1);
  }

  .sw.on {
    box-shadow:
      0 0 0 3px var(--bg),
      0 0 0 5px var(--strong);
  }

  /* Pastille personnalisée : l'<input type="color"> invisible la recouvre et ouvre le sélecteur. */
  .custom {
    position: relative;
    display: grid;
    place-items: center;
    cursor: pointer;
    color: #fff;
    background: conic-gradient(#f2556b, #f59e0b, #22c55e, #22b8f0, #7c6cff, #f2556b);
  }

  .custom input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .custom:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .hex {
    text-transform: uppercase;
  }
</style>
