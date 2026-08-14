import { normalizeEvidenceCard } from './evidence-card.mjs';
import { normalizeCaptureRoute } from './direct-routing.mjs';

export const ARCHIVE_SCHEMA_VERSION = 3;

const DEFAULT_PROJECT = Object.freeze({ id: 'unfiled', name: 'Unfiled', createdAt: null });

function withCaptureRoute(settings) {
  const base = settings || {};
  return { ...base, captureRoute: normalizeCaptureRoute(base.captureRoute) };
}

function legacySettings(settings) {
  return withCaptureRoute(settings || { dataSourceId: '', titleProperty: 'Name', urlProperty: 'URL' });
}

function migrateOutbox(outbox) {
  return (Array.isArray(outbox) ? outbox : []).map((item) => ({
    ...item,
    retryState: item.retryState || 'RETRYABLE',
    record: normalizeEvidenceCard(item.record)
  }));
}

function normalizeSettings(settings) {
  return withCaptureRoute(settings || {});
}

export function migrateEvidenceState(state) {
  const archive = (Array.isArray(state?.archive) ? state.archive : []).map((record) => normalizeEvidenceCard(record));
  return {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    settings: Number(state?.schemaVersion) >= 2 ? normalizeSettings(state?.settings) : legacySettings(state?.settings),
    archive,
    outbox: migrateOutbox(state?.outbox),
    projects: Array.isArray(state?.projects) && state.projects.length ? state.projects : [DEFAULT_PROJECT]
  };
}
