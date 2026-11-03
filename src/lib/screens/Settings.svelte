<script lang="ts">
  // Paramètres : stores, dossiers locaux, accent, comportement, jeux masqués, jeux ajoutés.
  import { addFolder, removeFolder } from '../actions';
  import { api } from '../api';
  import Icon from '../components/Icon.svelte';
  import Toggle from '../components/Toggle.svelte';
  import { ACCENTS, STORE_ORDER, STORES } from '../stores-meta';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Prefs } from '../types';
  import { art } from '../art.svelte';
  import { plural } from '../util/format';

  const stores = $derived(STORE_ORDER.filter((s) => s !== 'manual' || (library.countsAll.manual ?? 0) > 0));
  const hidden = $derived(library.all.filter((g) => library.state.hidden.includes(g.id)));

  function folderCount(dir: string): number {
    const d = dir.toLowerCase().replace(/[\\/]+$/, '') + '\\';
    return library.all.filter((g) => g.store === 'local' && (g.installDir ?? '').toLowerCase().startsWith(d)).length;
  }

  const prefs: { key: keyof Prefs; label: string; desc: string }[] = [
    {
      key: 'minimizeOnLaunch',
      label: "Réduire Hangar au lancement d'un jeu",
      desc: 'La fenêtre revient quand tu quittes le jeu'
    },
    { key: 'startWithWindows', label: 'Démarrer avec Windows', desc: "Hangar s'ouvre en arrière-plan à la connexion" },
    { key: 'autoCovers', label: 'Jaquettes automatiques', desc: 'Recherche les jaquettes des jeux hors Steam' }
  ];

  async function setPref(key: keyof Prefs, on: boolean) {
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
    if (key === 'autoCovers' && on) art.resolveSteamIds();
  }

  function setAccent(c: string) {
    library.state.accent = c;
    library.save();
  }
</script>

<div class="screen scroll page">
  <h1>Paramètres</h1>
  <p class="lead">Sources de ta bibliothèque, apparence et comportement au lancement.</p>
  <div class="grid">
    <div class="col">
      <section class="card-section">
        <h2>Stores détectés</h2>
        <p class="desc">Hangar cherche automatiquement les jeux de ces launchers.</p>
        {#each stores as s (s)}
          {@const on = !library.state.disabledStores.includes(s)}
          <div class="line">
            <span class="sdot" style:background={STORES[s].color}></span>
            <span class="grow">{STORES[s].label}</span>
            <span class="meta">{plural(library.countsAll[s] ?? 0, 'jeu', 'jeux')}</span>
            <Toggle {on} label="Activer {STORES[s].label}" onchange={(v) => library.setStoreEnabled(s, v)} />
          </div>
        {/each}
      </section>

      <section class="card-section">
        <h2>Jeux masqués</h2>
        <p class="desc">Ils restent installés, Hangar ne les affiche simplement plus.</p>
        {#each hidden as g (g.id)}
          <div class="line">
            <span class="sdot" style:background={STORES[g.store].color}></span>
            <span class="grow ell">{library.name(g)}</span>
            <button class="chip-btn" onclick={() => library.unhide(g.id)}><Icon name="eye" size={15} />Afficher</button>
          </div>
        {:else}
          <p class="none">Aucun jeu masqué.</p>
        {/each}
      </section>
    </div>

    <div class="col">
      <section class="card-section">
        <h2>Dossiers de jeux locaux</h2>
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
        <h2 class="mb">Couleur d'accent</h2>
        <div class="swatches" role="radiogroup" aria-label="Couleur d'accent">
          {#each ACCENTS as a (a.color)}
            {@const on = library.state.accent.toLowerCase() === a.color}
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
      </section>

      <section class="card-section">
        <h2 class="mb6">Comportement</h2>
        {#each prefs as p (p.key)}
          <div class="line pref">
            <span class="grow txt"><span>{p.label}</span><span class="meta">{p.desc}</span></span>
            <Toggle on={library.state.prefs[p.key]} label={p.label} onchange={(v) => setPref(p.key, v)} />
          </div>
        {/each}
      </section>

      <section class="card-section">
        <h2>Jeux ajoutés à la main</h2>
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
  }

  .lead {
    margin: 6px 0 26px;
    color: var(--muted);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
    gap: 18px;
    align-items: start;
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;
  }

  .mb {
    margin-bottom: 14px;
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

  .sdot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
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
    background: rgba(255, 255, 255, 0.04);
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
    border: 1px solid rgba(255, 255, 255, 0.09);
    background: rgba(255, 255, 255, 0.03);
    font-size: 13px;
    color: var(--text-3);
    transition: all 0.18s;
    flex-shrink: 0;
  }

  .chip-btn:hover {
    background: var(--surface-3);
    color: #fff;
  }

  .chip-btn.add {
    margin-top: 4px;
  }

  .swatches {
    display: flex;
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
      0 0 0 3px #0f1117,
      0 0 0 5px #fff;
  }
</style>
