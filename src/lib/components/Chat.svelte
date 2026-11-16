<script lang="ts">
  // Conversation privée avec un ami (page Amis) : messages, invitations sur un jeu, envoi.
  // Entrée envoie, Maj+Entrée va à la ligne. Les messages reçus sont lus dès qu'ils s'affichent.
  import { tick } from 'svelte';
  import { presenceLabel, social } from '../stores/social.svelte';
  import { runner } from '../stores/runner.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { ChatMessage } from '../types';
  import { messageTime } from '../util/format';
  import Icon from './Icon.svelte';
  import SocialAvatar from './SocialAvatar.svelte';

  let { id }: { id: string } = $props();

  const MAX = 2000;
  let draft = $state('');
  let sending = $state(false);
  let list = $state<HTMLDivElement>();
  let input = $state<HTMLTextAreaElement>();

  const friend = $derived(social.lists.friends.find((u) => u.id === id));
  const who = $derived(friend ?? social.user(id));
  const name = $derived(who?.name ?? 'Joueur');
  const thread = $derived(social.threads[id]);
  const messages = $derived(thread?.messages ?? []);
  /** Mon dernier message, s'il a été lu (« Vu »). */
  const seenId = $derived.by(() => {
    const last = messages.at(-1);
    return last && last.from === social.me && last.readAt ? last.id : null;
  });

  $effect(() => {
    void social.loadThread(id);
  });

  // Nouveau message : en bas de la conversation (sauf en lisant les plus anciens).
  let lastCount = 0;
  $effect(() => {
    const n = messages.length;
    const grew = n > lastCount;
    const first = lastCount === 0;
    lastCount = n;
    if (!grew || !list) return;
    const el = list;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (first || near || messages.at(-1)?.from === social.me) {
      void tick().then(() => (el.scrollTop = el.scrollHeight));
    }
  });

  // Retour sur la fenêtre avec la conversation ouverte : les nouveaux messages sont lus.
  $effect(() => {
    if (ui.windowFocused) void social.markRead(id);
  });

  async function send(e?: SubmitEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending || !friend) return;
    sending = true;
    if (await social.send(id, { text })) draft = '';
    sending = false;
    input?.focus();
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  async function older() {
    if (!list) return;
    const before = list.scrollHeight;
    await social.loadThread(id, true);
    await tick();
    list.scrollTop = list.scrollHeight - before;
  }

  function play(m: ChatMessage) {
    const g = social.localGame(m.game);
    if (!g) return;
    if (g.notInstalled) ui.open(g.id);
    else void runner.play(g.id);
  }
</script>

<section class="chat" aria-label="Conversation avec {name}">
  <header>
    <button class="who" onclick={() => ui.profile(id)} aria-label="Voir le profil de {name}">
      <SocialAvatar {id} {name} version={who?.avatar ?? null} size={40} presence={friend?.presence} />
      <span class="txt">
        <span class="nm ell">{name}</span>
        <span class="st ell" class:playing={friend?.presence.state === 'playing'}
          >{friend ? presenceLabel(friend.presence) : "Vous n'êtes plus amis"}</span
        >
      </span>
    </button>
    {#if friend}
      <button class="btn-s" onclick={() => (ui.modal = { kind: 'socialInvite', userId: id, name })}
        ><Icon name="gamepad" size={15} />Inviter sur un jeu</button
      >
    {/if}
    <button class="ibtn" aria-label="Fermer la conversation" title="Fermer" onclick={() => (social.chatWith = null)}
      ><Icon name="x" size={16} /></button
    >
  </header>

  <div class="msgs scroll" bind:this={list} aria-live="polite" aria-relevant="additions">
    {#if thread?.more}
      <button class="older" onclick={older}>Messages plus anciens</button>
    {/if}
    {#if thread && !messages.length}
      <p class="empty">Aucun message pour l'instant. Dis bonjour à {name} !</p>
    {/if}
    {#each messages as m (m.id)}
      {@const mine = m.from === social.me}
      <div class="row" class:mine>
        {#if m.kind === 'invite' && m.game}
          {@const local = social.localGame(m.game)}
          <div class="invite">
            <span class="ic"><Icon name="gamepad" size={18} /></span>
            <span class="itxt">
              <span class="il">{mine ? 'Tu as proposé' : `${name} te propose`} une partie</span>
              <span class="ig ell">{m.game.name}</span>
            </span>
            {#if !mine}
              {#if local}
                <button class="btn-s primary" onclick={() => play(m)}
                  ><Icon name="play" size={12} />{local.notInstalled ? 'Voir le jeu' : 'Lancer'}</button
                >
              {:else}
                <span class="nope">Pas dans ta bibliothèque</span>
              {/if}
            {/if}
          </div>
        {:else}
          <p class="bubble">{m.text}</p>
        {/if}
        <span class="meta num">
          {messageTime(m.at)}{#if m.id === seenId} · Vu{/if}
          {#if !mine}
            <button
              class="flag"
              aria-label="Signaler ce message"
              title="Signaler"
              onclick={() => (ui.modal = { kind: 'socialReport', userId: id, name, messageId: m.id })}
              ><Icon name="flag" size={12} /></button
            >
          {/if}
        </span>
      </div>
    {/each}
  </div>

  {#if friend}
    <form class="composer" onsubmit={send}>
      <label class="sr-only" for="chat-input">Message à {name}</label>
      <textarea
        id="chat-input"
        bind:this={input}
        bind:value={draft}
        maxlength={MAX}
        rows="1"
        placeholder="Écrire à {name}..."
        onkeydown={keydown}
      ></textarea>
      <button class="send" type="submit" aria-label="Envoyer" title="Envoyer" disabled={!draft.trim() || sending}
        ><Icon name="send" size={17} /></button
      >
    </form>
  {:else}
    <p class="gone">Tu ne peux plus écrire à {name} : vous n'êtes plus amis.</p>
  {/if}
</section>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    border-radius: 20px;
    background: var(--surface-1);
    border: 1px solid var(--border-1);
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border-1);
  }

  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    border-radius: 12px;
  }

  .txt {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .nm {
    font-weight: 650;
    font-size: 15px;
  }

  .st {
    font-size: 12.5px;
    color: var(--muted);
  }

  .st.playing {
    color: var(--success-text, #6ee7b7);
  }

  .ell {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .msgs {
    flex: 1;
    min-height: 0;
    padding: 18px 18px 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .older {
    align-self: center;
    font-size: 12.5px;
    color: var(--muted);
    padding: 4px 10px;
    border-radius: 999px;
  }

  .older:hover {
    background: var(--surface-3);
    color: var(--text);
  }

  .empty {
    margin: auto;
    color: var(--muted);
    font-size: 13.5px;
  }

  .row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    max-width: 78%;
    animation: hgFade 0.2s ease both;
  }

  .row.mine {
    align-self: flex-end;
    align-items: flex-end;
  }

  .bubble {
    padding: 9px 13px;
    border-radius: 16px 16px 16px 5px;
    background: var(--surface-3);
    font-size: 14px;
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    user-select: text;
  }

  .mine .bubble {
    border-radius: 16px 16px 5px 16px;
    background: var(--accent);
    color: #fff;
  }

  .invite {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 16px;
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    min-width: 260px;
  }

  .invite .ic {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: #fff;
    flex-shrink: 0;
  }

  .itxt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .il {
    font-size: 12px;
    color: var(--muted);
  }

  .ig {
    font-weight: 650;
  }

  .nope {
    font-size: 12px;
    color: var(--muted);
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: var(--muted);
    padding: 0 4px;
  }

  .flag {
    opacity: 0;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 6px;
    color: var(--muted);
  }

  .row:hover .flag,
  .flag:focus-visible {
    opacity: 1;
  }

  .flag:hover {
    color: var(--danger-text);
    background: var(--surface-3);
  }

  .composer {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    padding: 12px 14px 14px;
    border-top: 1px solid var(--border-1);
  }

  textarea {
    flex: 1;
    resize: none;
    field-sizing: content;
    min-height: 42px;
    max-height: 140px;
    padding: 11px 14px;
    border-radius: 13px;
    border: 1px solid var(--border-2);
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
    font-size: 14px;
    line-height: 1.4;
  }

  textarea:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    box-shadow: 0 0 0 4px var(--accent-soft);
  }

  .send {
    width: 42px;
    height: 42px;
    border-radius: 13px;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: #fff;
    flex-shrink: 0;
  }

  .send:disabled {
    opacity: 0.4;
  }

  .gone {
    padding: 16px;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
    border-top: 1px solid var(--border-1);
  }

  .ibtn {
    width: 34px;
    height: 34px;
    border-radius: 11px;
    display: grid;
    place-items: center;
    color: var(--muted);
  }

  .ibtn:hover {
    background: var(--surface-3);
    color: var(--text);
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

  @media (prefers-reduced-motion: reduce) {
    .row {
      animation: none;
    }
  }
</style>
