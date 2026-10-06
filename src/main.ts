import './styles.css';
import rawCatalogue from '../catalog/impersonae-v1.json';
import type { Card, Catalogue, EventConfig, MindSnapshot, PersonalResult } from './types.ts';
import { BigMatchApi, ApiError } from './api.ts';
import { browserStorage, clearState, emptyState, loadState, saveState, stateKey } from './storage.ts';
import { canonicalTrio, combinationNumber, buildResultHash, parseResultHash } from './domain.ts';
import { renderPoster } from './poster.ts';
import { renderMind } from './mind.ts';

const catalogue: Catalogue = rawCatalogue;
const cards: Card[] = catalogue.cards;
const byId = new Map(cards.map(card => [card.id, card]));
const validIds = new Set(cards.map(card => card.id));
const eventSlug = import.meta.env.VITE_EVENT_SLUG || 'big-2026';
const assetBaseUrl = new URL(import.meta.env.BASE_URL, location.origin).href;
let canonicalBaseUrl = assetBaseUrl;
try { if (import.meta.env.VITE_APP_URL) { const url = new URL(import.meta.env.VITE_APP_URL); if (['https:', 'http:'].includes(url.protocol)) { url.hash = ''; url.search = ''; canonicalBaseUrl = url.href; } } } catch { /* Current app URL is safe fallback. */ }
const api = new BigMatchApi({ url: import.meta.env.VITE_SUPABASE_URL || '', key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '', eventSlug });
const storage = browserStorage();
const key = stateKey(eventSlug, catalogue.deckVersion);
let state = loadState(storage, key, validIds);
let eventConfig: EventConfig | null = null;
let allowedIds = new Set(validIds);
let configPromise: Promise<EventConfig | null> | null = null;
let incompatible = false;
let selected = [...state.selectedIds];
let viewIds: number[] = [];
let viewKind: 'own' | 'shared' = 'own';
let latestMind: MindSnapshot | null = null;
let localSaved = Boolean(storage);
let resultGeneration = 0;
let selectionTimer: ReturnType<typeof setTimeout> | undefined;
let selectionGeneration = 0;
let saveBusy = false;
let refreshBusy = false;
let dataGeneration = 0;
let contactBusy = false;
let deleteBusy = false;
let exportBusy = false;
let retryAction: 'save' | 'refresh' | 'latest' | null = null;
let posterFile: File | null = null;
let posterPromise: Promise<Blob> | null = null;
let posterKey = '';
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let waitingWorker: ServiceWorker | null = null;
let isLocalNavigation = false;
let contactRequest: { payload: string; id: string } | null = null;

function el<T extends HTMLElement = HTMLElement>(id: string): T { const element = document.getElementById(id); if (!element) throw new Error(`Missing element ${id}`); return element as T; }
const result = el<HTMLDialogElement>('result');
const privacy = el<HTMLDialogElement>('privacy');
const deleteDialog = el<HTMLDialogElement>('delete-dialog');
const search = el<HTMLInputElement>('search');

// Native modal dialogs make the page inert, but a full Tab cycle can still move
// focus to the browser/body. Keep keyboard navigation inside the active modal.
let focusOwner: HTMLDialogElement = result;
document.addEventListener('focusin', event => {
  const owner = event.target instanceof Element ? event.target.closest<HTMLDialogElement>('dialog') : null;
  if (owner && [result, privacy, deleteDialog].includes(owner)) focusOwner = owner;
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Tab' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  const dialog = focusOwner.open ? focusOwner : [privacy, deleteDialog, result].find(candidate => candidate.open);
  if (!dialog) return;
  const controls = [...dialog.querySelectorAll<HTMLElement>(
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]',
  )].filter(control => control.tabIndex >= 0 && !control.matches(':disabled')
    && !control.closest('[hidden], [inert]') && control.getClientRects().length > 0
    && getComputedStyle(control).visibility === 'visible');
  if (!controls.length) {
    event.preventDefault();
    const heading = dialog.querySelector<HTMLElement>('h2');
    if (heading) { heading.tabIndex = -1; heading.focus(); }
    else dialog.focus();
    return;
  }
  const first = controls[0]!, last = controls[controls.length - 1]!;
  const active = document.activeElement;
  if (!dialog.contains(active) || (event.shiftKey ? active === first : active === last)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
});

function persist(): boolean { state.selectedIds = [...selected]; localSaved = saveState(storage, key, state); return localSaved; }
function localDescription(): string { return localSaved ? 'Your composition is kept on this device.' : 'Your composition is available while this page stays open. This browser could not save it.'; }
function same(a: readonly number[], b: readonly number[]): boolean { return a.length === 3 && b.length === 3 && [...a].sort((x,y)=>x-y).join('-') === [...b].sort((x,y)=>x-y).join('-'); }
function message(error: unknown): string { return error instanceof Error ? error.message : 'Something went wrong. Please try again.'; }
function toast(text: string): void { const target = el('toast'); (privacy.open ? privacy : result.open ? result : document.body).append(target); target.textContent = text; target.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => target.classList.remove('visible'), 4500); }
function setStatus(text: string, retry: typeof retryAction = null): void { el('save-status').textContent = text; retryAction = retry; const button = el<HTMLButtonElement>('retry-save'); button.hidden = retry === null; button.textContent = retry === 'latest' ? 'LOAD LATEST RESULT' : retry === 'refresh' ? 'REFRESH CONNECTIONS' : 'TRY AGAIN'; button.disabled = saveBusy; }
function updateBusy(): void { el<HTMLButtonElement>('again').disabled = saveBusy || deleteBusy; el<HTMLButtonElement>('retry-save').disabled = saveBusy || refreshBusy; el<HTMLButtonElement>('erase-data').disabled = saveBusy || deleteBusy; el<HTMLButtonElement>('apply-update').disabled = saveBusy || contactBusy || deleteBusy || exportBusy || Boolean(state.pending) || contactHasDraft(); }
function contactHasDraft(): boolean { return Boolean(el<HTMLInputElement>('contact-email').value || el<HTMLInputElement>('contact-name').value); }
function hideStats(): void { el('connection-stats').hidden = true; el('strongest').hidden = true; }
function shareUrl(): string { const url = new URL(canonicalBaseUrl); url.hash = buildResultHash(eventSlug, catalogue.deckVersion, viewIds); return url.href; }

function buildGrid(): void {
  const grid = el('grid'); grid.replaceChildren();
  cards.forEach(card => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'card'; button.dataset.cardId = String(card.id); button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', card.name);
    const img = document.createElement('img'); img.src = new URL(card.image, assetBaseUrl).href; img.alt = ''; img.width = 432; img.height = 640; img.loading = card.ordinal <= 4 ? 'eager' : 'lazy'; img.decoding = 'async';
    const name = document.createElement('span'); name.className = 'name'; name.textContent = card.name;
    const order = document.createElement('span'); order.className = 'order'; order.setAttribute('aria-hidden', 'true');
    button.append(img, name, order); button.addEventListener('click', () => toggle(card.id)); grid.append(button);
  });
  renderSelection();
}

function renderSelection(): void {
  const query = search.value.trim().toLocaleLowerCase(); let visible = 0;
  el('counter').textContent = `${selected.length} / 3 selected`;
  el('grid').querySelectorAll<HTMLButtonElement>('[data-card-id]').forEach(button => {
    const id = Number(button.dataset.cardId), index = selected.indexOf(id), card = byId.get(id)!;
    button.hidden = !allowedIds.has(id) || !card.name.toLocaleLowerCase().includes(query);
    if (!button.hidden) visible++;
    button.classList.toggle('selected', index !== -1); button.setAttribute('aria-pressed', String(index !== -1)); button.querySelector('.order')!.textContent = index !== -1 ? String(index + 1) : '';
  });
  el('noresults').hidden = visible > 0;
  const chosen = el('chosen'); chosen.replaceChildren();
  if (!selected.length) chosen.textContent = 'Your vision starts here.';
  selected.forEach(id => { const button = document.createElement('button'); button.type = 'button'; button.className = 'chip'; button.setAttribute('aria-label', `Remove ${byId.get(id)!.name}`); button.textContent = byId.get(id)!.name; const cross = document.createElement('span'); cross.className = 'remove'; cross.textContent = '×'; cross.setAttribute('aria-hidden','true'); button.append(cross); button.addEventListener('click', () => toggle(id)); chosen.append(button); });
  el('bartext').textContent = selected.length === 3 ? 'Your 3 cards are ready' : `Choose ${3 - selected.length} ${selected.length === 2 ? 'more card' : 'cards'}`;
  el('view-result').hidden = selected.length !== 3;
}

function toggle(id: number): void {
  if (saveBusy || deleteBusy) { toast('Your response is being saved. Please wait a moment.'); return; }
  if (!allowedIds.has(id)) return;
  if (!selected.includes(id) && selected.length === 3) { toast('Remove a selected card before choosing another.'); return; }
  clearTimeout(selectionTimer); selectionGeneration++;
  if (selected.includes(id)) selected = selected.filter(value => value !== id);
  else if (selected.length < 3) selected.push(id);
  persist(); renderSelection();
  if (selected.length === 3) {
    const generation = selectionGeneration; const snapshot = [...selected];
    selectionTimer = setTimeout(() => { if (generation === selectionGeneration && selected.length === 3 && selected.every((id, index) => id === snapshot[index])) beginOwnResult(snapshot); }, 300);
  }
}

function navigate(hash: string, replace = false): void {
  isLocalNavigation = true;
  history[replace ? 'replaceState' : 'pushState']({ bigMatch: true }, '', `${location.pathname}${location.search}${hash}`);
  isLocalNavigation = false;
}

function beginOwnResult(ids: number[]): void {
  clearTimeout(selectionTimer); selectionGeneration++;
  if (ids.length !== 3) return;
  state.resultIds = [...ids]; persist(); navigate('#/my-result'); showResult(ids, 'own'); void saveCurrent();
}

function showResult(ids: number[], kind: 'own' | 'shared'): void {
  canonicalTrio(ids, validIds);
  viewIds = [...ids]; viewKind = kind; resultGeneration++;
  hideStats(); el<HTMLInputElement>('share-link').hidden = true;
  const chosen = ids.map(id => byId.get(id)!);
  el('matchnumber').textContent = `BIG MATCH #${String(combinationNumber(ids)).padStart(4, '0')}`;
  el('result-title').innerHTML = kind === 'own' ? 'YOUR<br>BIG MATCH.' : 'A SHARED<br>BIG MATCH.';
  el('connections-title').innerHTML = kind === 'own' ? 'YOUR<br>CONNECTIONS.' : 'A SHARED<br>VISION.';
  el('posternames').textContent = chosen.map(card => card.name).join(' × ');
  const trio = el('trio'); trio.replaceChildren(); chosen.forEach(card => { const img = document.createElement('img'); img.src = new URL(card.image, assetBaseUrl).href; img.alt = card.name; img.width = 432; img.height = 640; trio.append(img); });
  el('again').hidden = kind === 'shared'; el('make-own').hidden = kind !== 'shared'; el('counts-note').hidden = kind === 'shared';
  if (!result.open) result.showModal(); result.scrollTop = 0; el('close').focus({ preventScroll: true });
  if (kind === 'shared') { setStatus('This is a shared composition. Viewing it does not register a response.'); }
  else if (state.ack && same(state.ack.cardIds, ids)) { setStatus('Your response is saved. Updating your connections…', 'refresh'); }
  else setStatus('Your composition is ready. Connecting to the community…');
  if (latestMind) renderMind(latestMind, cards.filter(card => allowedIds.has(card.id)), ids);
  updateBusy(); void preparePoster();
}

function closeResult(): void { resultGeneration++; if (result.open) result.close(); if (location.hash.startsWith('#/')) navigate('', true); renderSelection(); }

async function preparePoster(): Promise<void> {
  const generation = resultGeneration;
  const currentKey = `${catalogue.deckVersion}:${viewIds.join('-')}:${eventConfig?.question || 'What does the future of design look like?'}:${canonicalBaseUrl}`;
  const download = el<HTMLButtonElement>('download'), share = el<HTMLButtonElement>('share');
  download.disabled = true; share.disabled = true; download.textContent = 'PREPARING STORY…'; posterFile = null; el('export-status').textContent = '';
  if (posterKey !== currentKey || !posterPromise) {
    posterKey = currentKey;
    posterPromise = renderPoster(viewIds.map(id => byId.get(id)!), { code: el('matchnumber').textContent || '', question: eventConfig?.question || 'What does the future of design look like?', logoUrl: 'brand/impersonae.png', baseUrl: canonicalBaseUrl, assetBaseUrl });
  }
  try {
    const blob = await posterPromise;
    if (generation !== resultGeneration) return;
    posterFile = new File([blob], `BIG-MATCH-${String(combinationNumber(viewIds)).padStart(4, '0')}.png`, { type: 'image/png' });
    download.disabled = false; share.disabled = false; download.textContent = 'DOWNLOAD STORY';
    el('export-status').textContent = 'Your Story is ready · 1080 × 1920';
  } catch {
    if (generation !== resultGeneration) return;
    posterPromise = null; download.disabled = false; download.textContent = 'RETRY STORY'; share.disabled = true;
    el('export-status').textContent = 'The image could not be prepared. Check the connection and try again. You can still copy the link.';
  }
}

function downloadStory(): void {
  if (!posterFile) { void preparePoster(); return; }
  const url = URL.createObjectURL(posterFile); const a = document.createElement('a'); a.href = url; a.download = posterFile.name; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000); toast('Story download started.');
}

async function shareResult(): Promise<void> {
  if (!posterFile || exportBusy) return;
  const button = el<HTMLButtonElement>('share'); const snapshot = posterFile; const url = shareUrl();
  const text = `My vision of the future of design: ${viewIds.map(id => byId.get(id)!.name).join(' × ')}. Find your #BIGMATCH.`;
  exportBusy = true; button.disabled = true; updateBusy();
  try {
    if (typeof navigator.share === 'function') {
      // The file is already prepared: invoke native share in the original user gesture.
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [snapshot] })) await navigator.share({ title: '#BIG MATCH — Impersonae', text, url, files: [snapshot] });
      else await navigator.share({ title: '#BIG MATCH — Impersonae', text, url });
    } else { el('export-status').textContent = 'Download your Story and copy the link to share it.'; }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError') && (error as { name?: string })?.name !== 'AbortError') el('export-status').textContent = 'Sharing is unavailable here. Download your Story or copy the link.';
  } finally { exportBusy = false; button.disabled = !posterFile; updateBusy(); }
}

async function copyLink(): Promise<void> {
  const url = shareUrl();
  try { await navigator.clipboard.writeText(url); toast('Link copied.'); }
  catch { const input = el<HTMLInputElement>('share-link'); input.value = url; input.hidden = false; input.focus(); input.select(); el('export-status').textContent = 'Select and copy this link.'; }
}

async function loadEvent(force = false): Promise<EventConfig | null> {
  if (!api.configured) { el('event-notice').hidden = false; el('event-notice').textContent = 'Community matching is unavailable. You can still explore the cards and create your composition.'; updatePrivacy(); return null; }
  if (eventConfig && !force) return eventConfig;
  if (configPromise) return configPromise;
  configPromise = (async () => {
    try {
      const config = await api.event();
      incompatible = config.deckVersion !== catalogue.deckVersion || config.activeCardIds.some(id => !validIds.has(id)) || config.activeCardIds.length < 3;
      if (incompatible) throw new ApiError('The event catalogue has changed. Update the app before joining the community.', 409, 'CATALOGUE_CHANGED');
      const oldQuestion = eventConfig?.question || 'What does the future of design look like?';
      eventConfig = config; allowedIds = new Set(config.activeCardIds);
      if (config.question !== oldQuestion && result.open && viewIds.length === 3) void preparePoster();
      const before = selected.length; selected = selected.filter(id => allowedIds.has(id));
      if (before !== selected.length) { clearTimeout(selectionTimer); selectionGeneration++; persist(); toast('The event catalogue was updated. Please complete your selection.'); }
      renderSelection();
      el('question').textContent = config.question;
      const notice = el('event-notice'); notice.hidden = config.status === 'open'; notice.textContent = config.status === 'closed' ? 'The event has ended. You can still explore the cards and view the community.' : 'The event is not open yet. You can explore the cards and create your composition.';
      el('contact-section').hidden = !config.contactEnabled || config.status !== 'open'; updatePrivacy(); return config;
    } catch (error) {
      el('event-notice').hidden = false; el('event-notice').textContent = incompatible ? message(error) : 'The community is temporarily unavailable. Your composition is still here.';
      el('contact-section').hidden = true; updatePrivacy(); return null;
    } finally { configPromise = null; }
  })();
  return configPromise;
}

function acceptMind(snapshot: MindSnapshot): void {
  if (latestMind && snapshot.version < latestMind.version) return;
  latestMind = snapshot;
  if (result.open) renderMind(snapshot, cards.filter(card => allowedIds.has(card.id)), viewIds);
}

function acceptPersonal(value: PersonalResult): 'current' | 'changed' | 'stale' {
  if ((latestMind && value.mind.version < latestMind.version) || (value.participation && state.ack?.participationId === value.participation.participationId && value.participation.revision < state.ack.revision)) return 'stale';
  acceptMind(value.mind);
  if (!value.participation || viewKind !== 'own' || !same(value.participation.cardIds, viewIds)) { hideStats(); return 'changed'; }
  state.ack = value.participation; persist();
  if (!value.matches) { hideStats(); return 'changed'; }
  el('exactcount').textContent = String(value.matches.exact); el('closecount').textContent = String(value.matches.close); el('connection-stats').hidden = false;
  const trio = [...canonicalTrio(viewIds)];
  const pairs = [[trio[0],trio[1]], [trio[0],trio[2]], [trio[1],trio[2]]].map(ids => ({ ids, count: Math.max(0, (value.mind.pairCounts[ids.join('-')] || 0) - 1) })).sort((a,b) => b.count - a.count || a.ids[0] - b.ids[0] || a.ids[1] - b.ids[1]);
  el('strongest').hidden = pairs[0].count === 0;
  if (pairs[0].count) { el('strongpair').textContent = pairs[0].ids.map(id => byId.get(id)!.name).join(' × '); el('strongpaircount').textContent = `${pairs[0].count} other ${pairs[0].count === 1 ? 'response contains' : 'responses contain'} this pair.`; }
  setStatus(value.matches.exact + value.matches.close === 0 ? 'Your response is saved. Be the first to invite a matching vision.' : 'Your response is saved. These connections exclude your own choice.');
  return 'current';
}

async function refreshPersonal(loadLatest = false): Promise<void> {
  if (saveBusy || refreshBusy) return;
  if (!api.configured || !eventConfig || incompatible) { if (viewKind === 'own') { hideStats(); setStatus(`Community matching is unavailable. ${localDescription()}`, api.configured && !incompatible ? 'save' : null); } return; }
  if (viewKind !== 'own' || !result.open) return;
  const generation = resultGeneration, epoch = dataGeneration;
  const stillCurrent = () => generation === resultGeneration && epoch === dataGeneration && !saveBusy && viewKind === 'own' && result.open;
  refreshBusy = true; updateBusy();
  try {
    const value = await api.mine(false);
    if (!stillCurrent()) return;
    if ((latestMind && value.mind.version < latestMind.version) || (value.participation && state.ack?.participationId === value.participation.participationId && value.participation.revision < state.ack.revision)) return;
    if (loadLatest && value.participation) { selected = [...value.participation.cardIds]; state.resultIds = [...selected]; state.pending = null; persist(); renderSelection(); showResult(selected, 'own'); }
    const matches = acceptPersonal(value);
    if (matches === 'changed' && viewKind === 'own') setStatus(value.participation ? 'This response was changed in another tab. Load the latest result to continue.' : 'This composition has not joined the community yet.', value.participation ? 'latest' : 'save');
  } catch (error) {
    if (stillCurrent()) setStatus((error as ApiError).code === 'NO_SESSION' ? 'This composition has not joined the community yet.' : message(error), state.ack ? 'refresh' : 'save');
  } finally { refreshBusy = false; updateBusy(); }
}

async function saveCurrent(): Promise<void> {
  if (saveBusy || viewKind !== 'own' || viewIds.length !== 3) return;
  const snapshot = [...viewIds]; const generation = resultGeneration;
  const stillCurrent = () => generation === resultGeneration && viewKind === 'own' && result.open;
  const status = (text: string, retry: typeof retryAction = null) => { if (stillCurrent()) setStatus(text, retry); };
  saveBusy = true; dataGeneration++; updateBusy(); hideStats(); status('Saving your response…');
  try {
    const config = await loadEvent(true);
    if (!config || incompatible) { status(incompatible ? 'Update the app to use the current event catalogue.' : `Community matching is unavailable. ${localDescription()}`, incompatible || !api.configured ? null : 'save'); return; }
    if (config.status !== 'open') {
      if (state.pending && await api.hasSession()) {
        const latest = await api.mine(false); state.ack = latest.participation; state.pending = null; persist();
        if (stillCurrent()) acceptPersonal(latest);
      }
      status(config.status === 'closed' ? (state.ack && same(state.ack.cardIds, snapshot) ? 'Your response is saved. The event has now ended.' : 'The event has ended. New responses are closed.') : 'The event is not open yet. Your composition is ready.'); return;
    }
    const trio = [...canonicalTrio(snapshot, allowedIds)] as [number,number,number];
    if (!state.pending || !same(state.pending.cardIds, trio)) {
      const existing = await api.mine();
      if (existing.participation && same(existing.participation.cardIds, trio)) { state.ack = existing.participation; state.pending = null; persist(); if (stillCurrent()) acceptPersonal(existing); return; }
      state.ack = existing.participation;
      state.pending = { cardIds: trio, requestId: crypto.randomUUID(), expectedRevision: existing.participation?.revision || 0 }; persist();
    }
    const ack = await api.save(state.pending); state.ack = ack; state.pending = null; persist();
    if (!stillCurrent()) return;
    status('Your response is saved. Updating your connections…');
    const latest = await api.mine(false);
    if (!stillCurrent()) return;
    const accepted = acceptPersonal(latest);
    if (accepted === 'changed') status('This response was changed in another tab. Load the latest result to continue.', 'latest');
    else if (accepted === 'stale') status('Your response is saved. Refresh to see the latest connections.', 'refresh');
  } catch (error) {
    if (!stillCurrent()) return;
    const typed = error as ApiError;
    if (typed.status === 409) status('Your response changed or the event was updated. Load the latest result before trying again.', 'latest');
    else if (typed.status === 410) status(message(error));
    else status(state.ack && same(state.ack.cardIds, snapshot) && !state.pending ? 'Your response is saved, but the connections could not be refreshed.' : message(error), state.ack && same(state.ack.cardIds, snapshot) && !state.pending ? 'refresh' : 'save');
  } finally { saveBusy = false; updateBusy(); }
}

function updatePrivacy(): void {
  const target = el('privacy-copy'); target.replaceChildren();
  const paragraph = (text: string, className = '') => { const p = document.createElement('p'); p.className = className; p.textContent = text; target.append(p); };
  if (eventConfig?.privacyNotice && eventConfig.controllerName && eventConfig.controllerEmail) {
    paragraph(eventConfig.privacyNotice, 'notice-text');
    paragraph(`Data controller: ${eventConfig.controllerName}. Contact: ${eventConfig.controllerEmail}.`);
    paragraph(`Notice version: ${eventConfig.privacyVersion}.`);
  } else paragraph('This preview keeps your card selection in this browser. Community participation and catalogue requests are unavailable until the event opens. You can clear your selection using “Delete my participation”.');
  const heading = document.createElement('h3'); heading.textContent = 'Your browser session'; target.append(heading);
  paragraph('When the event is open, a private session lets you update one response from this browser. Clearing browser data or using another device can create a separate response. Public results show only totals.');
  paragraph('A shared link contains the event and the three card IDs. It does not include your browser session or contact details.');
  paragraph('Catalogue requests are optional and stored separately from card choices. The studio uses the contact details to handle your request.');
}

async function requestCatalogue(event: SubmitEvent): Promise<void> {
  event.preventDefault(); if (contactBusy) return;
  const form = el<HTMLFormElement>('contact-form'); if (!form.reportValidity()) return;
  if (!eventConfig?.contactEnabled || eventConfig.status !== 'open') { el('contact-status').textContent = 'Catalogue requests are unavailable right now. Please try again later.'; return; }
  contactBusy = true; updateBusy(); const button = el<HTMLButtonElement>('submit-contact'); button.disabled = true; button.textContent = 'SAVING REQUEST…';
  const body = { email: el<HTMLInputElement>('contact-email').value.trim(), name: el<HTMLInputElement>('contact-name').value.trim(), privacyVersion: eventConfig.privacyVersion, website: (form.elements.namedItem('website') as HTMLInputElement).value };
  const payload = JSON.stringify(body); if (contactRequest?.payload !== payload) contactRequest = { payload, id: crypto.randomUUID() };
  try {
    const saved = await api.contact({ ...body, requestId: contactRequest.id });
    if (!saved.saved) throw new ApiError('The request could not be saved. Please try again.', 502, 'INVALID_RESPONSE');
    form.reset(); form.querySelectorAll('input').forEach(input => input.disabled = true); button.textContent = 'REQUEST RECEIVED'; el('contact-status').textContent = 'Your request has been saved. The studio will send you the catalogue.'; contactRequest = null;
  } catch (error) {
    el('contact-status').textContent = message(error); button.disabled = false; button.textContent = 'REQUEST CATALOGUE ↗';
    if ((error as ApiError).status === 409) { await loadEvent(true); el<HTMLInputElement>('privacy-ack').checked = false; el('contact-status').textContent = 'Please read the updated privacy information, then submit your request again.'; }
  } finally { contactBusy = false; updateBusy(); }
}

async function eraseParticipation(): Promise<void> {
  if (deleteBusy || saveBusy) return;
  deleteBusy = true; dataGeneration++; updateBusy(); el<HTMLButtonElement>('confirm-delete').disabled = true; el<HTMLButtonElement>('cancel-delete').disabled = true;
  el('delete-status').textContent = 'Deleting…';
  try {
    let remote = false;
    if (api.configured && await api.hasSession()) { await api.erase(crypto.randomUUID()); await api.forgetSession(); remote = true; }
    else if (state.ack || state.pending) throw new ApiError('We cannot reach the session linked to your saved response. Reconnect and try again, or contact the studio to request deletion.');
    clearTimeout(selectionTimer); selectionGeneration++; resultGeneration++; selected = []; state = emptyState(); latestMind = null; const cleared = clearState(storage, key); search.value = ''; closeResult(); renderSelection();
    if (!cleared) { el('delete-status').textContent = remote ? 'Your participation was deleted from the event. Browser storage could not be cleared; clear this site’s data in your browser settings.' : 'The visible selection was cleared, but browser storage could not be removed. Clear this site’s data in your browser settings.'; return; }
    deleteDialog.close(); toast(remote ? 'Your participation has been deleted.' : 'Your choices have been cleared from this browser.');
  } catch (error) { el('delete-status').textContent = message(error); }
  finally { deleteBusy = false; el<HTMLButtonElement>('confirm-delete').disabled = false; el<HTMLButtonElement>('cancel-delete').disabled = false; updateBusy(); }
}

function handleRoute(): void {
  if (isLocalNavigation) return;
  if (location.hash === '#/my-result' && state.resultIds) { showResult(state.resultIds, 'own'); void loadEvent().then(() => refreshPersonal()); return; }
  if (location.hash.startsWith('#/r/')) {
    const parsed = parseResultHash(location.hash, validIds, eventSlug, catalogue.deckVersion);
    if (parsed) { showResult(parsed, 'shared'); void loadEvent().then(() => refreshPublic()); return; }
    el('event-notice').hidden = false; el('event-notice').textContent = 'This shared link is not valid for the current event. Choose three cards to create your own composition.'; navigate('', true);
  }
  resultGeneration++; if (result.open) result.close();
}

async function refreshPublic(): Promise<void> { if (!api.configured) { if (viewKind === 'shared') setStatus('This is a shared composition. Community data is unavailable right now.'); return; } try { acceptMind(await api.mind()); } catch { el('mind-status').textContent = latestMind ? 'Showing the last available community counts. The latest update could not be loaded.' : 'The community could not be loaded. Please try again when connected.'; } }

function editCards(): void { if (saveBusy) return; closeResult(); el('pick-title').scrollIntoView({ block: 'start' }); el('pick-title').focus({ preventScroll: true }); }
el<HTMLImageElement>('brand-logo').src = new URL('brand/impersonae.png', assetBaseUrl).href;
buildGrid(); updatePrivacy();
search.addEventListener('input', renderSelection);
el('view-result').addEventListener('click', () => beginOwnResult([...selected]));
el('close').addEventListener('click', closeResult);
result.addEventListener('cancel', event => { event.preventDefault(); closeResult(); });
el('again').addEventListener('click', editCards);
el('make-own').addEventListener('click', () => { closeResult(); el('pick-title').scrollIntoView({ block: 'start' }); el('pick-title').focus({ preventScroll: true }); });
el('download').addEventListener('click', downloadStory);
el('share').addEventListener('click', () => { void shareResult(); });
el('copy-link').addEventListener('click', () => { void copyLink(); });
el('retry-save').addEventListener('click', () => { if (retryAction === 'save') void saveCurrent(); else void refreshPersonal(retryAction === 'latest'); });
document.querySelectorAll<HTMLButtonElement>('.privacy-link').forEach(button => button.addEventListener('click', () => privacy.showModal()));
el('close-privacy').addEventListener('click', () => privacy.close());
el('contact-form').addEventListener('submit', event => { void requestCatalogue(event); });
el('contact-form').addEventListener('input', updateBusy);
el('erase-data').addEventListener('click', () => { el('delete-status').textContent = ''; deleteDialog.showModal(); el('cancel-delete').focus(); });
el('cancel-delete').addEventListener('click', () => deleteDialog.close());
deleteDialog.addEventListener('cancel', event => { if (deleteBusy) event.preventDefault(); });
el('confirm-delete').addEventListener('click', () => { void eraseParticipation(); });
window.addEventListener('hashchange', handleRoute);
window.addEventListener('online', () => { void loadEvent(true); if (result.open) { if (viewKind === 'shared') void refreshPublic(); else if (!state.pending) void refreshPersonal(); } });
window.addEventListener('offline', () => { if (result.open && viewKind === 'own') setStatus(state.ack && same(state.ack.cardIds, viewIds) ? 'You are offline. Your saved response is safe; displayed connections may be out of date.' : 'You are offline. Your composition is kept on this device. Retry to join the community.', state.ack && same(state.ack.cardIds, viewIds) ? 'refresh' : 'save'); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && result.open && !saveBusy) { if (viewKind === 'shared') void refreshPublic(); else if (!state.pending) void refreshPersonal(); } });
setInterval(() => { if (document.visibilityState === 'visible' && result.open && !saveBusy && !contactBusy) { if (viewKind === 'shared') void refreshPublic(); else if (!state.pending) void refreshPersonal(); } }, 30_000);
window.addEventListener('storage', event => { if (event.key === key && !saveBusy && viewKind === 'own' && result.open) void refreshPersonal(); });

async function registerWorker(): Promise<void> {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  try {
    const registration = await navigator.serviceWorker.register(new URL('sw.js', assetBaseUrl).href, { scope: import.meta.env.BASE_URL });
    const show = () => { if (registration.waiting && navigator.serviceWorker.controller) { waitingWorker = registration.waiting; el('update-notice').hidden = false; updateBusy(); } };
    show(); registration.addEventListener('updatefound', () => { registration.installing?.addEventListener('statechange', show); });
    el('apply-update').addEventListener('click', () => {
      if (!waitingWorker || saveBusy || contactBusy || exportBusy || deleteBusy || state.pending || contactHasDraft()) return;
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true }); waitingWorker.postMessage({ type: 'ACTIVATE_UPDATE' });
    });
  } catch { /* Normal online operation stays available if cache installation fails. */ }
}
void loadEvent().then(() => { if (viewKind === 'shared' && result.open) void refreshPublic(); });
handleRoute(); void registerWorker();
