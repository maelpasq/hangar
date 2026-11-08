<script lang="ts">
  // Paramètres : une navigation par section à gauche, une section à la fois à droite.
  // Chaque section est une suite de groupes (carte) faits de lignes « libellé + aide | réglage ».
  import { addFolder, removeFolder } from '../actions';
  import { api } from '../api';
  import { art } from '../art.svelte';
  import Icon, { type IconName } from '../components/Icon.svelte';
  import Segmented from '../components/Segmented.svelte';
  import StoreLogo from '../components/StoreLogo.svelte';
  import Toggle from '../components/Toggle.svelte';
  import { ACCENTS, STORE_ORDER, STORES } from '../stores-meta';
  import { accounts } from '../stores/accounts.svelte';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import { updater } from '../stores/update.svelte';
  import { runner } from '../stores/runner.svelte';
  import type { AccountStatus, Prefs, StoreId, Theme } from '../types';
  import { plural, relativeDay } from '../util/format';
  import { isLinux, isMac } from '../util/platform';

  type SectionId = 'general' | 'appearance' | 'launchers' | 'library' | 'covers';

  const os = isMac ? 'macOS' : isLinux ? 'Linux' : 'Windows';

  let section = $state<SectionId>('general');
  let version = $state('');
  api.appVersion().then(
    (v) => (version = v),
    () => {}
  );
  void accounts.refresh();

  const connectedCount = $derived(accounts.list.filter((a) => a.connected).length);
  const hidden = $derived(library.all.filter((g) => library.state.hidden.includes(g.id)));
  const stores = $derived(STORE_ORDER.filter((s) => s !== 'manual' || (library.countsAll.manual ?? 0) > 0));

  const sections = $derived<{ id: SectionId; label: string; title?: string; icon: IconName; badge?: number }[]>([
    { id: 'general', label: 'Général', icon: 'sliders' },
    { id: 'appearance', label: 'Apparence', icon: 'sun' },
    {
      id: 'launchers',
      label: 'Launchers',
      title: 'Launchers et comptes',
      icon: 'grid',
      badge: connectedCount || undefined
    },
    { id: 'library', label: 'Bibliothèque', icon: 'folder' },
    { id: 'covers', label: 'Jaquettes', icon: 'image' }
  ]);
  const current = $derived(sections.find((s) => s.id === section)!);

  const intro: Record<SectionId, string> = {
    general: 'Comportement de Hangar et mises à jour.',
    appearance: "Thème et couleur de l'interface.",
    launchers:
      'Les launchers où Hangar cherche tes jeux. Relie un compte pour retrouver aussi ceux qui ne sont pas sur cet appareil.',
    library: 'Dossiers de jeux, ajouts à la main et jeux masqués.',
    covers: 'Où Hangar trouve les jaquettes et les bannières.'
  };

  function go(id: SectionId) {
    section = id;
    document.querySelector('.settings-page')?.scrollTo({ top: 0 });
  }

  // ─── Réglages simples ───

  type BoolPref = Exclude<keyof Prefs, 'steamGridDbKey' | 'webGames'>;

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
    // Discord : la présence en cours s'affiche ou s'efface tout de suite.
    if (key === 'discordPresence') {
      if (on) runner.syncPresence();
      else api.setPresence(null, 0).catch(() => {});
    }
  }

  const tray = isMac ? 'la barre des menus' : 'la zone de notification';

  const themes: { value: Theme; label: string }[] = [
    { value: 'dark', label: 'Sombre' },
    { value: 'light', label: 'Clair' },
    { value: 'system', label: 'Appareil' }
  ];

  function setTheme(t: Theme) {
    library.state.theme = t;
    library.save();
  }

  const accent = $derived(library.state.accent.toLowerCase());
  const custom = $derived(!ACCENTS.some((a) => a.color === accent));

  // Pendant le glisser du sélecteur : aperçu en direct, enregistrement au relâcher.
  function setAccent(c: string, save = true) {
    library.state.accent = c;
    if (save) library.save();
  }

  // ─── Launchers et comptes ───

  /** Tag d'un store : Connecté, Détecté (launcher ou jeux trouvés), Non trouvé. */
  function tag(s: StoreId): { label: string; kind: 'conn' | 'ok' | 'off' } | null {
    if (s === 'local' || s === 'manual') return null;
    const a = accounts.byStore.get(s);
    if (a?.connected) return { label: 'Connecté', kind: 'conn' };
    if (a?.detected || (library.countsAll[s] ?? 0) > 0) return { label: 'Détecté', kind: 'ok' };
    return { label: 'Non trouvé', kind: 'off' };
  }

  let steamKey = $state('');
  let showSteamKey = $state(false);
  /** Formulaire de la clé Steam, déplié sous la ligne Steam. */
  let steamOpen = $state(false);

  async function connectSteam(e: Event) {
    e.preventDefault();
    if (await accounts.connectSteam(steamKey)) {
      steamKey = '';
      steamOpen = false;
    }
  }

  /** Aide d'une ligne de launcher : jeux trouvés, puis ce que dit le compte relié. */
  function storeHint(s: StoreId, a: AccountStatus | undefined): string {
    const here = plural(library.countsAll[s] ?? 0, 'jeu', 'jeux');
    if (!a?.connected) return here;
    const synced = a.syncedAt ? `, synchronisé ${relativeDay(a.syncedAt).toLowerCase()}` : '';
    return `${here} · ${plural(a.games, 'jeu', 'jeux')} sur le compte${synced}`;
  }

  // ─── Bibliothèque ───

  function folderCount(dir: string): number {
    // Chemins Windows (\) et macOS (/) comparés sous la même forme.
    const norm = (p: string) => p.toLowerCase().replace(/\//g, '\\');
    const d = norm(dir).replace(/\\+$/, '') + '\\';
    return library.all.filter((g) => g.store === 'local' && norm(g.installDir ?? '').startsWith(d)).length;
  }

  // ─── Jaquettes ───

  let gridKey = $state(library.state.prefs.steamGridDbKey);
  let showGridKey = $state(false);
  const gridDirty = $derived(gridKey.trim() !== library.state.prefs.steamGridDbKey);

  function saveGridKey(e?: Event) {
    e?.preventDefault();
    const k = gridKey.trim();
    if (k === library.state.prefs.steamGridDbKey) return;
    library.state.prefs.steamGridDbKey = k;
    library.save();
    art.reset();
    ui.toast(k ? 'Clé SteamGridDB enregistrée, recherche des jaquettes...' : 'Clé SteamGridDB retirée');
  }
</script>

{#snippet toggleRow(key: BoolPref, label: string, hint: string)}
  <div class="srow">
    <span class="txt"><span class="lbl">{label}</span><span class="hint">{hint}</span></span>
    <Toggle on={library.state.prefs[key]} {label} onchange={(v) => setPref(key, v)} />
  </div>
{/snippet}


<div class="screen scroll page settings-page">
  <h1>Paramètres</h1>

  <div class="layout">
    <nav class="subnav" aria-label="Sections des paramètres">
      {#each sections as s (s.id)}
        <button class="nav" class:on={section === s.id} aria-current={section === s.id ? 'page' : undefined} onclick={() => go(s.id)}>
          <Icon name={s.icon} size={17} />
          <span class="nl">{s.label}</span>
          {#if s.badge}<span class="badge num" aria-label="{s.badge} connecté{s.badge > 1 ? 's' : ''}">{s.badge}</span>{/if}
        </button>
      {/each}
    </nav>

    <div class="panel">
      {#key section}
        <header class="phead">
          <h2>{current.title ?? current.label}</h2>
          <p>{intro[section]}</p>
        </header>

        <div class="groups">
          {#if section === 'general'}
            <section class="group" aria-label="Comportement">
              <h3>Comportement</h3>
              {@render toggleRow('minimizeOnLaunch', "Réduire Hangar au lancement d'un jeu", 'La fenêtre revient quand tu quittes le jeu.')}
              {@render toggleRow('startWithWindows', `Démarrer avec ${os}`, "Hangar s'ouvre en arrière-plan à la connexion.")}
              <div class="srow">
                <span class="txt"
                  ><span class="lbl">Jeux web</span><span class="hint">Onglet des jeux navigateur (.io et autres), ouverts dans une fenêtre Hangar.</span></span
                >
                <Toggle
                  on={library.state.prefs.webGames === true}
                  label="Jeux web"
                  onchange={(v) => {
                    library.state.prefs.webGames = v;
                    library.save();
                  }}
                />
              </div>
            </section>

            <section class="group" aria-label="Bureau">
              <h3>Bureau</h3>
              {@render toggleRow(
                'closeToTray',
                `Garder Hangar dans ${tray}`,
                `Fermer la fenêtre la cache ; ses jeux récents restent dans ${tray}. « Quitter Hangar » dans son menu ferme vraiment l'app.`
              )}
              {@render toggleRow(
                'globalShortcut',
                `Raccourci ${ui.desktop?.shortcut ?? 'Ctrl+Alt+H'}`,
                ui.desktop && !ui.desktop.shortcutOk && library.state.prefs.globalShortcut
                  ? 'Un autre programme utilise déjà ce raccourci.'
                  : "Affiche ou cache Hangar depuis n'importe quelle app."
              )}
              {#if ui.desktop?.presenceAvailable}
                {@render toggleRow(
                  'discordPresence',
                  'Afficher mon jeu sur Discord',
                  "Tes amis Discord voient « Joue à » avec le nom du jeu. Passe par l'app Discord de cet appareil."
                )}
              {/if}
              <div class="srow">
                <span class="txt"
                  ><span class="lbl">Mode manette</span><span class="hint"
                    >Plein écran, à la manette ou au clavier. Le bouton Start l'ouvre aussi.</span
                  ></span
                >
                <button class="btn-s" onclick={() => (ui.big = true)}><Icon name="gamepad" size={15} />Ouvrir</button>
              </div>
              <div class="srow">
                <span class="txt"
                  ><span class="lbl">Configuration de départ</span><span class="hint"
                    >Launchers, jeux locaux, couleur et jeux web, en quatre étapes.</span
                  ></span
                >
                <button class="btn-s" onclick={() => (ui.modal = { kind: 'onboarding' })}>Revoir</button>
              </div>
            </section>

            <section class="group" aria-label="Mise à jour">
              <h3>Mise à jour</h3>
              <div class="srow">
                <span class="txt">
                  <span class="lbl">Hangar {version}</span>
                  <span class="hint" aria-live="polite">{updater.label}</span>
                </span>
                {#if updater.phase === 'available'}
                  <button class="btn-s primary" onclick={() => updater.install()}>Installer et redémarrer</button>
                {:else}
                  <button
                    class="btn-s"
                    disabled={updater.phase === 'checking' || updater.phase === 'installing'}
                    onclick={() => updater.check()}
                    ><Icon name="refresh" size={15} class={updater.phase === 'checking' ? 'spin' : ''} />Rechercher</button
                  >
                {/if}
              </div>
            </section>
          {:else if section === 'appearance'}
            <section class="group" aria-label="Thème">
              <h3>Thème</h3>
              <div class="srow">
                <span class="txt"
                  ><span class="lbl">Mode</span><span class="hint">« Appareil » suit le réglage clair ou sombre de {os}.</span></span
                >
                <Segmented value={library.state.theme} options={themes} label="Thème" onchange={setTheme} />
              </div>
            </section>

            <section class="group" aria-label="Couleur d'accent">
              <h3>Couleur d'accent</h3>
              <div class="srow">
                <span class="txt"
                  ><span class="lbl">Teinte</span><span class="hint">Boutons, sélection et lueurs.</span></span
                >
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
                    {#if !custom}<Icon name="plus" size={15} stroke={2.2} />{/if}
                    <input
                      type="color"
                      value={accent}
                      oninput={(e) => setAccent(e.currentTarget.value, false)}
                      onchange={(e) => setAccent(e.currentTarget.value)}
                    />
                  </label>
                </div>
              </div>
            </section>
          {:else if section === 'launchers'}
            <section class="group" aria-label="Launchers et comptes">
              <h3>Tes launchers</h3>
              {#each stores as s (s)}
                {@const on = !library.state.disabledStores.includes(s)}
                {@const t = tag(s)}
                {@const a = accounts.byStore.get(s)}
                <div class="srow" class:off={!on}>
                  <span class="ico"><StoreLogo store={s} size={20} /></span>
                  <span class="txt">
                    <span class="lbl ell"
                      >{STORES[s].label}{#if a?.connected && a.user}<span class="user"> · {a.user}</span>{/if}</span
                    >
                    {#if a?.connected && a.error}
                      <span class="hint err">{a.error}</span>
                    {:else}
                      <span class="hint">{storeHint(s, a)}</span>
                    {/if}
                  </span>
                  {#if t}<span class="tag {t.kind}">{t.label}</span>{/if}
                  {#if a?.connectable}
                    {#if a.connected}
                      <button class="btn-s" onclick={() => accounts.disconnect(s)}>Déconnecter</button>
                    {:else if s === 'steam'}
                      <button
                        class="btn-s"
                        class:primary={!steamOpen}
                        aria-expanded={steamOpen}
                        aria-controls="steam-form"
                        onclick={() => (steamOpen = !steamOpen)}>{steamOpen ? 'Annuler' : 'Relier'}</button
                      >
                    {:else}
                      <button class="btn-s primary" disabled={!!accounts.busy} onclick={() => accounts.connect(s)}
                        >{accounts.busy === s ? 'Connexion...' : 'Relier'}</button
                      >
                    {/if}
                  {/if}
                  <Toggle {on} label="Activer {STORES[s].label}" onchange={(v) => library.setStoreEnabled(s, v)} />
                </div>
                {#if s === 'steam' && steamOpen && !a?.connected}
                  <form class="sub" id="steam-form" onsubmit={connectSteam}>
                    <label class="lbl" for="steam-key">Clé d'API Web Steam</label>
                    <span class="hint"
                      >Pour tous tes jeux Steam et ton temps de jeu. Crée ta clé personnelle (nom de domaine :
                      « localhost »), puis colle-la ici.</span
                    >
                    <div class="sfield">
                    <input
                      id="steam-key"
                      type={showSteamKey ? 'text' : 'password'}
                      autocomplete="off"
                      spellcheck="false"
                      maxlength="64"
                      placeholder="32 caractères"
                      bind:value={steamKey}
                    />
                    <button type="button" class="btn-s" onclick={() => (showSteamKey = !showSteamKey)}
                      >{showSteamKey ? 'Masquer' : 'Afficher'}</button
                    >
                    <button type="button" class="btn-s" onclick={() => api.openLink('steam-api-key').catch(() => {})}
                      >Créer ma clé</button
                    >
                    <button type="submit" class="btn-s primary" disabled={!steamKey.trim() || !!accounts.busy}
                      >{accounts.busy === 'steam' ? 'Vérification...' : 'Connecter'}</button
                    >
                  </div>
                </form>
                {/if}
              {/each}
            </section>

            <aside class="trust">
              <Icon name="check" size={16} stroke={2.2} />
              <p>
                « Relier » ouvre la page de connexion officielle du launcher : Hangar ne voit jamais ton mot de passe.
                Clés et jetons restent dans le coffre de {os}, jamais dans les fichiers de Hangar. Ubisoft Connect, EA app,
                Battle.net et Xbox n'offrent pas de connexion sûre aux apps tierces : Hangar y lit seulement les jeux de
                cet appareil.
              </p>
            </aside>

            <section class="group" aria-label="Jeux non installés">
              <h3>Jeux non installés</h3>
              {@render toggleRow(
                'showUninstalled',
                'Afficher les jeux non installés',
                'Onglet « À installer » avec les jeux de tes launchers qui ne sont pas sur cet appareil.'
              )}
            </section>
          {:else if section === 'library'}
            <section class="group" aria-label="Dossiers de jeux locaux">
              <h3>Dossiers de jeux locaux</h3>
              <p class="gdesc">Chaque sous-dossier devient un jeu. Le launcher du jeu est lancé en priorité.</p>
              {#each library.state.localFolders as f (f)}
                <div class="srow">
                  <span class="ico"><Icon name="folder" size={18} /></span>
                  <span class="txt"><span class="lbl mono ell">{f}</span><span class="hint">{plural(folderCount(f), 'jeu', 'jeux')}</span></span>
                  <button class="btn-s danger" aria-label="Retirer {f}" onclick={() => removeFolder(f)}>Retirer</button>
                </div>
              {/each}
              <div class="srow actions">
                <button class="btn-s" onclick={addFolder}><Icon name="plus" size={15} stroke={2} />Ajouter un dossier</button>
              </div>
            </section>

            <section class="group" aria-label="Jeux ajoutés à la main">
              <h3>Jeux ajoutés à la main</h3>
              {#each library.state.manualGames as g (g.id)}
                <div class="srow">
                  <span class="txt"><span class="lbl ell">{library.name(g)}</span><span class="hint mono ell">{g.launch.target}</span></span>
                  <button class="btn-s danger" onclick={() => library.removeManual(g.id)}><Icon name="trash" size={15} />Retirer</button>
                </div>
              {:else}
                <p class="sempty">Aucun jeu ajouté à la main.</p>
              {/each}
              <div class="srow actions">
                <button class="btn-s" onclick={() => { ui.modal = { kind: 'add' }; }}
                  ><Icon name="plus" size={15} stroke={2} />Ajouter un jeu</button
                >
              </div>
            </section>

            <section class="group" aria-label="Jeux masqués">
              <h3>Jeux masqués</h3>
              <p class="gdesc">Ils restent installés, Hangar ne les affiche simplement plus.</p>
              {#each hidden as g (g.id)}
                <div class="srow">
                  <span class="ico"><StoreLogo store={g.store} size={18} /></span>
                  <span class="txt"><span class="lbl ell">{library.name(g)}</span></span>
                  <button class="btn-s" onclick={() => library.unhide(g.id)}><Icon name="eye" size={15} />Afficher</button>
                </div>
              {:else}
                <p class="sempty">Aucun jeu masqué.</p>
              {/each}
            </section>
          {:else}
            <section class="group" aria-label="Jaquettes">
              <h3>Recherche automatique</h3>
              {@render toggleRow(
                'autoCovers',
                'Jaquettes automatiques',
                'Cherche la jaquette et la bannière de chaque jeu (store, Steam, SteamGridDB).'
              )}
            </section>

            <section class="group" aria-label="SteamGridDB">
              <h3>SteamGridDB <span class="opt">facultatif</span></h3>
              <form class="srow stack" onsubmit={saveGridKey}>
                <span class="txt">
                  <label class="lbl" for="sgdb-key">Clé API SteamGridDB</label>
                  <span class="hint"
                    >Trouve les images des jeux absents de Steam (Hytale, Roblox, VALORANT...). Clé gratuite sur
                    steamgriddb.com, menu Préférences puis API.</span
                  >
                </span>
                <div class="sfield">
                  <input
                    id="sgdb-key"
                    type={showGridKey ? 'text' : 'password'}
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="Colle ta clé ici"
                    bind:value={gridKey}
                    onblur={() => saveGridKey()}
                  />
                  <button type="button" class="btn-s" onclick={() => (showGridKey = !showGridKey)}
                    >{showGridKey ? 'Masquer' : 'Afficher'}</button
                  >
                  <button type="submit" class="btn-s primary" disabled={!gridDirty}>Enregistrer</button>
                </div>
              </form>
            </section>
          {/if}
        </div>
      {/key}
    </div>
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
    margin-bottom: 24px;
  }

  .layout {
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr);
    gap: 32px;
    align-items: start;
    max-width: 1080px;
  }

  /* ─── Navigation des sections ─── */

  .subnav {
    position: sticky;
    top: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .nav {
    position: relative;
    display: flex;
    align-items: center;
    gap: 11px;
    height: 40px;
    padding: 0 12px;
    border-radius: 11px;
    color: var(--text-nav);
    font-size: 14px;
    font-weight: 550;
    text-align: left;
    transition:
      background 0.18s,
      color 0.18s;
  }

  .nav:hover {
    background: var(--surface-2);
    color: var(--strong);
  }

  .nav.on {
    background: var(--surface-3);
    color: var(--strong);
  }

  .nav.on::before {
    content: '';
    position: absolute;
    left: -10px;
    top: 11px;
    bottom: 11px;
    width: 3px;
    border-radius: 3px;
    background: var(--accent);
  }

  .nav.on :global(svg) {
    color: var(--accent);
  }

  .nl {
    flex: 1;
  }

  .badge {
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 11.5px;
    font-weight: 700;
  }

  /* ─── Panneau ─── */

  .panel {
    min-width: 0;
  }

  .phead {
    margin-bottom: 18px;
    animation: hgFade 0.3s ease both;
  }

  .phead h2 {
    font-size: 22px;
    font-weight: 750;
    letter-spacing: -0.4px;
  }

  .phead p {
    margin-top: 5px;
    color: var(--muted);
    font-size: 13.5px;
  }

  .groups {
    display: flex;
    flex-direction: column;
    gap: 18px;
    animation: hgFade 0.35s ease both;
  }

  .group {
    padding: 6px 20px;
    border-radius: var(--r-section);
    background: var(--surface-1);
    border: 1px solid rgb(var(--ink) / 0.06);
    min-width: 0;
  }

  .group h3 {
    padding: 14px 0 4px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: var(--muted);
  }

  .opt {
    margin-left: 6px;
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
    color: var(--muted-2);
  }

  .gdesc {
    padding-bottom: 6px;
    font-size: 13px;
    color: var(--muted);
  }

  .srow {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 60px;
    padding: 12px 0;
    border-top: 1px solid var(--border-1);
    min-width: 0;
  }

  .group h3 + .srow,
  .gdesc + .srow {
    border-top: none;
  }

  /* Ligne avec un champ : le champ passe sous le texte. */
  .srow.stack {
    flex-wrap: wrap;
  }

  .srow.stack .sfield {
    flex-basis: 100%;
  }


  .srow.actions {
    min-height: 0;
    padding: 12px 0 14px;
  }

  .srow.off .lbl,
  .srow.off .ico {
    opacity: 0.5;
  }

  .ico {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: rgb(var(--ink) / 0.05);
    color: var(--text-3);
  }

  .txt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .lbl {
    font-size: 14px;
    font-weight: 550;
    color: var(--text);
  }

  .lbl.mono {
    font-size: 13px;
    font-weight: 500;
  }

  .user {
    font-weight: 450;
    color: var(--muted);
  }

  .hint {
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--muted);
  }

  .hint.err {
    color: var(--danger-text);
  }

  .ell {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sempty {
    padding: 4px 0 12px;
    font-size: 13px;
    color: var(--muted);
  }

  .tag {
    flex-shrink: 0;
    height: 22px;
    padding: 0 9px;
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 650;
    white-space: nowrap;
  }

  .tag.conn {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .tag.ok {
    background: color-mix(in srgb, var(--success) 14%, transparent);
    color: var(--success-text);
  }

  .tag.off {
    background: rgb(var(--ink) / 0.05);
    color: var(--muted);
  }

  /* ─── Champs et boutons ─── */

  .sfield {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .sfield input {
    flex: 1 1 220px;
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

  .sfield input:focus {
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    box-shadow: 0 0 0 4px var(--accent-soft);
  }

  .btn-s {
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
    white-space: nowrap;
    flex-shrink: 0;
    transition:
      background 0.18s,
      color 0.18s;
  }

  .btn-s:hover {
    background: var(--surface-3);
    color: var(--strong);
  }

  .btn-s.primary {
    background: var(--accent);
    border-color: transparent;
    color: #fff;
    font-weight: 600;
  }

  .btn-s.primary:hover {
    background: color-mix(in srgb, var(--accent) 85%, #fff);
  }

  .btn-s.danger:hover {
    background: color-mix(in srgb, var(--danger) 14%, transparent);
    color: var(--danger-text);
  }

  .btn-s:disabled {
    opacity: 0.45;
    cursor: default;
  }

  /* Formulaire déplié sous une ligne (clé Steam). */
  .sub {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 0 16px 46px;
    animation: hgFade 0.25s ease both;
  }

  .sub .sfield {
    margin-top: 6px;
  }

  /* ─── Encadré de confiance (Comptes) ─── */

  .trust {
    display: flex;
    gap: 12px;
    padding: 14px 18px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--success) 7%, transparent);
    border: 1px solid color-mix(in srgb, var(--success) 18%, transparent);
    color: var(--success-text);
  }

  .trust :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .trust p {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text-3);
  }

  /* ─── Couleur d'accent ─── */

  .swatches {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .sw {
    width: 30px;
    height: 30px;
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

  /* ─── Fenêtre étroite : la navigation passe au-dessus, en ligne. ─── */

  @media (max-width: 860px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
      gap: 20px;
    }

    .subnav {
      position: static;
      flex-direction: row;
      overflow-x: auto;
      padding-bottom: 4px;
      scrollbar-width: none;
    }

    .subnav::-webkit-scrollbar {
      display: none;
    }

    .nav {
      flex-shrink: 0;
    }

    .nav.on::before {
      left: 12px;
      right: 12px;
      top: auto;
      bottom: 3px;
      width: auto;
      height: 2px;
    }

    .sub {
      padding-left: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .phead,
    .groups {
      animation: none;
    }
  }
</style>
