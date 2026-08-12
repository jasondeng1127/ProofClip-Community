import { createEvidenceRecord } from './core/record.mjs';
import { getState, saveState, clearState, mergeSettings, countArchive, latestArchiveRecord, getMetaState, mutateState } from './core/storage.mjs';
import { safeFilename } from './core/text.mjs';
import { proofclipApi, ProofClipApiError } from './core/proofclip-api.mjs';
import { captureExtractionError } from './core/capture-feedback.mjs';
import { cropViewportPng } from './core/region-capture.mjs';
import { createProject, deleteProject, renameProject, updateCardMetadata } from './core/projects.mjs';
import { removeArchiveCard } from './core/archive-actions.mjs';
import { sendArchiveBatch } from './core/archive-bulk-send.mjs';
import { withProjectNameForDelivery } from './core/project-delivery.mjs';
import { deliveryPrerequisites } from './core/delivery-prerequisites.mjs';
import { normalizeCaptureRoute, outboxFailurePolicy } from './core/direct-routing.mjs';
import { findRecentDuplicate, duplicateConfirmMessage } from './core/archive-dedup.mjs';
import { EXCLUDED_SELECTORS, CONTENT_SELECTORS } from './core/page-cleaner.mjs';

const CONTEXT_MENU_ID = 'proofclip-capture-selection';
const deliveryInFlight = new Map();
const DUPLICATE_CONFIRM_TIMEOUT_MS = 3000;
const duplicateConfirmRequests = new Map();
let duplicateConfirmSeq = 0;
let activeRegionTabId = null;

if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

// In-flight delivery lock (audit SEVERE-2): concurrent sends for the same
// record id must produce exactly one network delivery.
// The service worker's Map is in-memory only; a worker restart clears it,
// which is fine because a restart leaves no overlapping async handlers.
export async function withDeliveryLock(recordId, action) {
  if (deliveryInFlight.has(recordId)) return { ok: false, error: 'This evidence is already being sent.' };
  deliveryInFlight.set(recordId, true);
  try {
    return await action();
  } finally {
    deliveryInFlight.delete(recordId);
  }
}

function extractPageEvidence(excludedSelectors, contentSelectors) {
  function cleanPageBody(root) {
    const clone = root.cloneNode(true);
    for (const node of clone.querySelectorAll(excludedSelectors)) node.remove();
    const article = clone.querySelector(contentSelectors);
    const source = article || clone;
    return (source.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  }
  const canonical = document.querySelector('link[rel="canonical"]')?.href || location.href;
  const selected = window.getSelection()?.toString().trim() || '';
  const root = document.querySelector('article, main, [role="main"]') || document.body;
  let bodyText;
  try {
    bodyText = cleanPageBody(root);
  } catch {
    bodyText = (root?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  }
  return {
    title: document.title || 'Untitled page',
    url: location.href,
    canonicalUrl: canonical,
    selection: selected,
    bodyText
  };
}

function selectVisibleRegion() {
  return new Promise((resolve) => {
    const leftover = document.getElementById('__proofclip-region-overlay');
    if (leftover) leftover.remove();
    const overlay = document.createElement('div');
    const selection = document.createElement('div');
    overlay.id = '__proofclip-region-overlay';
    Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2147483647', cursor: 'crosshair', background: 'rgba(14, 25, 45, 0.18)', userSelect: 'none' });
    Object.assign(selection.style, { position: 'fixed', border: '2px solid #2557d6', background: 'rgba(37, 87, 214, 0.16)', pointerEvents: 'none' });
    overlay.append(selection);
    let start = null;
    const stop = (event) => { event.preventDefault(); event.stopPropagation(); };
    const cleanup = (result) => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('__proofclip-cancel-region', onCancelMessage); overlay.remove(); resolve(result); };
    const onKey = (event) => { if (event.key === 'Escape') cleanup(null); };
    const onContextMenu = (event) => { event.preventDefault(); cleanup(null); };
    const onCancelMessage = () => cleanup(null);
    overlay.addEventListener('contextmenu', onContextMenu);
    overlay.addEventListener('pointerdown', (event) => { stop(event); start = { x: event.clientX, y: event.clientY }; selection.style.display = 'block'; });
    overlay.addEventListener('pointermove', (event) => {
      if (!start) return;
      stop(event);
      const x = Math.min(start.x, event.clientX); const y = Math.min(start.y, event.clientY);
      selection.style.left = `${x}px`; selection.style.top = `${y}px`;
      selection.style.width = `${Math.abs(event.clientX - start.x)}px`; selection.style.height = `${Math.abs(event.clientY - start.y)}px`;
    });
    overlay.addEventListener('pointerup', (event) => {
      if (!start) return cleanup(null);
      stop(event);
      const x = Math.min(start.x, event.clientX); const y = Math.min(start.y, event.clientY);
      const width = Math.abs(event.clientX - start.x); const height = Math.abs(event.clientY - start.y);
      if (width < 8 || height < 8) return cleanup(null);
      cleanup({ x, y, width, height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight });
    });
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('__proofclip-cancel-region', onCancelMessage);
    document.documentElement.append(overlay);
  });
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || 'Unknown delivery error.');
}

async function stateForUi() {
  let state = await getMetaState();
  let connection = { connected: false, workspaceName: null, updatedAt: null };
  let connectionError = null;
  try { connection = await proofclipApi('/v1/connection', { storage: chrome.storage.local }); }
  catch (error) { connectionError = errorMessage(error); }
  state = await getMetaState();
  const archiveCount = await countArchive();
  const latest = await latestArchiveRecord();
  return {
    settings: state.settings,
    connection,
    connectionError,
    configured: Boolean(connection.connected && state.settings.dataSourceId),
    archiveCount,
    recentCapture: latest ? {
      title: latest.title,
      capturedAt: latest.capturedAt,
      mode: latest.mode,
      screenshot: latest.screenshot ? { dataUrl: latest.screenshot.dataUrl, width: latest.screenshot.width, height: latest.screenshot.height } : null
    } : null,
    outbox: state.outbox.map((item) => ({
      id: item.id,
      title: item.record.title,
      error: item.error,
      createdAt: item.createdAt,
      retryState: item.retryState || 'RETRYABLE'
    }))
  };
}

async function deliver(record, settings, projects) {
  const result = await proofclipApi('/v1/captures', {
    storage: chrome.storage.local,
    method: 'POST',
    body: { record: withProjectNameForDelivery(record, projects), target: settings }
  });
  const delivery = result.delivery;
  record.delivery = { status: 'SENT', updatedAt: new Date().toISOString(), notionPageId: delivery.id, notionUrl: delivery.url };
  return delivery;
}

async function checkDeliveryPrerequisites(settings) {
  let connection;
  try {
    connection = await proofclipApi('/v1/connection', { storage: chrome.storage.local });
  } catch (error) {
    return { ok: false, error: 'ProofClip could not verify the Notion connection. Try again before sending.' };
  }
  return deliveryPrerequisites({ connection, settings });
}

function syncArchiveDelivery(state, record) {
  const archiveRecord = state.archive.find((candidate) => candidate.id === record.id);
  if (archiveRecord) archiveRecord.delivery = { ...record.delivery };
}

// FIX-013: warn before a repeat capture of the same canonical URL. The
// confirmation is non-blocking: after 3 seconds without a choice the capture
// continues, and Cancel aborts before any count (FIX-012) or record is written.
async function findArchiveDuplicate(canonicalUrl) {
  try {
    const state = await getState();
    return findRecentDuplicate(state.archive, canonicalUrl);
  } catch {
    return null;
  }
}

async function confirmDuplicateCapture(tabId, canonicalUrl, duplicate, source) {
  if (!duplicate) return true;
  try {
    if (source === 'popup') return await confirmDuplicateInPopup(canonicalUrl, duplicate);
    return await confirmDuplicateOnPage(tabId, canonicalUrl, duplicate);
  } catch {
    return true;
  }
}

function waitForDuplicateAnswer(requestId) {
  return new Promise((resolve) => duplicateConfirmRequests.set(requestId, resolve));
}

async function confirmDuplicateInPopup(canonicalUrl, duplicate) {
  const requestId = `dup-${Date.now()}-${++duplicateConfirmSeq}`;
  const answered = waitForDuplicateAnswer(requestId);
  const fallback = new Promise((resolve) => setTimeout(() => resolve(true), DUPLICATE_CONFIRM_TIMEOUT_MS));
  chrome.runtime.sendMessage({
    type: 'DUPLICATE_CONFIRM_REQUEST',
    requestId,
    url: canonicalUrl,
    capturedAt: duplicate.capturedAt
  }).catch(() => {});
  const proceed = await Promise.race([answered, fallback]);
  duplicateConfirmRequests.delete(requestId);
  return proceed;
}

async function confirmDuplicateOnPage(tabId, canonicalUrl, duplicate) {
  if (tabId == null) return true;
  const requestId = `dup-${Date.now()}-${++duplicateConfirmSeq}`;
  const answered = waitForDuplicateAnswer(requestId);
  const fallback = new Promise((resolve) => setTimeout(() => resolve(true), DUPLICATE_CONFIRM_TIMEOUT_MS));
  await showDuplicateConfirmToast(tabId, canonicalUrl, duplicate.capturedAt, requestId);
  const proceed = await Promise.race([answered, fallback]);
  duplicateConfirmRequests.delete(requestId);
  return proceed;
}

async function showDuplicateConfirmToast(tabId, canonicalUrl, capturedAt, requestId) {
  await showPageToast(tabId, duplicateConfirmMessage(capturedAt), false, [
    { label: 'Continue', message: { type: 'DUPLICATE_CONFIRM_RESPONSE', requestId, proceed: true } },
    { label: 'Cancel', message: { type: 'DUPLICATE_CONFIRM_RESPONSE', requestId, proceed: false } }
  ], { confirmSeconds: 3 });
}

async function attemptDelivery(state, record) {
  return withDeliveryLock(record.id, async () => {
    const ready = await checkDeliveryPrerequisites(state.settings);
    if (!ready.ok) return ready;
    try {
      const delivery = await deliver(record, state.settings, state.projects);
      await mutateState((fresh) => {
        syncArchiveDelivery(fresh, record);
        fresh.outbox = fresh.outbox.filter((item) => item.record.id !== record.id);
        return fresh;
      });
      return { ok: true, delivery };
    } catch (error) {
      const policy = outboxFailurePolicy(error);
      const message = errorMessage(error);
      record.delivery = { status: 'FAILED', updatedAt: new Date().toISOString(), error: message };
      await mutateState((fresh) => {
        syncArchiveDelivery(fresh, record);
        const queued = fresh.outbox.find((item) => item.record.id === record.id);
        if (queued) {
          queued.record = { ...record };
          queued.error = message;
          queued.retryState = policy.state;
        } else {
          fresh.outbox.unshift({ id: crypto.randomUUID(), record: { ...record }, error: message, createdAt: new Date().toISOString(), retryState: policy.state });
        }
        return fresh;
      });
      return { ok: false, error: message, retryState: policy.state };
    }
  });
}

async function saveLocalRecord(record) {
  await mutateState((fresh) => {
    fresh.archive.unshift(record);
    return fresh;
  });
  return { ok: true, locallySaved: true, record };
}

async function captureLocal(mode, { fromPopup = false } = {}) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error('No active tab is available to capture.');
  let page;
  try {
    [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageEvidence, args: [EXCLUDED_SELECTORS, CONTENT_SELECTORS] });
  } catch (error) {
    return { ok: false, locallySaved: false, error: captureExtractionError(error) };
  }
  const captureUrl = page.canonicalUrl || page.url;
  const duplicate = await findArchiveDuplicate(captureUrl);
  if (duplicate) {
    const proceed = await confirmDuplicateCapture(tab.id, captureUrl, duplicate, fromPopup ? 'popup' : 'page');
    if (!proceed) return { ok: false, locallySaved: false, cancelled: true };
  }
  try {
    const record = await createEvidenceRecord(page, mode);
    const saved = await saveLocalRecord(record);
    if (saved.ok) {
      await showLocalSaveToast(tab.id, record);
    }
    return saved;
  } catch (error) {
    return { ok: false, locallySaved: false, error: errorMessage(error) };
  }
}

async function captureDirect(mode, { fromPopup = false } = {}) {
  const state = await getState();
  const ready = await checkDeliveryPrerequisites(state.settings);
  if (!ready.ok) return ready;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error('No active tab is available to capture.');
  let page;
  try {
    [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageEvidence, args: [EXCLUDED_SELECTORS, CONTENT_SELECTORS] });
  } catch (error) {
    return { ok: false, error: captureExtractionError(error) };
  }
  const captureUrl = page.canonicalUrl || page.url;
  const duplicate = await findArchiveDuplicate(captureUrl);
  if (duplicate) {
    const proceed = await confirmDuplicateCapture(tab.id, captureUrl, duplicate, fromPopup ? 'popup' : 'page');
    if (!proceed) return { ok: false, cancelled: true };
  }
  let record;
  try {
    record = await createEvidenceRecord(page, mode);
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
  const result = await attemptDelivery(state, record);
  return { ...result, route: 'direct' };
}

async function captureWithPopupFeedback(mode) {
  const routeState = await getState();
  const route = normalizeCaptureRoute(routeState.settings.captureRoute);
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const result = route === 'direct' ? await captureDirect(mode, { fromPopup: true }) : await captureLocal(mode, { fromPopup: true });
  if (result?.cancelled) return result;

  if (route === 'direct') {
    await showPageToast(tab?.id, result?.ok ? 'ProofClip: sent to Notion.' : `ProofClip: ${result?.error || 'Capture failed.'}`, !result?.ok);
  } else if (!result?.ok) {
    await showPageToast(tab?.id, `ProofClip: ${result?.error || 'Capture failed.'}`, true);
  }
  return result;
}

async function captureSelectionFromContext(tabId, selectionText) {
  if (!tabId) throw new Error('No active tab is available to capture.');
  const state = await getState();
  const route = normalizeCaptureRoute(state.settings.captureRoute);
  if (route === 'direct') {
    const ready = await checkDeliveryPrerequisites(state.settings);
    if (!ready.ok) return ready;
  }
  let page;
  try {
    [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId }, func: extractPageEvidence, args: [EXCLUDED_SELECTORS, CONTENT_SELECTORS] });
  } catch (error) {
    return { ok: false, error: captureExtractionError(error) };
  }
  page.selection = selectionText;
  const captureUrl = page.canonicalUrl || page.url;
  const duplicate = await findArchiveDuplicate(captureUrl);
  if (duplicate) {
    const proceed = await confirmDuplicateCapture(tabId, captureUrl, duplicate, 'page');
    if (!proceed) return { ok: false, cancelled: true };
  }
  let record;
  try {
    record = await createEvidenceRecord(page, 'selection');
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
  if (route === 'direct') {
    const result = await attemptDelivery(state, record);
    return { ...result, route: 'direct' };
  }
  const saved = await saveLocalRecord(record);
  return saved;
}

async function showPageToast(tabId, message, isError, actions = [], options = {}) {
  if (!tabId) return;
  const confirmSeconds = Number.isInteger(options.confirmSeconds) ? options.confirmSeconds : 0;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (text, error, actions, duration, confirmSeconds) => {
        const existing = document.getElementById('__proofclip-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = '__proofclip-toast';
        const label = document.createElement('span');
        label.textContent = text;
        Object.assign(toast.style, {
          position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: '2147483647',
          background: error ? '#b63a32' : '#17643a', color: '#fff', padding: '10px 14px',
          borderRadius: '8px', font: '13px/1.4 system-ui, sans-serif', boxShadow: '0 2px 10px rgba(0,0,0,.25)'
        });
        toast.append(label);
        const finish = (nextText, nextError) => {
          label.textContent = nextText;
          toast.style.background = nextError ? '#b63a32' : '#17643a';
          setTimeout(() => toast.remove(), 4000);
        };
        let row = null;
        if (Array.isArray(actions) && actions.length) {
          row = document.createElement('div');
          Object.assign(row.style, { display: 'flex', gap: '8px', marginTop: '8px' });
          for (const action of actions) {
            const button = document.createElement('button');
            button.textContent = action.label;
            Object.assign(button.style, { background: '#ffffff', color: error ? '#b63a32' : '#17643a', border: '0', borderRadius: '6px', padding: '6px 10px', fontWeight: '600', cursor: 'pointer' });
            button.onclick = () => {
              button.disabled = true;
              chrome.runtime.sendMessage(action.message, (response) => {
                if (action.message.type === 'SEND_FROM_TOAST') {
                  if (response?.ok && response.delivery?.url) {
                    finish('ProofClip: sent to Notion.', false);
                    const link = document.createElement('a');
                    link.href = response.delivery.url;
                    link.target = '_blank';
                    link.rel = 'noreferrer noopener';
                    link.textContent = 'Open in Notion';
                    Object.assign(link.style, { display: 'block', marginTop: '6px', color: '#ffffff', fontWeight: '700' });
                    toast.append(link);
                  } else {
                    finish(`ProofClip: ${response?.error || 'Could not send.'}`, true);
                  }
                } else {
                  setTimeout(() => toast.remove(), 1200);
                }
              });
            };
            row.append(button);
          }
          toast.append(row);
        }
        if (confirmSeconds > 0) {
          const countdown = document.createElement('span');
          countdown.textContent = `Continuing in ${confirmSeconds}…`;
          Object.assign(countdown.style, { display: 'block', marginTop: '6px', fontSize: '12px', opacity: '.9' });
          toast.append(countdown);
          let secondsLeft = confirmSeconds;
          const tick = setInterval(() => {
            secondsLeft -= 1;
            if (secondsLeft <= 0) {
              clearInterval(tick);
              countdown.textContent = 'Continuing…';
              if (row) for (const button of row.querySelectorAll('button')) button.disabled = true;
              setTimeout(() => toast.remove(), 1500);
              return;
            }
            countdown.textContent = `Continuing in ${secondsLeft}…`;
          }, 1000);
        }
        document.documentElement.append(toast);
        setTimeout(() => toast.remove(), duration);
      },
      args: [message, isError, actions, actions.length ? 10000 : 2500, confirmSeconds]
    });
  } catch { /* internal pages may refuse; feedback is best-effort */ }
}

async function showLocalSaveToast(tabId, record) {
  const message = 'ProofClip: saved locally.';
  await showPageToast(tabId, message, false, [
    { label: 'Edit', message: { type: 'OPEN_ARCHIVE_CARD', id: record.id } },
    { label: 'Send to Notion', message: { type: 'SEND_FROM_TOAST', id: record.id } }
  ]);
}

async function captureRegionPreview({ fromPopup = false } = {}) {
  const state = await getState();
  const route = normalizeCaptureRoute(state.settings.captureRoute);
  if (route === 'direct') {
    const ready = await checkDeliveryPrerequisites(state.settings);
    if (!ready.ok) return ready;
  }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || tab.windowId == null) throw new Error('No active tab is available to capture.');
  let page;
  try {
    [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageEvidence, args: [EXCLUDED_SELECTORS, CONTENT_SELECTORS] });
  } catch (error) {
    return { ok: false, cancelled: false, error: captureExtractionError(error) };
  }
  const captureUrl = page.canonicalUrl || page.url;
  const duplicate = await findArchiveDuplicate(captureUrl);
  if (duplicate) {
    const proceed = await confirmDuplicateCapture(tab.id, captureUrl, duplicate, fromPopup ? 'popup' : 'page');
    if (!proceed) return { ok: false, cancelled: true };
  }
  let region;
  activeRegionTabId = tab.id;
  try {
    [{ result: region }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: selectVisibleRegion });
  } catch (error) {
    activeRegionTabId = null;
    return { ok: false, cancelled: false, error: captureExtractionError(error) };
  }
  activeRegionTabId = null;
  if (!region) return { ok: false, cancelled: true };
  try {
    const viewportPng = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const capturedAt = new Date().toISOString();
    const screenshot = await cropViewportPng(viewportPng, region, { width: region.viewportWidth, height: region.viewportHeight }, { capturedAt, url: page.canonicalUrl || page.url });
    const record = await createEvidenceRecord(page, 'region', { screenshot, capturedAt });
    if (route === 'direct') {
      // Region direct delivery intentionally does not create a local archive
      // card: the evidence lives in Notion (audit G6 intent).
      const result = await attemptDelivery(state, record);
      if (result.ok) {
        await showPageToast(tab.id, 'ProofClip: region sent to Notion.', false);
        return { ...result, route: 'direct' };
      }
      await showPageToast(tab.id, `ProofClip: ${result.error || 'Region capture failed.'}`, true);
      return { ...result, route: 'direct' };
    }
    const saved = await saveLocalRecord(record);
    if (saved.ok) {
      await showLocalSaveToast(tab.id, saved.record);
    } else {
      await showPageToast(tab.id, `ProofClip: ${saved.error || 'Region capture failed.'}`, true);
    }
    return saved;
  } catch (error) {
    const message = errorMessage(error);
    await showPageToast(tab.id, `ProofClip: ${message}`, true);
    return { ok: false, cancelled: false, error: message };
  }
}

async function retryOutbox(id) {
  const state = await getState();
  const item = state.outbox.find((candidate) => candidate.id === id);
  if (!item) throw new Error('Outbox item was not found.');
  return attemptDelivery(state, item.record);
}

async function sendArchiveCard(id) {
  const state = await getState();
  const record = state.archive.find((candidate) => candidate.id === id);
  if (!record) throw new Error('Evidence card was not found.');
  if (record.delivery?.status === 'SENT') return { ok: false, error: 'This evidence was already sent to Notion.' };
  return attemptDelivery(state, record);
}

async function exportArchive() {
  const { archive, outbox: outboxItems } = await getState();
  const payload = { exportedAt: new Date().toISOString(), product: 'ProofClip', records: archive, outbox: outboxItems.map((item) => ({ id: item.id, record: item.record, error: item.error, createdAt: item.createdAt, retryState: item.retryState || 'RETRYABLE' })) };
  const url = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`;
  await chrome.downloads.download({ url, filename: `${safeFilename('proofclip-evidence')}-${new Date().toISOString().slice(0, 10)}.json`, saveAs: true });
}

async function archiveStateForUi() {
  const state = await getState();
  return { ok: true, state: { archive: state.archive, projects: state.projects } };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'GET_CONNECTION': return stateForUi();
      case 'START_AUTH': {
        const { authorizationUrl } = await proofclipApi('/v1/auth/notion/start', { storage: chrome.storage.local, method: 'POST' });
        await chrome.tabs.create({ url: authorizationUrl, active: true });
        return { ok: true };
      }
      case 'GET_DATA_SOURCES': return proofclipApi('/v1/data-sources', { storage: chrome.storage.local });
      case 'DISCONNECT_NOTION': {
        await proofclipApi('/v1/connection', { storage: chrome.storage.local, method: 'DELETE' });
        const state = await getState();
        state.settings = { dataSourceId: '', titleProperty: 'Name', urlProperty: 'URL' };
        await saveState(state);
        return { ok: true };
      }
      case 'SAVE_SETTINGS': {
        const state = await getState();
        state.settings = mergeSettings(state.settings, message.settings);
        await saveState(state);
        return { ok: true };
      }
      case 'CAPTURE_LOCAL': return captureLocal(message.mode, { fromPopup: true });
      case 'CAPTURE_WITH_ROUTE': return captureWithPopupFeedback(message.mode);
      case 'SEND_ARCHIVE_CARD': return sendArchiveCard(message.id);
      case 'SEND_ARCHIVE_BATCH': return sendArchiveBatch(message.ids, async (id) => {
        const current = await getState();
        const record = current.archive.find((card) => card.id === id);
        if (!record) return { ok: false, error: 'Evidence card was not found.' };
        if ((record.delivery?.status || 'PENDING') !== 'PENDING') return { ok: false, error: 'Only pending evidence can be sent in a batch.' };
        return attemptDelivery(current, record);
      });
      case 'SEND_FROM_TOAST': {
        const toastState = await getState();
        const record = toastState.archive.find((candidate) => candidate.id === message.id);
        if (!record) throw new Error('Evidence card was not found.');
        if (record.delivery?.status === 'SENT') return { ok: false, error: 'This evidence was already sent to Notion.' };
        return attemptDelivery(toastState, record);
      }
      case 'OPEN_ARCHIVE': await chrome.tabs.create({ url: chrome.runtime.getURL('archive.html'), active: true }); return { ok: true };
      case 'OPEN_ARCHIVE_CARD': {
        await chrome.tabs.create({ url: chrome.runtime.getURL(`archive.html?focus=${encodeURIComponent(message.id)}`), active: true });
        return { ok: true };
      }
      case 'GET_ARCHIVE_STATE': return archiveStateForUi();
      case 'CREATE_PROJECT': {
        const state = await getState();
        const next = createProject(state, { id: crypto.randomUUID(), name: message.name, createdAt: new Date().toISOString() });
        await saveState(next);
        return { ok: true, project: next.projects.at(-1) };
      }
      case 'RENAME_PROJECT': {
        const next = renameProject(await getState(), message.id, message.name);
        await saveState(next);
        return { ok: true };
      }
      case 'DELETE_PROJECT': {
        const next = deleteProject(await getState(), message.id, { moveToUnfiled: message.moveToUnfiled });
        await saveState(next);
        return { ok: true };
      }
      case 'UPDATE_CARD_METADATA': {
        const next = updateCardMetadata(await getState(), message.id, message.metadata);
        await saveState(next);
        return { ok: true };
      }
      case 'REMOVE_ARCHIVE_CARD': {
        const state = await getState();
        const removal = removeArchiveCard(state, message.id, { isDeliveryInFlight: (id) => deliveryInFlight.has(id) });
        if (!removal.ok) return removal;
        await saveState(removal.state);
        return { ok: true, removedOutboxCount: removal.removedOutboxCount };
      }
      case 'CAPTURE_REGION_PREVIEW': return captureRegionPreview({ fromPopup: true });
      case 'DUPLICATE_CONFIRM_RESPONSE': {
        const pending = duplicateConfirmRequests.get(message.requestId);
        if (pending) pending(message.proceed === true);
        return { ok: true };
      }
      case 'CANCEL_REGION_SELECTION': {
        if (activeRegionTabId != null) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: activeRegionTabId },
              func: () => {
                document.dispatchEvent(new CustomEvent('__proofclip-cancel-region'));
              }
            });
          } catch { /* tab may have closed or injection failed */ }
        }
        return { ok: true };
      }
      case 'RETRY_OUTBOX': {
        const retryState = await getState();
        const outboxItem = retryState.outbox.find((candidate) => candidate.id === message.id);
        if (!outboxItem) throw new Error('Outbox item was not found.');
        if (outboxItem.retryState === 'NEEDS_VERIFICATION') throw new Error('This delivery result is uncertain. Check Notion first, then use "Resend after checking Notion".');
        return retryOutbox(message.id);
      }
      case 'RESEND_AFTER_VERIFICATION': {
        const verifyState = await getState();
        const verifyItem = verifyState.outbox.find((candidate) => candidate.id === message.id);
        if (!verifyItem) throw new Error('Outbox item was not found.');
        if (verifyItem.retryState !== 'NEEDS_VERIFICATION') throw new Error('This item can be retried normally.');
        return attemptDelivery(verifyState, verifyItem.record);
      }
      case 'DELETE_OUTBOX': {
        const state = await getState();
        state.outbox = state.outbox.filter((item) => item.id !== message.id);
        await saveState(state);
        return { ok: true };
      }
      case 'EXPORT_ARCHIVE': await exportArchive(); return { ok: true };
      case 'CLEAR_ALL': await clearState(); return { ok: true };
      default: throw new Error('Unsupported ProofClip command.');
    }
  })().then(sendResponse).catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
  return true;
});

if (chrome.contextMenus) {
  const ensureContextMenu = () => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: 'ProofClip: Save selected text',
        contexts: ['selection']
      });
    });
  };
  chrome.runtime.onInstalled.addListener(ensureContextMenu);
  chrome.runtime.onStartup.addListener(ensureContextMenu);
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID) return;
    const selectionText = String(info.selectionText || '').trim();
    if (!selectionText) {
      await showPageToast(tab?.id, 'ProofClip: select text on the page first.', true);
      return;
    }
    try {
      const result = await captureSelectionFromContext(tab?.id, selectionText);
      if (!result?.ok && !result?.cancelled) {
        await showPageToast(tab?.id, `ProofClip: ${result?.error || 'Capture failed.'}`, true);
        return;
      }
      if (result.route === 'direct') {
        await showPageToast(tab?.id, 'ProofClip: sent to Notion.', false);
      } else {
        await showLocalSaveToast(tab?.id, result.record);
      }
    } catch (error) {
      await showPageToast(tab?.id, `ProofClip: ${errorMessage(error)}`, true);
    }
  });
}

if (chrome.commands) {
  chrome.commands.onCommand.addListener(async (command) => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return;
    const commandState = await getState();
    const route = normalizeCaptureRoute(commandState.settings.captureRoute);
    try {
      if (command === 'proofclip-capture-body') {
        if (route === 'direct') {
          const result = await captureDirect('body');
          if (result?.ok) await showPageToast(tab.id, 'ProofClip: sent to Notion.', false);
          else if (!result?.cancelled) await showPageToast(tab.id, `ProofClip: ${result?.error || 'Capture failed.'}`, true);
        } else {
          const result = await captureLocal('body');
          if (!result?.ok && !result?.cancelled) await showPageToast(tab.id, `ProofClip: ${result?.error || 'Capture failed.'}`, true);
        }
      } else if (command === 'proofclip-capture-selection') {
        let selectionText = '';
        try {
          [{ result: selectionText }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => String(window.getSelection()?.toString() || '').trim() });
        } catch { /* handled by the empty-selection guard below */ }
        if (!selectionText) {
          await showPageToast(tab.id, 'ProofClip: select text on the page first.', true);
          return;
        }
        const result = await captureSelectionFromContext(tab.id, selectionText);
        if (!result?.ok && !result?.cancelled) {
          await showPageToast(tab.id, `ProofClip: ${result?.error || 'Capture failed.'}`, true);
          return;
        }
        if (result.route === 'direct') await showPageToast(tab.id, 'ProofClip: sent to Notion.', false);
        else await showLocalSaveToast(tab.id, result.record);
      } else if (command === 'proofclip-capture-region') {
        const result = await captureRegionPreview();
        if (!result?.ok && !result?.cancelled) {
          await showPageToast(tab.id, `ProofClip: ${result?.error || 'Region capture failed.'}`, true);
        }
      }
    } catch (error) {
      await showPageToast(tab.id, `ProofClip: ${errorMessage(error)}`, true);
    }
  });
}
