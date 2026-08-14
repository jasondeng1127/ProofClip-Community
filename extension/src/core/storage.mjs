import { compactText } from './text.mjs';
import { migrateEvidenceState } from './evidence-migration.mjs';
import { createDefaultArchiveStore } from './archive-store.mjs';
import { normalizeTemplateFields, normalizeUserTemplates } from './evidence-templates.mjs';

const KEYS = {
  schemaVersion: 'archiveSchemaVersion',
  settings: 'settings',
  outbox: 'outbox',
  projects: 'projects'
};
const ARCHIVE_MIGRATION_KEY = 'archiveIdbMigrated';

let archiveStoreInstance = null;
let stateMutationQueue = Promise.resolve();

function archiveStore() {
  if (!archiveStoreInstance) archiveStoreInstance = createDefaultArchiveStore();
  return archiveStoreInstance;
}

// Node offline tests run without IndexedDB; a module-level memory store can
// outlive a single test, so tests that need isolation call this before seeding.
export function resetArchiveStoreForTests() {
  archiveStoreInstance = null;
}

async function ensureArchiveMigrated() {
  const stored = await chrome.storage.local.get(['archive', ARCHIVE_MIGRATION_KEY]);
  if (stored[ARCHIVE_MIGRATION_KEY]) return;
  const legacy = Array.isArray(stored.archive) ? stored.archive : [];
  for (const record of legacy) await archiveStore().put(record);
  await chrome.storage.local.remove(['archive']);
  await chrome.storage.local.set({ [ARCHIVE_MIGRATION_KEY]: true });
}

export async function getState() {
  await ensureArchiveMigrated();
  const stored = await chrome.storage.local.get(Object.values(KEYS));
  const archive = await archiveStore().list();
  return migrateEvidenceState({
    schemaVersion: stored[KEYS.schemaVersion],
    settings: stored[KEYS.settings] || { dataSourceId: '', titleProperty: 'Name', urlProperty: 'URL' },
    archive,
    outbox: stored[KEYS.outbox] || [],
    projects: stored[KEYS.projects]
  });
}

export async function getMetaState() {
  await ensureArchiveMigrated();
  const stored = await chrome.storage.local.get(Object.values(KEYS));
  return migrateEvidenceState({
    schemaVersion: stored[KEYS.schemaVersion],
    settings: stored[KEYS.settings] || { dataSourceId: '', titleProperty: 'Name', urlProperty: 'URL' },
    archive: [],
    outbox: stored[KEYS.outbox] || [],
    projects: stored[KEYS.projects]
  });
}

export async function saveState(state) {
  const normalized = migrateEvidenceState(state);
  await archiveStore().replaceAll(normalized.archive);
  try {
    await chrome.storage.local.set({
      [KEYS.schemaVersion]: normalized.schemaVersion,
      [KEYS.settings]: normalized.settings,
      [KEYS.outbox]: normalized.outbox,
      [KEYS.projects]: normalized.projects
    });
  } catch (error) {
    const message = error?.message || String(error || '');
    if (/storage/i.test(message)) {
      throw new Error('Local storage is full. Export your archive, then remove old records to free space.');
    }
    throw error;
  }
}

export async function clearState() {
  await archiveStore().clear();
  await chrome.storage.local.remove([...Object.values(KEYS), 'archive', ARCHIVE_MIGRATION_KEY]);
}

export async function countArchive() {
  return archiveStore().count();
}

export async function latestArchiveRecord() {
  return archiveStore().latest();
}

// Serializes read-modify-write cycles so concurrent writers never interleave
// and lose updates (audit MODERATE-3). `mutator(state)` may mutate and return
// the state, or return a new state; the result is saved before the next queued
// mutation starts.
export function mutateState(mutator) {
  const run = async () => {
    const state = await getState();
    const next = await mutator(state);
    await saveState(next ?? state);
    return next ?? state;
  };
  const result = stateMutationQueue.then(run, run);
  stateMutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function mergeSettings(existing, incoming) {
  const merged = { ...existing };
  for (const key of Object.keys(incoming)) {
    if (key === 'fieldMappings' && incoming[key] && typeof incoming[key] === 'object') {
      merged.fieldMappings = Object.fromEntries(Object.entries(incoming.fieldMappings).map(([field, property]) => [field, compactText(property)]).filter(([, property]) => property));
    } else if (key === 'propertyTypes' && incoming[key] && typeof incoming[key] === 'object') {
      merged.propertyTypes = Object.fromEntries(Object.entries(incoming.propertyTypes).map(([field, type]) => [field, compactText(type)]).filter(([, type]) => type));
    } else if (key === 'userTemplates') {
      merged.userTemplates = normalizeUserTemplates(incoming[key]);
    } else if (key === 'templateFields') {
      merged.templateFields = normalizeTemplateFields(incoming[key]);
    } else merged[key] = compactText(incoming[key]);
  }
  if (merged.fieldMappings?.title) merged.titleProperty = merged.fieldMappings.title;
  if (merged.fieldMappings?.url) merged.urlProperty = merged.fieldMappings.url;
  return merged;
}

const SETUP_SETTINGS_KEYS = ['dataSourceId', 'templateId', 'templateFields', 'fieldMappings', 'propertyTypes'];

export function mergeSetupSettings(existing, workerSettings) {
  const setupSettings = Object.fromEntries(
    SETUP_SETTINGS_KEYS.filter((key) => Object.hasOwn(workerSettings, key)).map((key) => [key, workerSettings[key]])
  );
  return mergeSettings(existing, setupSettings);
}
