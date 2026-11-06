<script lang="ts">
  // Première ouverture : quatre étapes courtes (launchers, jeux locaux, couleur, jeux web).
  // Chaque choix s'applique tout de suite. « Tout passer » ou fermer garde les choix déjà faits
  // et laisse le reste tel quel (jeux web désactivés sur une installation neuve).
  import { addFolder } from '../actions';
  import Segmented from '../components/Segmented.svelte';
  import StoreLogo from '../components/StoreLogo.svelte';
  import Toggle from '../components/Toggle.svelte';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import { ACCENTS, STORE_ORDER, STORES } from '../stores-meta';
  import { accounts } from '../stores/accounts.svelte';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { StoreId, Theme } from '../types';
  import { plural } from '../util/format';
  import games from '../web-games.json';

  const TITLES = ['Tes launchers', 'Tes jeux hors launcher', 'Ta couleur', 'Les jeux web'];
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
  void accounts.refresh();

  // Launchers trouvés sur l'appareil en premier.
  const launchers = $derived(
    STORE_ORDER.filter((s) => s !== 'local' && s !== 'manual')
      .map((s) => ({ s, found: !!accounts.byStore.get(s)?.detected || (library.countsAll[s] ?? 0) > 0 }))
      .sort((a, b) => +b.found - +a.found)
  );
  const on = (s: StoreId) => !library.state.disabledStores.includes(s);
  const accent = $derived(library.state.accent.toLowerCase());

  function finish(webOn: boolean) {
    library.state.prefs.webGames = webOn;
    library.save();
    ui.modal = null;
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
        <p class="txt">La teinte des boutons, de la sélection et des lueurs, sur fond sombre ou clair.</p>
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
              onclick={() => {
                library.state.accent = a.color;
                library.save();
              }}
            ></button>
          {/each}
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
    gap: 6px;
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
