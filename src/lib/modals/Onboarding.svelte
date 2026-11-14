<script lang="ts">
  // Configuration en six étapes courtes (launchers, jeux locaux, jaquettes, couleur, jeux web, onglet de départ), montrée une fois
  // à l'installation comme à qui avait déjà Hangar : les réglages affichés sont les siens.
  // Chaque choix s'applique tout de suite. « Tout passer » ou fermer garde les choix déjà faits
  // et laisse le reste tel quel (jeux web désactivés s'ils n'avaient jamais été proposés).
  import { addFolder } from '../actions';
  import Segmented from '../components/Segmented.svelte';
  import SteamGridSetup from '../components/SteamGridSetup.svelte';
  import StartPagePicker from '../components/StartPagePicker.svelte';
  import StoreLogo from '../components/StoreLogo.svelte';
  import Toggle from '../components/Toggle.svelte';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import { openStartPage } from '../start-page';
  import { ACCENTS, STORE_ORDER, STORES } from '../stores-meta';
  import { accounts } from '../stores/accounts.svelte';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { StoreId, Theme } from '../types';
  import { plural } from '../util/format';
  import games from '../web-games.json';

  const TITLES = ['Tes launchers', 'Tes jeux hors launcher', 'Tes jaquettes', 'Ta couleur', 'Les jeux web', 'Ton onglet de départ'];
  const PREVIEW = ['openfront', 'krunker', 'slither', 'skribbl'];
  const covers = import.meta.glob<string>('../../assets/web-games/*.webp', { eager: true, import: 'default' });
  const preview = PREVIEW.map((id) => covers[`../../assets/web-games/${id}.webp`]).filter(Boolean);
  const themes: { value: Theme; label: string }[] = [
    { value: 'dark', label: 'Sombre' },
    { value: 'light', label: 'Clair' },
    { value: 'system', label: 'Appareil' }
  ];

  let step = $state(0);
  let web = $state(library.state.prefs.webGames ?? true);
  // Qui avait Hangar avant les jeux web les découvre ici.
  const webIsNew = !library.fresh && library.state.prefs.webGames === null;
  const startIsNew = !library.fresh && library.state.prefs.startPage === null;
  const isNew = (i: number) =>
    (i === 2 && !library.fresh && !library.state.prefs.steamGridDb) || (i === 4 && webIsNew) || (i === 5 && startIsNew);
  void accounts.refresh();

  // Launchers trouvés sur l'appareil en premier.
  const launchers = $derived(
    STORE_ORDER.filter((s) => s !== 'local' && s !== 'manual')
      .map((s) => ({ s, found: !!accounts.byStore.get(s)?.detected || (library.countsAll[s] ?? 0) > 0 }))
      .sort((a, b) => +b.found - +a.found)
  );
  const on = (s: StoreId) => !library.state.disabledStores.includes(s);
  const accent = $derived(library.state.accent.toLowerCase());
  const custom = $derived(!ACCENTS.some((a) => a.color === accent));

  // Pendant le glisser du sélecteur : aperçu en direct, enregistrement au relâcher.
  function setAccent(c: string, save = true) {
    library.state.accent = c;
    if (save) library.save();
  }

  function finish(webOn: boolean) {
    library.state.prefs.webGames = webOn;
    const start = library.state.prefs.startPage;
    library.state.prefs.startPage = start === null || (start === 'web' && !webOn) ? 'home' : start;
    library.state.onboarded = true;
    library.save();
    ui.modal = null;
    openStartPage();
  }

  function enableAll() {
    library.state.disabledStores = [];
    finish(true);
  }

  const skip = () => finish(library.state.prefs.webGames ?? false);
  const next = () => (step < TITLES.length - 1 ? step++ : finish(web));
</script>

<Modal title={TITLES[step]} onclose={skip} width={520}>
  <div class="dots">
    {#each TITLES as t, i (t)}
      <button
        class="dot"
        class:on={i === step}
        aria-label="Étape {i + 1} sur {TITLES.length} : {t}"
        aria-current={i === step ? 'step' : undefined}
        onclick={() => (step = i)}
      ></button>
    {/each}
    {#if isNew(step)}<span class="new">Nouveau</span>{/if}
  </div>

  {#key step}
    <div class="pane">
      {#if step === 0}
        <p class="txt">Hangar cherche tes jeux dans ces launchers. Désactive ceux que tu n'utilises pas.</p>
        <div class="grid">
          {#each launchers as { s, found } (s)}
            <div class="opt" class:off={!on(s)}>
              <StoreLogo store={s} size={18} />
              <span class="name">{STORES[s].label}{#if found}<span class="tag">Détecté</span>{/if}</span>
              <Toggle on={on(s)} label="Activer {STORES[s].label}" onchange={(v) => library.setStoreEnabled(s, v)} />
            </div>
          {/each}
        </div>
      {:else if step === 1}
        <p class="txt">
          Les jeux installés sans launcher, et ceux de tes dossiers de jeux : chaque sous-dossier devient un jeu.
        </p>
        <div class="opt" class:off={!on('local')}>
          <Icon name="folder" size={18} />
          <span class="name"
            >Jeux locaux{#if library.state.localFolders.length}<span class="tag"
                >{plural(library.state.localFolders.length, 'dossier', 'dossiers')}</span
              >{/if}</span
          >
          <Toggle on={on('local')} label="Activer les jeux locaux" onchange={(v) => library.setStoreEnabled('local', v)} />
        </div>
        <button class="btn add" onclick={addFolder}><Icon name="plus" size={15} stroke={2} />Ajouter un dossier</button>
      {:else if step === 2}
        <p class="txt">
          Hangar trouve seul les jaquettes des jeux Steam. Pour les autres (Riot, Battle.net, Minecraft, jeux locaux...), il
          lui faut une clé <strong>SteamGridDB</strong> : un site communautaire gratuit d'images de jeux. Sans elle, ces
          jeux gardent une jaquette générée. Deux minutes suffisent.
        </p>
        <SteamGridSetup id="onb-sgdb-key" />
      {:else if step === 3}
        <p class="txt">La teinte des boutons, de la sélection et des lueurs, sur fond sombre ou clair.</p>
        <div class="swatches">
          <div class="swatches" role="radiogroup" aria-label="Couleur d'accent">
            {#each ACCENTS as a (a.color)}
              <button
                class="sw"
                class:on={accent === a.color}
                role="radio"
                aria-checked={accent === a.color}
                aria-label="Accent {a.name}"
                title={a.name}
                style:background={a.color}
                onclick={() => setAccent(a.color)}
              ></button>
            {/each}
          </div>
          <label class="sw custom" class:on={custom} title="Couleur personnalisée" style:background={custom ? accent : undefined}>
            <span class="sr-only">Couleur personnalisée</span>
            {#if !custom}<Icon name="plus" size={17} stroke={2.2} />{/if}
            <input
              type="color"
              value={accent}
              oninput={(e) => setAccent(e.currentTarget.value, false)}
              onchange={(e) => setAccent(e.currentTarget.value)}
            />
          </label>
        </div>
        <Segmented
          value={library.state.theme}
          options={themes}
          label="Thème"
          onchange={(t) => {
            library.state.theme = t;
            library.save();
          }}
        />
      {:else if step === 5}
        <p class="txt">L'onglet sur lequel Hangar s'ouvre à chaque démarrage.</p>
        <StartPagePicker webGames={web} />
      {:else}
        <div class="strip" aria-hidden="true">
          {#each preview as src (src)}<img {src} alt="" />{/each}
        </div>
        <div class="opt">
          <Icon name="globe" size={18} />
          <span class="name">{plural(games.length, 'jeu', 'jeux')} navigateur, sans rien installer</span>
          <Toggle on={web} label="Activer les jeux web" onchange={(v) => (web = v)} />
        </div>
      {/if}
    </div>
  {/key}
  <p class="hint">Tout se change ensuite dans les Paramètres.</p>

  {#snippet footer()}
    <button class="btn skip" onclick={skip}>Tout passer</button>
    <button class="btn" onclick={enableAll}>Tout activer</button>
    <button class="btn primary autofocus" onclick={next}>{step < TITLES.length - 1 ? 'Suivant' : 'Terminer'}</button>
  {/snippet}
</Modal>

<style>
  .dots {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .new {
    margin-left: 6px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: rgb(var(--ink) / 0.18);
    transition:
      width 0.25s var(--ease),
      background 0.25s;
  }

  .dot.on {
    width: 22px;
    background: var(--accent);
  }

  .pane {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 250px;
    animation: hgFade 0.2s both;
  }

  .txt {
    color: var(--text-3);
    line-height: 1.5;
  }

  .txt strong {
    color: var(--strong);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
  }

  .opt {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 8px 8px 12px;
    border-radius: 10px;
    background: rgb(var(--ink) / 0.05);
    transition: opacity 0.2s;
  }

  .opt.off {
    opacity: 0.55;
  }

  .name {
    flex: 1;
    min-width: 0;
    font-weight: 600;
    font-size: 13.5px;
  }

  .tag {
    margin-left: 8px;
    font-size: 11px;
    font-weight: 600;
    color: var(--accent-text);
  }

  .add {
    align-self: flex-start;
  }

  .swatches {
    display: flex;
    gap: 14px;
  }

  .sw {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    transition:
      transform 0.2s,
      box-shadow 0.2s;
  }

  .sw:hover {
    transform: scale(1.08);
  }

  .sw.on {
    box-shadow:
      0 0 0 3px var(--panel),
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

  .strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .strip img {
    width: 100%;
    aspect-ratio: 16 / 10;
    object-fit: cover;
    border-radius: 8px;
  }

  .hint {
    font-size: 13px;
    color: var(--muted);
  }

  .skip {
    margin-right: auto;
    border-color: transparent;
    background: none;
    color: var(--text-3);
  }
</style>
