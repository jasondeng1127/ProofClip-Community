// Delivery prerequisites for the Community edition. There is no entitlement
// concept: only the connection, Data Source and saved mapping are checked.
function hasText(value) {
  return Boolean(String(value || '').trim());
}

export function deliveryPrerequisites({ connection, settings }) {
  if (!connection?.connected) return { ok: false, error: 'Connect Notion before sending this evidence.' };
  if (!hasText(settings?.dataSourceId)) return { ok: false, error: 'Choose and save a Notion Data Source before sending.' };
  const mappings = settings?.fieldMappings || {};
  const types = settings?.propertyTypes || {};
  if (!hasText(mappings.title) || !hasText(mappings.url) || types.title !== 'title' || types.url !== 'url') return { ok: false, error: 'Save valid Title and URL mappings before sending.' };
  const validation = validateSavedTemplateMapping(settings?.templateFields, mappings, types);
  if (!validation.valid) return { ok: false, error: 'Save valid mappings for all required template fields before sending.' };
  return { ok: true };
}
import { validateSavedTemplateMapping } from './evidence-templates.mjs';
