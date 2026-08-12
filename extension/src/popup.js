import { deliveryLinkState } from './core/notion-link.mjs';
import { canSaveTargetMapping, captureFeedback } from './core/capture-feedback.mjs';
import { failureFeedback, pendingFeedback, runWithTimeout, successFeedback } from './core/action-feedback.mjs';
import { allTemplates, CAPTURE_VALUE_SOURCES, createUserTemplate, editableTemplateDraft, normalizeUserTemplates, removeUserTemplate, standardUserTemplateFields, validateTemplateMapping, validateUserTemplate, USER_TEMPLATE_ID_PREFIX } from './core/evidence-templates.mjs';
import { duplicateConfirmMessage } from './core/archive-dedup.mjs';
import { communityPrivacyUrl } from './core/proofclip-api.mjs';

const $ = (selector) => document.querySelector(selector);
const send = (message) => chrome.runtime.sendMessage(message);
let notionConnected = false;
let dataSources = [];
let currentSettings = {};

const privacyLink = $('.privacy-link');
try { privacyLink.href = communityPrivacyUrl(); }
catch { privacyLink.hidden = true; }

function setStatus(text, isError = false) {
  const node = $('#status');
  node.textContent = text;
  node.classList.toggle('error', isError);
}

function actionFeedback(name) {
  return $(`[data-action-feedback="${name}"]`);
}

function renderActionFeedback(node, feedback) {
  node.textContent = feedback.text;
  node.hidden = false;
  node.classList.toggle('error', feedback.isError);
}

function requireOk(result, fallback) {
  if (!result?.ok) throw new Error(result?.error || fallback);
  return result;
}

async function runButtonAction({ button, feedback, pendingLabel, successText, action, resultFeedback, refreshAfter = false }) {
  const pending = pendingFeedback(pendingLabel);
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  renderActionFeedback(feedback, pending);
  const settled = await runWithTimeout(action);
  if (!settled.ok) {
    renderActionFeedback(feedback, failureFeedback(settled.error));
  } else {
    const result = settled.value;
    renderActionFeedback(feedback, resultFeedback ? resultFeedback(result) : successFeedback(typeof successText === 'function' ? successText(result) : successText));
    if (refreshAfter) {
      try { await refresh(); }
      catch (error) { renderActionFeedback(feedback, failureFeedback(error)); }
    }
  }
  if (button.isConnected) {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
  return settled;
}

function renderDeliveryLink(value) {
  const state = deliveryLinkState(value);
  const container = $('#deliveryLink');
  const link = container.querySelector('a');
  container.hidden = !state.visible;
  if (state.visible) link.href = state.href;
  else link.removeAttribute('href');
}

function renderOutbox(items) {
  $('#outboxCount').textContent = String(items.length);
  document.querySelector('.outbox-card').classList.toggle('has-items', items.length > 0);
  const outbox = $('#outbox');
  outbox.textContent = '';
  if (!items.length) { outbox.textContent = 'No failed deliveries.'; return; }
  for (const item of items) {
    const row = document.createElement('div'); row.className = 'outbox-item';
    const title = document.createElement('strong'); title.textContent = item.title;
    const error = document.createElement('small'); error.textContent = item.error;
    const feedback = document.createElement('small'); feedback.className = 'action-feedback'; feedback.hidden = true; feedback.setAttribute('aria-live', 'polite');
    const needsVerification = item.retryState === 'NEEDS_VERIFICATION';
    const isRetryable = item.retryState === 'RETRYABLE' || !item.retryState;
    const retry = document.createElement('button');
    retry.className = 'secondary';
    if (needsVerification) {
      retry.textContent = 'Verify';
      retry.onclick = async () => {
        if (!confirm('Have you checked the target Notion Data Source? The previous delivery outcome is unknown — resending can create a duplicate page. Only resend after confirming the evidence is not already present.')) return;
        const settled = await runButtonAction({
          button: retry,
          feedback,
          pendingLabel: 'Resending',
          successText: 'Evidence sent to Notion.',
          action: async () => requireOk(await send({ type: 'RESEND_AFTER_VERIFICATION', id: item.id }), 'Resend after verification failed.'),
          refreshAfter: true
        });
        if (settled.ok) renderDeliveryLink(settled.value.delivery?.url || '');
      };
    } else {
      retry.textContent = 'Retry';
      retry.onclick = async () => {
        const settled = await runButtonAction({
          button: retry,
          feedback,
          pendingLabel: 'Retrying',
          successText: 'Evidence sent to Notion.',
          action: async () => requireOk(await send({ type: 'RETRY_OUTBOX', id: item.id }), 'Delivery retry failed.'),
          refreshAfter: true
        });
        if (settled.ok) renderDeliveryLink(settled.value.delivery?.url || '');
      };
    }
    const discard = document.createElement('button'); discard.textContent = 'Discard'; discard.className = 'danger';
    discard.onclick = async () => {
      if (!confirm('Discard this failed delivery? The local archive record will remain.')) return;
      await runButtonAction({
        button: discard,
        feedback,
        pendingLabel: 'Discarding',
        successText: 'Queued delivery discarded.',
        action: async () => requireOk(await send({ type: 'DELETE_OUTBOX', id: item.id }), 'Could not discard the queued delivery.'),
        refreshAfter: true
      });
    };
    row.append(title, error, feedback, retry, document.createTextNode(' '), discard); outbox.append(row);
  }
}

function renderRecentCapture(record) {
  const preview = $('#recentPreview');
  const thumbnail = $('#recentThumbnail');
  const placeholder = preview.querySelector('.recent-placeholder');
  const title = $('#recentTitle');
  const meta = $('#recentMeta');
  const saveStatus = $('#recentSaveStatus');
  if (!record) {
    preview.dataset.mode = 'body';
    thumbnail.hidden = true;
    thumbnail.removeAttribute('src');
    placeholder.hidden = false;
    title.textContent = 'No captures yet';
    meta.textContent = 'Your next capture will appear here.';
    saveStatus.hidden = true;
    return;
  }
  preview.dataset.mode = record.mode || 'body';
  title.textContent = record.title || 'Untitled page';
  meta.textContent = record.capturedAt ? new Date(record.capturedAt).toLocaleString() : 'Saved locally';
  saveStatus.hidden = false;
  if (record.screenshot?.dataUrl) {
    thumbnail.src = record.screenshot.dataUrl;
    thumbnail.hidden = false;
    placeholder.hidden = true;
  } else {
    thumbnail.hidden = true;
    thumbnail.removeAttribute('src');
    placeholder.hidden = false;
  }
}

function showPage(page) {
  for (const section of document.querySelectorAll('.page[data-page]')) {
    const selected = section.dataset.page === page;
    section.hidden = !selected;
    section.classList.toggle('active', selected);
  }
  for (const button of document.querySelectorAll('.nav-item[data-page]')) {
    button.classList.toggle('active', button.dataset.page === page);
  }
}

function renderDataSources(dataSources, selected) {
  const select = $('#dataSourceId');
  select.textContent = '';
  const placeholder = document.createElement('option');
  placeholder.value = ''; placeholder.textContent = dataSources.length ? 'Choose a Data Source' : 'No Data Sources available';
  select.append(placeholder);
  for (const source of dataSources) {
    const option = document.createElement('option');
    option.value = source.id; option.textContent = source.title;
    option.selected = source.id === selected;
    select.append(option);
  }
}

function selectedTemplate() {
  const templates = allTemplates(currentSettings.userTemplates);
  return templates.find((template) => template.id === $('#templateId').value) || templates[0];
}

function selectedDataSource() {
  return dataSources.find((source) => source.id === $('#dataSourceId').value) || null;
}

function renderTemplateOptions(selected) {
  const select = $('#templateId'); select.textContent = '';
  for (const template of allTemplates(currentSettings.userTemplates)) {
    const option = document.createElement('option'); option.value = template.id; option.textContent = template.id.startsWith(USER_TEMPLATE_ID_PREFIX) ? `${template.name} (custom)` : template.name; option.selected = template.id === selected; select.append(option);
  }
}

let templateDraft = { id: null, name: '', fields: [] };

function renderTemplateFields() {
  const container = $('#templateFields'); container.textContent = '';
  templateDraft.fields.forEach((field, index) => {
    const row = document.createElement('div'); row.className = 'template-field-row';
    const label = document.createElement('input'); label.value = field.label; label.placeholder = 'Field label';
    label.oninput = () => { templateDraft.fields[index].label = label.value; };
    const isCore = field.id === 'title' || field.id === 'url';
    const valueSource = CAPTURE_VALUE_SOURCES.find((source) => source.id === field.valueSource) || CAPTURE_VALUE_SOURCES.find((source) => source.id === 'bodyText');
    const type = document.createElement('select');
    for (const option of valueSource.types) {
      const node = document.createElement('option'); node.value = option; node.textContent = option; node.selected = field.types.includes(option); type.append(node);
    }
    type.onchange = () => { templateDraft.fields[index].types = [type.value]; };
    const required = document.createElement('input'); required.type = 'checkbox'; required.checked = field.required;
    required.onchange = () => { templateDraft.fields[index].required = required.checked; };
    required.disabled = isCore;
    const requiredLabel = document.createElement('label'); requiredLabel.className = 'inline-label'; requiredLabel.append(required, document.createTextNode(' Required'));
    const remove = document.createElement('button'); remove.className = 'danger'; remove.textContent = 'Remove';
    remove.disabled = isCore;
    remove.onclick = () => { templateDraft.fields.splice(index, 1); renderTemplateFields(); };
    row.append(label, type, requiredLabel, remove); container.append(row);
    if (!isCore) {
      const sourceLabel = document.createElement('label'); sourceLabel.className = 'template-source-control'; sourceLabel.append(document.createTextNode('Capture value'));
      const source = document.createElement('select');
      for (const option of CAPTURE_VALUE_SOURCES) {
        const node = document.createElement('option'); node.value = option.id; node.textContent = option.label; node.selected = option.id === valueSource.id; source.append(node);
      }
      source.onchange = () => { const selected = CAPTURE_VALUE_SOURCES.find((option) => option.id === source.value); templateDraft.fields[index].valueSource = selected.id; templateDraft.fields[index].types = [selected.types[0]]; renderTemplateFields(); };
      sourceLabel.append(source); row.append(sourceLabel);
    }
  });
}

function loadTemplateDraft(template) {
  templateDraft = template ? structuredClone(template) : { id: null, name: '', fields: standardUserTemplateFields() };
  $('#templateName').value = templateDraft.name || '';
  renderTemplateFields();
}

function renderTemplateMappings() {
  const container = $('#templateMappings'); container.textContent = '';
  const template = selectedTemplate(); const source = selectedDataSource();
  const mappings = currentSettings.fieldMappings || {};
  for (const field of template.fields) {
    const label = document.createElement('label'); label.textContent = `${field.label}${field.required ? ' *' : ' (optional)'}`;
    const select = document.createElement('select'); select.dataset.field = field.id;
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = field.required ? `Choose ${field.label}` : 'Do not map'; select.append(empty);
    const fallback = field.id === 'title' ? currentSettings.titleProperty : field.id === 'url' ? currentSettings.urlProperty : '';
    const selected = mappings[field.id] || fallback || '';
    for (const property of source?.properties || []) {
      if (!field.types.includes(property.type)) continue;
      const option = document.createElement('option'); option.value = property.name; option.textContent = `${property.name} (${property.type})`; option.dataset.propertyType = property.type; option.selected = property.name === selected; select.append(option);
    }
    label.append(select); container.append(label);
  }
  updateMappingControls();
}

function collectTemplateMapping() {
  const fieldMappings = {}; const propertyTypes = {};
  for (const select of document.querySelectorAll('#templateMappings select[data-field]')) {
    if (!select.value) continue;
    fieldMappings[select.dataset.field] = select.value;
    propertyTypes[select.dataset.field] = select.selectedOptions[0]?.dataset.propertyType || '';
  }
  return { fieldMappings, propertyTypes, validation: validateTemplateMapping(selectedTemplate(), selectedDataSource()?.properties || [], fieldMappings) };
}

function updateMappingControls() {
  const eligible = canSaveTargetMapping(notionConnected, $('#dataSourceId').value);
  const { validation } = collectTemplateMapping();
  $('#saveSettings').disabled = !eligible || !validation.valid;
  $('#templateValidation').textContent = !$('#dataSourceId').value ? 'Choose a Data Source to map evidence fields.' : validation.valid ? 'Template mapping is ready.' : validation.errors.join(' ');
  $('#templateValidation').classList.toggle('error', Boolean(validation.errors.length));
}

let duplicateRequestId = null;
let duplicateCountdownTimer = null;

function hideDuplicateConfirm() {
  duplicateRequestId = null;
  if (duplicateCountdownTimer) clearInterval(duplicateCountdownTimer);
  duplicateCountdownTimer = null;
  $('#duplicateConfirm').hidden = true;
}

function showDuplicateConfirm(message) {
  duplicateRequestId = message.requestId;
  $('#duplicateConfirmText').textContent = duplicateConfirmMessage(message.capturedAt);
  let secondsLeft = 3;
  $('#duplicateConfirmCountdown').textContent = `Continuing in ${secondsLeft}…`;
  $('#duplicateConfirm').hidden = false;
  if (duplicateCountdownTimer) clearInterval(duplicateCountdownTimer);
  duplicateCountdownTimer = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      clearInterval(duplicateCountdownTimer);
      duplicateCountdownTimer = null;
      const requestId = duplicateRequestId;
      hideDuplicateConfirm();
      send({ type: 'DUPLICATE_CONFIRM_RESPONSE', requestId, proceed: true });
      return;
    }
    $('#duplicateConfirmCountdown').textContent = `Continuing in ${secondsLeft}…`;
  }, 1000);
}

function answerDuplicate(proceed) {
  const requestId = duplicateRequestId;
  hideDuplicateConfirm();
  if (requestId) send({ type: 'DUPLICATE_CONFIRM_RESPONSE', requestId, proceed });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'DUPLICATE_CONFIRM_REQUEST') {
    showDuplicateConfirm(message);
    sendResponse({ ok: true });
  }
});

$('#duplicateConfirmContinue').onclick = () => answerDuplicate(true);
$('#duplicateConfirmCancel').onclick = () => answerDuplicate(false);

async function refresh() {
  const state = await send({ type: 'GET_CONNECTION' });
  if (state.error) return setStatus(state.error, true);
  const connected = Boolean(state.connection?.connected);
  notionConnected = connected;
  $('#connectionStatus').textContent = state.connectionError ? `Connection check failed: ${state.connectionError}` : connected ? 'Connected to Notion.' : 'Notion is not connected.';
  $('#connectNotion').hidden = connected;
  $('#disconnectNotion').hidden = !connected;
  currentSettings = state.settings || {};
  renderTemplateOptions(currentSettings.templateId || 'buyer-account');
  if (connected) {
    try { const result = await send({ type: 'GET_DATA_SOURCES' }); dataSources = result.dataSources || []; renderDataSources(dataSources, state.settings.dataSourceId); }
    catch (error) { dataSources = []; renderDataSources([], ''); setStatus(error.message || String(error), true); }
  } else { dataSources = []; renderDataSources([], ''); }
  renderTemplateMappings();
  $('#archiveCount').textContent = `${state.archiveCount} record${state.archiveCount === 1 ? '' : 's'}`;
  renderRecentCapture(state.recentCapture);
  $('#captureRoute').value = currentSettings.captureRoute || 'archive';
  renderOutbox(state.outbox);
  if (state.connectionError) setStatus(`Connection check failed: ${state.connectionError}`, true);
  else setStatus(connected ? 'Notion connected.' : 'Notion not connected.');
}

for (const button of document.querySelectorAll('[data-capture]')) {
  button.addEventListener('click', async () => {
    renderDeliveryLink('');
    const settled = await runButtonAction({
      button,
      feedback: actionFeedback('capture'),
      pendingLabel: 'Capturing',
      action: () => send({ type: 'CAPTURE_WITH_ROUTE', mode: button.dataset.capture }),
      resultFeedback: (result) => {
        if (result?.cancelled) return { text: '', isError: false };
        if (result?.route === 'direct') {
          if (result?.delivery) return successFeedback('Evidence sent to Notion.');
          return failureFeedback(result?.error || 'Direct delivery failed.');
        }
        return captureFeedback(result);
      },
      refreshAfter: true
    });
    if (settled?.ok && settled?.value?.route === 'direct') {
      renderDeliveryLink(settled.value.delivery?.url || '');
    }
  });
}

$('#captureRegion').onclick = () => {
  renderDeliveryLink('');
  return runButtonAction({
    button: $('#captureRegion'),
    feedback: actionFeedback('capture'),
    pendingLabel: 'Select a region on the page',
    successText: 'Region captured and saved.',
    action: () => send({ type: 'CAPTURE_REGION_PREVIEW' }),
    resultFeedback: (result) => {
      if (result?.cancelled) return { text: '', isError: false };
      if (result?.route === 'direct') {
        if (result?.delivery) return successFeedback('Evidence sent to Notion.');
        return failureFeedback(result?.error || 'Direct delivery failed.');
      }
      return captureFeedback(result);
    },
    refreshAfter: true
  });
};

$('#dataSourceId').addEventListener('change', updateMappingControls);
$('#dataSourceId').addEventListener('change', renderTemplateMappings);
$('#templateId').addEventListener('change', renderTemplateMappings);
$('#templateMappings').addEventListener('change', updateMappingControls);

const templateFeedback = actionFeedback('template');
$('#newTemplate').onclick = () => { loadTemplateDraft(null); renderActionFeedback(templateFeedback, successFeedback('New template ready. Add fields, then save.')); };
$('#editTemplate').onclick = () => { const selected = selectedTemplate(); const copied = !selected.id.startsWith(USER_TEMPLATE_ID_PREFIX); loadTemplateDraft(editableTemplateDraft(selected)); renderActionFeedback(templateFeedback, successFeedback(copied ? 'Editing a custom copy. Save to add it to your templates.' : 'Editing the selected template. Save to apply changes.')); };
$('#addTemplateField').onclick = () => {
  templateDraft.fields.push({ id: `field-${templateDraft.fields.length + 1}`, label: '', required: false, valueSource: 'bodyText', types: ['rich_text'] });
  renderTemplateFields();
};
$('#saveTemplate').onclick = () => runButtonAction({
  button: $('#saveTemplate'),
  feedback: templateFeedback,
  pendingLabel: 'Saving template',
  successText: 'Template saved.',
  action: async () => {
    const draft = createUserTemplate({ name: $('#templateName').value, fields: templateDraft.fields }, templateDraft.id || undefined);
    const validation = validateUserTemplate(draft);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    const existing = normalizeUserTemplates(currentSettings.userTemplates).filter((template) => template.id !== draft.id);
    return requireOk(await send({ type: 'SAVE_SETTINGS', settings: { userTemplates: [...existing, draft], templateId: draft.id } }), 'Template could not be saved.');
  },
  refreshAfter: true
});
$('#deleteTemplate').onclick = () => {
  const selected = selectedTemplate();
  if (!selected || !selected.id.startsWith(USER_TEMPLATE_ID_PREFIX)) return renderActionFeedback(templateFeedback, failureFeedback('Choose a custom template to delete.'));
  if (!confirm('Delete this template? Existing archived evidence cards are not affected.')) return;
  return runButtonAction({
    button: $('#deleteTemplate'),
    feedback: templateFeedback,
    pendingLabel: 'Deleting template',
    successText: 'Template deleted; archived cards were not affected.',
    action: async () => requireOk(await send({ type: 'SAVE_SETTINGS', settings: { userTemplates: removeUserTemplate(currentSettings.userTemplates, selected.id), templateId: 'buyer-account' } }), 'Template could not be deleted.'),
    refreshAfter: true
  });
};
$('#setDefaultTemplate').onclick = () => runButtonAction({
  button: $('#setDefaultTemplate'),
  feedback: templateFeedback,
  pendingLabel: 'Saving default template',
  successText: 'Default template set.',
  action: async () => {
    const selected = selectedTemplate();
    if (!selected) throw new Error('Choose a template first.');
    return requireOk(await send({ type: 'SAVE_SETTINGS', settings: { templateId: selected.id } }), 'Default template could not be saved.');
  },
  refreshAfter: true
});

const saveSettingsButton = $('#saveSettings');
saveSettingsButton.onclick = async () => {
  if (!canSaveTargetMapping(notionConnected, $('#dataSourceId').value)) return renderActionFeedback(actionFeedback('notion'), failureFeedback('Choose a Notion Data Source before saving the target mapping.'));
  const { fieldMappings, propertyTypes, validation } = collectTemplateMapping();
  if (!validation.valid) return renderActionFeedback(actionFeedback('notion'), failureFeedback(validation.errors.join(' ')));
  const settings = {
    dataSourceId: $('#dataSourceId').value.trim(),
    templateId: $('#templateId').value,
    templateFields: selectedTemplate().fields,
    fieldMappings,
    propertyTypes,
    titleProperty: fieldMappings.title,
    urlProperty: fieldMappings.url
  };
  await runButtonAction({
    button: saveSettingsButton,
    feedback: actionFeedback('notion'),
    pendingLabel: 'Saving target mapping',
    successText: 'Target mapping saved locally.',
    action: async () => requireOk(await send({ type: 'SAVE_SETTINGS', settings }), 'Target mapping could not be saved.'),
    refreshAfter: true
  });
};

const captureRouteSelect = $('#captureRoute');
captureRouteSelect.addEventListener('change', async () => {
  const route = captureRouteSelect.value;
  await send({ type: 'SAVE_SETTINGS', settings: { captureRoute: route } });
});
const connectNotionButton = $('#connectNotion');
connectNotionButton.onclick = async () => {
  await runButtonAction({
    button: connectNotionButton,
    feedback: actionFeedback('notion'),
    pendingLabel: 'Opening Notion authorization',
    successText: 'Complete Notion approval in the new tab, then reopen ProofClip.',
    action: async () => requireOk(await send({ type: 'START_AUTH' }), 'Notion authorization could not be opened.')
  });
};
const disconnectNotionButton = $('#disconnectNotion');
disconnectNotionButton.onclick = async () => {
  if (!confirm('Disconnect Notion and delete the saved connection from ProofClip?')) return;
  await runButtonAction({
    button: disconnectNotionButton,
    feedback: actionFeedback('notion'),
    pendingLabel: 'Disconnecting Notion',
    successText: 'Notion connection deleted.',
    action: async () => requireOk(await send({ type: 'DISCONNECT_NOTION' }), 'Notion connection could not be deleted.'),
    refreshAfter: true
  });
};

const exportArchiveButton = $('#exportArchive');
async function openArchive(button) {
  await runButtonAction({
    button,
    feedback: actionFeedback('archive'),
    pendingLabel: 'Opening archive',
    successText: 'Local archive opened in a new tab.',
    action: async () => requireOk(await send({ type: 'OPEN_ARCHIVE' }), 'Archive could not be opened.')
  });
}
const openArchiveButton = $('#openArchive');
openArchiveButton.onclick = () => openArchive(openArchiveButton);
const openArchiveFromPageButton = $('#openArchiveFromPage');
openArchiveFromPageButton.onclick = () => openArchive(openArchiveFromPageButton);
exportArchiveButton.onclick = async () => {
  await runButtonAction({
    button: exportArchiveButton,
    feedback: actionFeedback('archive'),
    pendingLabel: 'Preparing download',
    successText: 'Export download started.',
    action: async () => requireOk(await send({ type: 'EXPORT_ARCHIVE' }), 'Export could not be started.')
  });
};
const clearAllButton = $('#clearAll');
clearAllButton.onclick = async () => {
  if (!confirm('Clear the local archive, target mapping, and Outbox? This cannot be undone. Use Disconnect Notion separately to delete the server-side connection.')) return;
  await runButtonAction({
    button: clearAllButton,
    feedback: actionFeedback('archive'),
    pendingLabel: 'Clearing local data',
    successText: 'Local archive, target mapping, and Outbox were cleared.',
    action: async () => requireOk(await send({ type: 'CLEAR_ALL' }), 'Local data could not be cleared.'),
    refreshAfter: true
  });
};

for (const button of document.querySelectorAll('.nav-item[data-page]')) {
  button.addEventListener('click', async () => {
    if (button.dataset.page === 'archive') {
      await openArchive(button);
      window.close();
      return;
    }
    showPage(button.dataset.page);
  });
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    send({ type: 'CANCEL_REGION_SELECTION' });
  }
});

refresh();
