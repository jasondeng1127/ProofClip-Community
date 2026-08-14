import { queryArchive } from './core/archive-query.mjs';

import { sendArchiveRequest } from './core/archive-actions.mjs';
import { pendingArchiveCards } from './core/archive-bulk-send.mjs';

const $ = (selector) => document.querySelector(selector);
const send = (message) => chrome.runtime.sendMessage(message);
let archiveState = { archive: [], projects: [] };
let classificationFeedbackByCardId = new Map();
let selectedCardId = null;

function setStatus(text, isError = false) {
  const node = $('#status'); node.textContent = text; node.classList.toggle('error', isError);
}

function setProjectFeedback(text, isError = false) {
  const node = $('#projectFeedback'); node.textContent = text; node.hidden = !text; node.classList.toggle('error', isError);
}

function setBatchDeliveryFeedback(text, isError = false) {
  const node = $('#batchDeliveryFeedback'); node.textContent = text; node.hidden = !text; node.classList.toggle('error', isError);
}

function setClassificationFeedback(cardId, node, text, isError = false) {
  if (text) classificationFeedbackByCardId.set(cardId, { text, isError });
  else classificationFeedbackByCardId.delete(cardId);
  node.textContent = text;
  node.hidden = !text;
  node.classList.toggle('error', isError);
}

function syncProjectActionState() {
  const canCreate = Boolean($('#newProjectName').value.trim());
  const selected = $('#filterProject').value;
  const canManage = Boolean(selected && selected !== 'unfiled');
  $('#newProject').disabled = !canCreate;
  $('#renameProject').disabled = !canManage;
  $('#deleteProject').disabled = !canManage;
}

function option(value, label, selected = false) {
  const node = document.createElement('option'); node.value = value; node.textContent = label; node.selected = selected; return node;
}

function selectedFilters() {
  return { text: $('#archiveSearch').value, projectId: $('#filterProject').value, tag: $('#filterTag').value, captureMode: $('#filterMode').value, deliveryStatus: $('#filterDelivery').value };
}

function filteredPendingCards() {
  return pendingArchiveCards(queryArchive(archiveState.archive, selectedFilters()));
}

function syncBatchDeliveryAction() {
  const pending = filteredPendingCards();
  const button = $('#sendFilteredToNotion');
  button.disabled = pending.length === 0;
  button.textContent = `Send filtered to Notion (${pending.length})`;
}

function safeSource(url) {
  try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : ''; }
  catch { return ''; }
}

function renderStructuredEvidence(container, card) {
  container.textContent = '';
  const blocks = card.contentBlocksComplete === true && Array.isArray(card.contentBlocks) ? card.contentBlocks : [];
  if (!blocks.length) {
    container.textContent = card.bodyText || 'This evidence has no captured text.';
    return;
  }
  for (const block of blocks) {
    if (block?.type === 'image') {
      const source = safeSource(block.imageUrl);
      if (!source) continue;
      const image = document.createElement('img');
      image.className = 'evidence-image'; image.src = source; image.alt = `Captured page image from ${card.title}`;
      container.append(image);
      continue;
    }
    const tag = { heading_1: 'h1', heading_2: 'h2', heading_3: 'h3', quote: 'blockquote', code: 'pre', bullet: 'p' }[block?.type] || 'p';
    const node = document.createElement(tag);
    node.className = `evidence-block evidence-${block?.type || 'paragraph'}`;
    const href = safeSource(block?.href);
    if (href) { const link = document.createElement('a'); link.href = href; link.target = '_blank'; link.rel = 'noreferrer noopener'; link.textContent = block.text || href; node.append(link); }
    else node.textContent = block?.text || '';
    if (node.textContent) container.append(node);
  }
  if (!container.childElementCount) container.textContent = card.bodyText || 'This evidence has no captured text.';
}

function renderFilters() {
  const currentProject = $('#filterProject').value;
  const currentTag = $('#filterTag').value;
  const projects = $('#filterProject'); projects.textContent = ''; projects.append(option('', 'All projects'));
  for (const project of archiveState.projects) projects.append(option(project.id, project.name, project.id === currentProject));
  const tags = [...new Set(archiveState.archive.flatMap((card) => card.tags || []))].sort();
  const tag = $('#filterTag'); tag.textContent = ''; tag.append(option('', 'All tags'));
  for (const value of tags) tag.append(option(value, value, value === currentTag));
}

function cardEditor(card) {
  const article = document.createElement('article'); article.className = 'card';
  article.dataset.cardId = card.id;
  if (card.screenshot?.dataUrl) { const image = document.createElement('img'); image.className = 'screenshot'; image.src = card.screenshot.dataUrl; image.alt = `Captured region from ${card.title}`; article.append(image); }
  const heading = document.createElement('h2'); heading.textContent = card.title; article.append(heading);
  const source = safeSource(card.canonicalUrl); if (source) { const link = document.createElement('a'); link.href = source; link.target = '_blank'; link.rel = 'noreferrer noopener'; link.textContent = source; article.append(link); }
  const meta = document.createElement('p'); meta.className = 'meta'; meta.textContent = `${new Date(card.capturedAt).toLocaleString()} · ${card.mode} · ${card.delivery?.status || 'PENDING'}`; article.append(meta);
  const projectLabel = document.createElement('label'); projectLabel.textContent = 'Project'; const project = document.createElement('select');
  for (const item of archiveState.projects) project.append(option(item.id, item.name, item.id === card.projectId)); projectLabel.append(project);
  const tagsLabel = document.createElement('label'); tagsLabel.textContent = 'Tags (comma-separated)'; const tags = document.createElement('input'); tags.value = (card.tags || []).join(', '); tagsLabel.append(tags);
  const noteLabel = document.createElement('label'); noteLabel.textContent = 'My note / summary'; const note = document.createElement('textarea'); note.maxLength = 2000; note.value = card.note || ''; noteLabel.append(note);
  const feedback = document.createElement('p'); feedback.className = 'action-feedback card-feedback'; feedback.hidden = true; feedback.setAttribute('aria-live', 'polite');
  const existingFeedback = classificationFeedbackByCardId.get(card.id);
  if (existingFeedback) setClassificationFeedback(card.id, feedback, existingFeedback.text, existingFeedback.isError);
  const deliveryActions = document.createElement('div'); deliveryActions.className = 'card-actions';
  const deliveryStatus = card.delivery?.status || 'PENDING';
  let sendToNotion;
  if (deliveryStatus === 'SENT') {
    const notionUrl = safeSource(card.delivery?.notionUrl);
    if (notionUrl) {
      const notionLink = document.createElement('a'); notionLink.href = notionUrl; notionLink.target = '_blank'; notionLink.rel = 'noreferrer noopener'; notionLink.textContent = 'Open sent page in Notion';
      deliveryActions.append(notionLink);
    }
  } else {
    sendToNotion = document.createElement('button'); sendToNotion.textContent = 'Send to Notion';
    sendToNotion.onclick = async () => {
      const originalLabel = sendToNotion.textContent;
      sendToNotion.disabled = true; sendToNotion.textContent = 'Sending…'; setClassificationFeedback(card.id, feedback, 'Sending this local evidence to Notion…');
      let result;
      try { result = await send({ type: 'SEND_ARCHIVE_CARD', id: card.id }); }
      catch (error) {
        sendToNotion.disabled = false; sendToNotion.textContent = originalLabel; setClassificationFeedback(card.id, feedback, error?.message || 'Could not send this evidence to Notion.', true); return;
      }
      if (!result?.ok) {
        sendToNotion.disabled = false; sendToNotion.textContent = originalLabel; setClassificationFeedback(card.id, feedback, result?.error || 'Could not send this evidence to Notion.', true); return;
      }
      classificationFeedbackByCardId.set(card.id, { text: 'Evidence sent to Notion.', isError: false });
      try { await refresh(); }
      catch (error) {
        sendToNotion.disabled = false; sendToNotion.textContent = originalLabel; setClassificationFeedback(card.id, feedback, error?.message || 'Evidence was sent, but the archive could not refresh.', true);
      }
    };
    deliveryActions.append(sendToNotion);
  }
  const removeLocalCopy = document.createElement('button'); removeLocalCopy.textContent = 'Remove local copy'; removeLocalCopy.className = 'danger';
  removeLocalCopy.onclick = async () => {
    if (sendToNotion?.disabled) return setClassificationFeedback(card.id, feedback, 'This evidence is being sent to Notion. Wait for the result before removing its local copy.', true);
    const sentNotice = deliveryStatus === 'SENT' ? ' The Notion page will not be deleted.' : '';
    if (!confirm(`Remove the local copy of “${card.title}”? This removes only this browser copy.${sentNotice}`)) return;
    const originalLabel = removeLocalCopy.textContent;
    removeLocalCopy.disabled = true; removeLocalCopy.textContent = 'Removing…'; setClassificationFeedback(card.id, feedback, 'Removing local copy…');
    let result;
    try { result = await send({ type: 'REMOVE_ARCHIVE_CARD', id: card.id }); }
    catch (error) {
      removeLocalCopy.disabled = false; removeLocalCopy.textContent = originalLabel; setClassificationFeedback(card.id, feedback, error?.message || 'Could not remove this local copy.', true); return;
    }
    if (!result?.ok) {
      removeLocalCopy.disabled = false; removeLocalCopy.textContent = originalLabel; setClassificationFeedback(card.id, feedback, result?.error || 'Could not remove this local copy.', true); return;
    }
    classificationFeedbackByCardId.delete(card.id);
    try { await refresh(); setStatus('Local copy removed.'); }
    catch (error) {
      removeLocalCopy.disabled = false; removeLocalCopy.textContent = originalLabel; setClassificationFeedback(card.id, feedback, error?.message || 'Local copy was removed, but the archive could not refresh.', true);
    }
  };
  deliveryActions.append(removeLocalCopy);
  const save = document.createElement('button'); save.textContent = 'Save classification'; save.onclick = async () => {
    const originalLabel = save.textContent;
    save.disabled = true; save.textContent = 'Saving…'; setClassificationFeedback(card.id, feedback, 'Saving classification…');
    let result;
    try {
      result = await send({ type: 'UPDATE_CARD_METADATA', id: card.id, metadata: { projectId: project.value, tags: tags.value.split(','), note: note.value } });
    } catch (error) {
      save.disabled = false; save.textContent = originalLabel; setClassificationFeedback(card.id, feedback, error?.message || 'Could not save classification.', true); return;
    }
    if (!result?.ok) { save.disabled = false; save.textContent = originalLabel; return setClassificationFeedback(card.id, feedback, result?.error || 'Could not save classification.', true); }
    classificationFeedbackByCardId.set(card.id, { text: 'Classification saved locally.', isError: false });
    try {
      await refresh();
    } catch (error) {
      save.disabled = false; save.textContent = originalLabel; setClassificationFeedback(card.id, feedback, error?.message || 'Classification was saved, but the archive could not refresh.', true);
    }
  };
  article.append(deliveryActions, feedback);
  const properties = document.createElement('section'); properties.className = 'card-properties'; properties.setAttribute('aria-label', 'Evidence properties');
  const propsHeading = document.createElement('h3'); propsHeading.textContent = 'Properties'; properties.append(propsHeading, projectLabel, tagsLabel, noteLabel, save);
  article.append(properties);
  if (card.truncated) { const warning = document.createElement('p'); warning.className = 'warning'; warning.textContent = 'This previously saved record was truncated.'; article.append(warning); }
  if (card.bodyText) { const excerpt = document.createElement('p'); excerpt.className = 'excerpt'; excerpt.textContent = card.bodyText; article.append(excerpt); }
  return article;
}

function cardSummary(card) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'archive-row';
  row.dataset.cardId = card.id;
  if (card.id === selectedCardId) row.classList.add('selected');
  const title = document.createElement('strong'); title.textContent = card.title;
  const source = document.createElement('span'); source.className = 'archive-row-source'; source.textContent = safeSource(card.canonicalUrl) || 'Local evidence';
  const excerpt = document.createElement('span'); excerpt.className = 'archive-row-excerpt'; excerpt.textContent = String(card.bodyText || card.note || 'Image evidence').replace(/\s+/g, ' ').slice(0, 150);
  const meta = document.createElement('span'); meta.className = 'archive-row-meta'; meta.textContent = `${card.mode} · ${card.delivery?.status || 'PENDING'}`;
  row.append(title, source, excerpt, meta);
  row.onclick = () => selectCard(card);
  return row;
}

function selectCard(card) {
  selectedCardId = card.id;
  const content = $('#readerContent');
  content.textContent = '';
  content.append(cardEditor(card));
  content.hidden = false;
  $('#readerEvidence').hidden = false;
  renderStructuredEvidence($('#readerText'), card);
  for (const row of document.querySelectorAll('.archive-row')) row.classList.toggle('selected', row.dataset.cardId === card.id);
}

function renderCards() {
  const cards = $('#cards'); cards.textContent = '';
  const visible = queryArchive(archiveState.archive, selectedFilters());
  $('#archiveCount').textContent = `${visible.length} of ${archiveState.archive.length} records`;
  syncBatchDeliveryAction();
  if (!visible.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No evidence matches these filters.'; cards.append(empty); $('#readerContent').hidden = true; $('#readerEvidence').hidden = true; return; }
  for (const card of visible) cards.append(cardSummary(card));
  const selected = visible.find((card) => card.id === selectedCardId) || visible[0];
  selectCard(selected);
}

async function refresh() {
  const result = await send({ type: 'GET_ARCHIVE_STATE' });
  if (!result?.ok) throw new Error(result?.error || 'Could not load local archive.');
  archiveState = result.state; renderFilters(); renderCards(); syncProjectActionState();
}

function focusCardFromUrl() {
  const focus = new URLSearchParams(location.search).get('focus');
  if (!focus) return;
  const selected = archiveState.archive.find((card) => card.id === focus);
  if (!selected) return;
  selectCard(selected);
  const row = document.querySelector(`[data-card-id="${CSS.escape(focus)}"]`);
  if (!row) return;
  row.scrollIntoView({ block: 'center' });
  row.classList.add('focus-highlight');
}

for (const id of ['archiveSearch', 'filterTag', 'filterMode', 'filterDelivery']) $(id ? `#${id}` : id).addEventListener(id === 'archiveSearch' ? 'input' : 'change', renderCards);
$('#filterProject').addEventListener('change', () => { renderCards(); syncProjectActionState(); });
$('#newProjectName').addEventListener('input', () => { syncProjectActionState(); setProjectFeedback(''); });

$('#sendFilteredToNotion').onclick = async () => {
  const pending = filteredPendingCards();
  if (!pending.length) return setBatchDeliveryFeedback('No unsent records match the current filters.', true);
  if (!confirm(`Send ${pending.length} filtered record(s) to Notion? Already sent records will be skipped.`)) return;
  const button = $('#sendFilteredToNotion');
  button.disabled = true; button.textContent = `Sending ${pending.length} record(s)…`;
  setBatchDeliveryFeedback(`Sending ${pending.length} record(s) to Notion…`);
  const result = await sendArchiveRequest(send, { type: 'SEND_ARCHIVE_BATCH', ids: pending.map((card) => card.id) }, 'Could not send filtered records to Notion.');
  if (!result?.ok && !Number.isInteger(result?.total)) {
    button.disabled = false; button.textContent = `Send filtered to Notion (${pending.length})`;
    return setBatchDeliveryFeedback(result?.error || 'Could not send filtered records to Notion.', true);
  }
  try {
    await refresh();
    const message = result.failed ? `Sent ${result.sent} of ${result.total} record(s). ${result.failed} failed record(s) are in Outbox.` : `Sent ${result.sent} record(s) to Notion.`;
    setBatchDeliveryFeedback(message, Boolean(result.failed));
  } catch (error) {
    setBatchDeliveryFeedback(error?.message || 'Records were sent, but the archive could not refresh.', true);
  }
};

$('#newProject').onclick = async () => {
  const name = $('#newProjectName').value.trim(); if (!name) return setProjectFeedback('Enter a project name first.', true);
  setProjectFeedback('Creating project…');
  const result = await sendArchiveRequest(send, { type: 'CREATE_PROJECT', name }, 'Could not create project.'); if (!result?.ok) return setProjectFeedback(result?.error || 'Could not create project.', true);
  $('#newProjectName').value = ''; await refresh(); setProjectFeedback('Project created locally. Assign cards from their Project menu below.');
};

$('#renameProject').onclick = async () => {
  const id = $('#filterProject').value; if (!id || id === 'unfiled') return setProjectFeedback('Choose a non-default project to rename.', true);
  const current = archiveState.projects.find((project) => project.id === id); const name = prompt('Project name', current?.name || ''); if (name == null) return;
  setProjectFeedback('Renaming project…');
  const result = await sendArchiveRequest(send, { type: 'RENAME_PROJECT', id, name }, 'Could not rename project.'); if (!result?.ok) return setProjectFeedback(result?.error || 'Could not rename project.', true);
  await refresh(); $('#filterProject').value = id; renderCards(); syncProjectActionState(); setProjectFeedback('Project renamed locally.');
};

$('#deleteProject').onclick = async () => {
  const id = $('#filterProject').value; if (!id || id === 'unfiled') return setProjectFeedback('Choose a non-default project to delete.', true);
  const current = archiveState.projects.find((project) => project.id === id); const count = archiveState.archive.filter((card) => card.projectId === id).length;
  if (!confirm(`Delete ${current?.name || 'this project'}? ${count} card(s) will move to Unfiled.`)) return;
  setProjectFeedback('Deleting project…');
  const result = await sendArchiveRequest(send, { type: 'DELETE_PROJECT', id, moveToUnfiled: true }, 'Could not delete project.'); if (!result?.ok) return setProjectFeedback(result?.error || 'Could not delete project.', true);
  await refresh(); setProjectFeedback('Project deleted; its cards moved to Unfiled.');
};

$('#openFullReader').onclick = () => {
  $('#fullReaderText').replaceChildren(...$('#readerText').cloneNode(true).childNodes);
  $('#fullReader').showModal();
};
$('#closeFullReader').onclick = () => $('#fullReader').close();

refresh()
  .then(() => { setStatus('Local archive ready.'); focusCardFromUrl(); })
  .catch((error) => setStatus(error.message || String(error), true));
