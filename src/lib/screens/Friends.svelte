<script lang="ts">
  // Page Amis (docs/COMPTE.md, phase 7) : à gauche la recherche, les demandes et la liste des amis
  // avec leur statut ; à droite la conversation ouverte, sinon le code ami et l'activité des amis.
  import Chat from '../components/Chat.svelte';
  import { contextMenu, userItems, userTarget } from '../menus';
  import Icon from '../components/Icon.svelte';
  import CertifiedMark from '../components/CertifiedMark.svelte';
  import SocialAvatar from '../components/SocialAvatar.svelte';
  import UserName from '../components/UserName.svelte';
  import { cloud } from '../stores/cloud.svelte';
  import { prettyCode, presenceLabel, social } from '../stores/social.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { ActivityItem, SocialUser } from '../types';
  import { plural, timeAgo } from '../util/format';
  import { suspensionText } from '../util/suspension';

  let query = $state('');
  let results = $state<SocialUser[] | null>(null);
  let searching = $state(false);
  let showBlocked = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const lists = $derived(social.lists);
  const online = $derived(lists.friends.filter((f) => f.presence.state === 'online' || f.presence.state === 'playing').length);
  const unreadOf = (id: string) => social.conversations.find((c) => c.with === id)?.unread ?? 0;

  function onQuery() {
    clearTimeout(timer);
    const q = query.trim();
    if (q.length < 2) {
      results = null;
      return;
    }
    searching = true;
    timer = setTimeout(async () => {
      try {
        results = await social.search(q);
      } catch (e) {
        ui.toast(String(e), { error: true });
        results = [];
      } finally {
        searching = false;
      }
    }, 300);
  }

  async function add(u: SocialUser) {
    if (await social.addFriend(u)) results = results?.map((r) => (r.id === u.id ? { ...r, relation: u.relation === 'in' ? 'friend' : 'out' } : r)) ?? null;
  }

  async function copyCode() {
    if (!social.settings) return;
    try {
      await navigator.clipboard.writeText(prettyCode(social.settings.code));
      ui.toast('Code ami copié.');
    } catch {
      ui.toast('Copie impossible.', { error: true });
    }
  }

  function describe(a: ActivityItem): string {
    if (a.kind === 'play') return `a lancé ${a.data.name ?? 'un jeu'}`;
    const n = a.data.count ?? a.data.games?.length ?? 0;
    const first = a.data.games?.[0]?.name;
    if (n <= 1 && first) return `a ajouté ${first} à sa bibliothèque`;
    return `a ajouté ${plural(n, 'jeu', 'jeux')} à sa bibliothèque${first ? ` (${a.data.games!.map((g) => g.name).slice(0, 3).join(', ')}${n > 3 ? '...' : ''})` : ''}`;
  }
</script>

{#snippet person(u: SocialUser, sub: string)}
  <SocialAvatar id={u.id} name={u.name} version={u.avatar} size={38} presence={u.relation === 'friend' ? u.presence : null} />
  <span class="ptxt">
    <span class="pn"><UserName name={u.name} certified={u.certified} /></span>
    <span class="ps ell" class:playing={u.presence.state === 'playing' && u.relation === 'friend'}>{sub}</span>
  </span>
{/snippet}

<div class="screen page">
  {#if !cloud.status.connected}
    <div class="gate">
      <span class="gico"><Icon name="users" size={30} /></span>
      <h1>Amis</h1>
      <p>Connecte-toi à ton compte Hangar pour ajouter tes amis, voir à quoi ils jouent et discuter avec eux.</p>
      <button class="btn primary" disabled={cloud.busy} onclick={() => cloud.login()}
        ><Icon name="user" size={16} />{cloud.busy ? 'Connexion en cours...' : 'Se connecter'}</button
      >
    </div>
  {:else if cloud.status.offline}
    <div class="gate">
      <span class="gico"><Icon name="globe" size={30} /></span>
      <h1>Amis</h1>
      <p>Le serveur du compte est injoignable. Tes amis reviendront avec la connexion.</p>
    </div>
  {:else if cloud.status.suspension}
    {@const t = suspensionText(cloud.status.suspension)}
    <div class="gate">
      <span class="gico"><Icon name="ban" size={30} /></span>
      <h1>{t.title}</h1>
      <p>{t.body}</p>
    </div>
  {:else if !social.settings}
    <div class="gate"><p>Chargement...</p></div>
  {:else if !social.settings.enabled}
    <div class="gate">
      <span class="gico"><Icon name="users" size={30} /></span>
      <h1>Amis</h1>
      <p>
        Active les amis pour être trouvé par ton pseudo ou ton code ami, voir qui est en ligne et à quoi jouent tes
        amis, et leur écrire. Tu choisis ce que tu partages, et avec qui, dans les Paramètres.
      </p>
      <div class="gbtns">
        <button class="btn primary" onclick={() => social.setEnabled(true)}><Icon name="check" size={16} />Activer les amis</button>
        <button class="btn" onclick={() => ui.settings('friends')}>Confidentialité</button>
      </div>
    </div>
  {:else}
    <div class="cols">
      <aside class="side scroll" aria-label="Amis et demandes">
        <div class="head">
          <h1>Amis</h1>
          <p>{lists.friends.length ? `${plural(online, 'ami en ligne', 'amis en ligne')} sur ${lists.friends.length}` : 'Ajoute tes premiers amis'}</p>
        </div>

        <form class="search" role="search" onsubmit={(e) => e.preventDefault()}>
          <label for="friend-search">Ajouter un ami</label>
          <div class="sbox">
            <Icon name={searching ? 'refresh' : 'search'} size={16} class={searching ? 'spin' : ''} />
            <input
              id="friend-search"
              type="search"
              autocomplete="off"
              maxlength="32"
              placeholder="Pseudo ou code ami"
              bind:value={query}
              oninput={onQuery}
            />
          </div>
        </form>

        {#if results}
          <section class="block" aria-label="Résultats de la recherche" aria-busy={searching}>
            {#each results as u (u.id)}
              <div class="prow" {@attach contextMenu(() => ({ label: u.name, items: () => userItems(u, { add: () => add(u) }) }))}>
                <button class="pmain" onclick={() => ui.profile(u.id)} aria-label="Voir le profil de {u.name}">
                  {@render person(u, u.relation === 'friend' ? 'Déjà ami' : u.relation === 'out' ? 'Demande envoyée' : u.relation === 'in' ? 'T\'a envoyé une demande' : 'Joueur Hangar')}
                </button>
                {#if u.relation === 'none' || u.relation === 'in'}
                  <button class="ibtn acc" aria-label="{u.relation === 'in' ? 'Accepter' : 'Ajouter'} {u.name}" title={u.relation === 'in' ? 'Accepter' : 'Ajouter'} onclick={() => add(u)}
                    ><Icon name={u.relation === 'in' ? 'check' : 'userPlus'} size={17} /></button
                  >
                {/if}
              </div>
            {:else}
              <p class="none">{searching ? 'Recherche...' : 'Personne ne correspond. Essaie son code ami.'}</p>
            {/each}
          </section>
        {/if}

        {#if lists.incoming.length}
          <section class="block" aria-label="Demandes reçues">
            <h2>Demandes reçues <span class="count num">{lists.incoming.length}</span></h2>
            {#each lists.incoming as u (u.id)}
              <div class="prow" {@attach contextMenu(() => ({ label: u.name, items: () => userItems(u) }))}>
                <button class="pmain" onclick={() => ui.profile(u.id)} aria-label="Voir le profil de {u.name}">
                  {@render person(u, u.since ? timeAgo(u.since) : 'Demande reçue')}
                </button>
                <button class="ibtn acc" aria-label="Accepter {u.name}" title="Accepter" onclick={() => social.addFriend(u)}
                  ><Icon name="check" size={17} /></button
                >
                <button class="ibtn" aria-label="Refuser {u.name}" title="Refuser" onclick={() => social.removeFriend(u)}
                  ><Icon name="x" size={17} /></button
                >
              </div>
            {/each}
          </section>
        {/if}

        <section class="block" aria-label="Tes amis">
          {#if lists.incoming.length || lists.outgoing.length}<h2>Tes amis <span class="count num">{lists.friends.length}</span></h2>{/if}
          {#each social.sortedFriends as u (u.id)}
            {@const unread = unreadOf(u.id)}
            <button
              class="prow pmain friend"
              class:on={social.chatWith === u.id}
              aria-current={social.chatWith === u.id ? 'true' : undefined}
              aria-label="{u.name}, {presenceLabel(u.presence)}{unread ? `, ${plural(unread, 'message non lu', 'messages non lus')}` : ''}"
              onclick={() => social.openChat(u.id)}
              {@attach contextMenu(() => ({ label: u.name, items: () => userItems(u) }))}
            >
              {@render person(u, presenceLabel(u.presence))}
              {#if unread}<span class="badge num" aria-hidden="true">{unread}</span>{/if}
            </button>
          {:else}
            {#if social.loaded && !results}
              <p class="none">Cherche un ami par son pseudo, ou donne-lui ton code ami.</p>
            {/if}
          {/each}
        </section>

        {#if lists.outgoing.length}
          <section class="block" aria-label="Demandes envoyées">
            <h2>Demandes envoyées <span class="count num">{lists.outgoing.length}</span></h2>
            {#each lists.outgoing as u (u.id)}
              <div class="prow" {@attach contextMenu(() => ({ label: u.name, items: () => userItems(u) }))}>
                <button class="pmain" onclick={() => ui.profile(u.id)} aria-label="Voir le profil de {u.name}">
                  {@render person(u, 'En attente')}
                </button>
                <button class="ibtn" aria-label="Annuler la demande à {u.name}" title="Annuler" onclick={() => social.removeFriend(u)}
                  ><Icon name="x" size={17} /></button
                >
              </div>
            {/each}
          </section>
        {/if}

        {#if lists.blocked.length}
          <section class="block" aria-label="Comptes bloqués">
            <button class="fold" aria-expanded={showBlocked} onclick={() => (showBlocked = !showBlocked)}
              >Comptes bloqués <span class="count num">{lists.blocked.length}</span></button
            >
            {#if showBlocked}
              {#each lists.blocked as u (u.id)}
                <div class="prow" {@attach contextMenu(() => ({ label: u.name, items: () => userItems(u) }))}>
                  <span class="pmain">{@render person(u, 'Bloqué')}</span>
                  <button class="btn-s" onclick={() => social.unblock(u)}>Débloquer</button>
                </div>
              {/each}
            {/if}
          </section>
        {/if}
      </aside>

      <div class="main">
        {#if social.chatWith}
          {#key social.chatWith}<Chat id={social.chatWith} />{/key}
        {:else}
          <div class="overview scroll">
            <section
              class="card code"
              aria-label="Ton code ami"
              {@attach contextMenu(() => ({
                label: 'Ton code ami',
                items: () => [
                  { label: 'Copier le code ami', icon: 'copy', run: copyCode },
                  { label: 'Voir mon profil', icon: 'user', run: () => ui.profile(social.me) },
                  { label: 'Confidentialité', icon: 'eyeOff', run: () => ui.settings('friends') }
                ]
              }))}
            >
              <div>
                <h2>Ton code ami</h2>
                <p>Donne-le à un ami : il te trouvera même si ton pseudo est caché.</p>
              </div>
              <span class="cval num">{prettyCode(social.settings.code)}</span>
              <button class="btn-s" onclick={copyCode}>Copier</button>
              <button class="btn-s" onclick={() => ui.profile(social.me)}><Icon name="user" size={15} />Mon profil</button>
            </section>

            <section class="card" aria-label="Activité de tes amis">
              <h2>Activité de tes amis</h2>
              {#each social.activity as a (a.id)}
                {@const u = social.user(a.userId ?? null)}
                <div class="act" {@attach contextMenu(() => userTarget(a.userId, a.userName ?? 'Joueur'))}>
                  <button class="aav" onclick={() => a.userId && ui.profile(a.userId)} aria-label="Profil de {a.userName}">
                    <SocialAvatar id={a.userId ?? ''} name={a.userName ?? '?'} version={u?.avatar ?? null} size={34} />
                  </button>
                  <p class="atxt"><strong>{a.userName}</strong>{#if u?.certified}<CertifiedMark size={13} />{/if} {describe(a)}</p>
                  <span class="when">{timeAgo(a.at)}</span>
                </div>
              {:else}
                <p class="none">
                  {lists.friends.length ? 'Rien de neuf pour l\'instant : les jeux lancés et ajoutés par tes amis apparaîtront ici.' : 'Ajoute des amis pour suivre leurs parties.'}
                </p>
              {/each}
            </section>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .page {
    flex: 1;
    min-height: 0;
    display: flex;
    padding: 8px 28px 24px;
  }

  .gate {
    margin: auto;
    max-width: 460px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    color: var(--muted);
    animation: hgFade 0.3s ease both;
  }

  .gate h1 {
    color: var(--text);
  }

  .gate p {
    line-height: 1.55;
  }

  .gico {
    width: 64px;
    height: 64px;
    border-radius: 20px;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent-text);
  }

  .gbtns {
    display: flex;
    gap: 10px;
  }

  h1 {
    font-size: 34px;
    font-weight: 800;
    letter-spacing: -0.9px;
  }

  .cols {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 24px;
  }

  .side {
    width: 320px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding-right: 6px;
  }

  .head p {
    margin-top: 6px;
    color: var(--muted);
  }

  .search label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .sbox {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 42px;
    padding: 0 14px;
    border-radius: 13px;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    color: var(--muted);
  }

  .sbox:focus-within {
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    box-shadow: 0 0 0 4px var(--accent-soft);
  }

  .sbox input {
    flex: 1;
    min-width: 0;
    background: none;
    border: 0;
    color: var(--text);
    font: inherit;
    font-size: 14px;
    outline: none;
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--muted);
    margin: 0 0 6px;
  }

  .card h2 {
    font-size: 16px;
    font-weight: 650;
    letter-spacing: 0;
    text-transform: none;
    color: var(--text);
  }

  .count {
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--surface-3);
    font-size: 11px;
    letter-spacing: 0;
  }

  .prow {
    display: flex;
    align-items: center;
    gap: 6px;
    border-radius: 12px;
  }

  .pmain {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 7px 8px;
    border-radius: 12px;
    text-align: left;
    transition: background 0.18s;
  }

  button.pmain:hover,
  .pmain.on {
    background: var(--surface-3);
  }

  .friend.on {
    background: rgb(var(--ink) / 0.08);
  }

  .ptxt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .pn {
    min-width: 0;
    font-weight: 600;
    font-size: 14px;
  }

  .ps {
    font-size: 12.5px;
    color: var(--muted);
  }

  .ps.playing {
    color: var(--success-text);
  }

  .ell {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .badge {
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: #fff;
    font-size: 11.5px;
    font-weight: 700;
  }

  .ibtn {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    border-radius: 11px;
    display: grid;
    place-items: center;
    color: var(--muted);
    transition:
      background 0.18s,
      color 0.18s;
  }

  .ibtn:hover {
    background: var(--surface-3);
    color: var(--text);
  }

  .ibtn.acc {
    color: var(--accent-text);
  }

  .ibtn.acc:hover {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }

  .none {
    padding: 6px 8px;
    font-size: 13px;
    color: var(--muted);
    line-height: 1.5;
  }

  .fold {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--muted);
    padding: 4px 0;
  }

  .fold:hover {
    color: var(--text);
  }

  .main {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .overview {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding-bottom: 8px;
  }

  .card {
    padding: 22px;
    border-radius: var(--r-section);
    background: var(--surface-1);
    border: 1px solid var(--border-1);
    animation: hgFade 0.3s ease both;
  }

  .card.code {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .card.code > div {
    flex: 1;
    min-width: 220px;
  }

  .card.code p {
    margin-top: 4px;
    font-size: 13px;
    color: var(--muted);
  }

  .cval {
    font-family: var(--mono);
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 2px;
    color: var(--accent-text);
    user-select: all;
  }

  .act {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 0;
    border-top: 1px solid var(--border-1);
  }

  .act:first-of-type {
    border-top: 0;
  }

  .aav {
    border-radius: 50%;
  }

  .atxt {
    flex: 1;
    min-width: 0;
    font-size: 14px;
    color: var(--text-3);
  }

  .atxt strong {
    color: var(--text);
    font-weight: 650;
  }

  .when {
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
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

  @media (prefers-reduced-motion: reduce) {
    .gate,
    .card {
      animation: none;
    }
  }
</style>
