const FIELDS = [
  { id: 'title', label: 'Title', required: true, valueSource: 'title', types: ['title'] },
  { id: 'url', label: 'URL', required: true, valueSource: 'url', types: ['url'] },
  { id: 'capturedAt', label: 'Captured time', required: false, valueSource: 'capturedAt', types: ['date'] },
  { id: 'project', label: 'Project', required: false, valueSource: 'project', types: ['select', 'rich_text'] },
  { id: 'tags', label: 'Tags', required: false, valueSource: 'tags', types: ['multi_select', 'rich_text'] },
  { id: 'note', label: 'Note', required: false, valueSource: 'note', types: ['rich_text'] },
  { id: 'evidenceType', label: 'Evidence type', required: false, valueSource: 'evidenceType', types: ['select', 'rich_text'] },
  { id: 'deliveryStatus', label: 'Delivery status', required: false, valueSource: 'deliveryStatus', types: ['status', 'select', 'rich_text'] },
  { id: 'screenshot', label: 'Screenshot', required: false, valueSource: 'screenshot', types: ['files'] }
];

const TEMPLATES = [
  { id: 'buyer-account', name: 'Buyer account', fields: FIELDS },
  { id: 'competitor', name: 'Competitor', fields: FIELDS },
  { id: 'regulation', name: 'Regulation', fields: FIELDS },
  { id: 'quote-evidence', name: 'Quote evidence', fields: FIELDS }
];

export const ALLOWED_FIELD_TYPES = ['title', 'url', 'date', 'select', 'rich_text', 'multi_select', 'status', 'files'];
export const USER_TEMPLATE_ID_PREFIX = 'user-';
export const CAPTURE_VALUE_SOURCES = [
  { id: 'title', label: 'Page title', types: ['title'] },
  { id: 'url', label: 'Source URL', types: ['url'] },
  { id: 'capturedAt', label: 'Captured time', types: ['date'] },
  { id: 'project', label: 'Project', types: ['select', 'rich_text'] },
  { id: 'tags', label: 'Tags', types: ['multi_select', 'rich_text'] },
  { id: 'note', label: 'Note', types: ['rich_text'] },
  { id: 'evidenceType', label: 'Evidence type', types: ['select', 'rich_text'] },
  { id: 'deliveryStatus', label: 'Delivery status', types: ['status', 'select', 'rich_text'] },
  { id: 'screenshot', label: 'Screenshot', types: ['files'] },
  { id: 'bodyText', label: 'Captured text', types: ['rich_text'] }
];

// Standard evidence field set for user templates (Bug E / UX 028 acceptance):
// Title and URL are required core fields that cannot be removed; the metadata
// fields are default-preset and removable by the user.
const STANDARD_FIELDS = [
  { id: 'title', label: 'Title', required: true, valueSource: 'title', types: ['title'], removable: false },
  { id: 'url', label: 'URL', required: true, valueSource: 'url', types: ['url'], removable: false },
  { id: 'capturedAt', label: 'Captured time', required: false, valueSource: 'capturedAt', types: ['date'] },
  { id: 'project', label: 'Project', required: false, valueSource: 'project', types: ['select'] },
  { id: 'tags', label: 'Tags', required: false, valueSource: 'tags', types: ['multi_select'] },
  { id: 'note', label: 'Note', required: false, valueSource: 'note', types: ['rich_text'] },
  { id: 'evidenceType', label: 'Evidence type', required: false, valueSource: 'evidenceType', types: ['select'] },
  { id: 'deliveryStatus', label: 'Delivery status', required: false, valueSource: 'deliveryStatus', types: ['status'] },
  { id: 'screenshot', label: 'Screenshot', required: false, valueSource: 'screenshot', types: ['files'] }
];

function valueSourceFor(field, coreField) {
  const requestedTypes = (Array.isArray(field?.types) ? field.types : []).filter((type) => ALLOWED_FIELD_TYPES.includes(type));
  const source = CAPTURE_VALUE_SOURCES.find((candidate) => candidate.id === field?.valueSource)
    || CAPTURE_VALUE_SOURCES.find((candidate) => candidate.id === coreField?.valueSource)
    || CAPTURE_VALUE_SOURCES.find((candidate) => candidate.id === field?.id)
    || CAPTURE_VALUE_SOURCES.find((candidate) => requestedTypes.length && requestedTypes.every((type) => candidate.types.includes(type)))
    || CAPTURE_VALUE_SOURCES.find((candidate) => candidate.id === 'bodyText');
  return source;
}

export function standardUserTemplateFields() {
  return structuredClone(STANDARD_FIELDS);
}

export function normalizeTemplateFields(fields) {
  return createUserTemplate({ name: 'Saved mapping', fields }, 'saved-mapping').fields;
}

export function starterTemplates() {
  return structuredClone(TEMPLATES);
}

export function createUserTemplate({ name, fields } = {}, id) {
  const templateId = id ?? `${USER_TEMPLATE_ID_PREFIX}${crypto.randomUUID()}`;
  const provided = Array.isArray(fields) ? fields : [];
  // A brand-new template with no fields starts from the full standard set;
  // otherwise keep the user's fields and force the two required core fields.
  const merged = id == null && !provided.length ? structuredClone(STANDARD_FIELDS) : [...provided];
  for (const core of STANDARD_FIELDS.filter((field) => field.removable === false)) {
    if (!merged.some((field) => field?.id === core.id)) merged.push(core);
  }
  const template = { id: templateId, name: String(name || '').trim().slice(0, 60), fields: [] };
  const seen = new Set();
  for (const field of merged) {
    const label = String(field?.label || '').trim().slice(0, 60);
    if (!label) continue;
    const fieldId = String(field?.id || '').trim() || `field-${template.fields.length + 1}`;
    if (seen.has(fieldId)) continue;
    seen.add(fieldId);
    const coreField = STANDARD_FIELDS.find((candidate) => candidate.id === fieldId);
    const valueSource = valueSourceFor(field, coreField);
    const types = [...new Set((Array.isArray(field?.types) ? field.types : []).filter((type) => valueSource.types.includes(type)))];
    if (!types.length) continue;
    template.fields.push({ id: fieldId, label, required: coreField?.removable === false ? true : Boolean(field?.required), valueSource: valueSource.id, types });
  }
  return template;
}

export function editableTemplateDraft(template) {
  if (String(template?.id || '').startsWith(USER_TEMPLATE_ID_PREFIX)) return structuredClone(template);
  return createUserTemplate({ name: `${String(template?.name || 'Template').trim()} copy`, fields: template?.fields || [] });
}

export function validateUserTemplate(template) {
  const errors = [];
  if (!template?.id) errors.push('Template id is required.');
  if (!String(template?.name || '').trim()) errors.push('Template name is required.');
  const fields = Array.isArray(template?.fields) ? template.fields : [];
  if (!fields.length) errors.push('A template needs at least one field.');
  for (const field of fields) {
    if (!String(field?.label || '').trim()) errors.push('Every field needs a label.');
    const types = Array.isArray(field?.types) ? field.types : [];
    const source = CAPTURE_VALUE_SOURCES.find((candidate) => candidate.id === field?.valueSource);
    if (!source || !types.length || !types.every((type) => source.types.includes(type))) {
      errors.push(`Field "${field?.label || 'unknown'}" has an invalid type constraint.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateSavedTemplateMapping(templateFields, mapping = {}, propertyTypes = {}) {
  const errors = [];
  for (const field of Array.isArray(templateFields) ? templateFields : []) {
    const propertyName = String(mapping[field?.id] || '').trim();
    if (!propertyName) {
      if (field?.required) errors.push(`${field?.label || 'Required field'} mapping is required.`);
      continue;
    }
    if (!Array.isArray(field?.types) || !field.types.includes(String(propertyTypes[field.id] || '').trim())) {
      errors.push(`${field?.label || 'Field'} mapping has an incompatible property type.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function normalizeUserTemplates(value) {
  return (Array.isArray(value) ? value : [])
    .map((template) => createUserTemplate(template, template?.id))
    .filter((template) => validateUserTemplate(template).valid);
}

export function allTemplates(userTemplates) {
  return [...starterTemplates(), ...normalizeUserTemplates(userTemplates)];
}

export function removeUserTemplate(userTemplates, id) {
  return normalizeUserTemplates(userTemplates).filter((template) => template.id !== id);
}

export function validateTemplateMapping(template, dataSourceProperties, mapping = {}) {
  const properties = new Map((Array.isArray(dataSourceProperties) ? dataSourceProperties : []).map((property) => [property.name, property]));
  const errors = [];
  const unsupportedFields = [];
  for (const field of template?.fields || []) {
    const propertyName = String(mapping[field.id] || '').trim();
    if (!propertyName) {
      if (field.required) errors.push(`${field.label} mapping is required.`);
      else unsupportedFields.push(field.id);
      continue;
    }
    const property = properties.get(propertyName);
    if (!property) {
      errors.push(`Mapped property "${propertyName}" for ${field.label} does not exist.`);
      continue;
    }
    if (!field.types.includes(property.type)) errors.push(`${field.label} requires ${field.types.join(' or ')} but "${propertyName}" is ${property.type}.`);
  }
  return { valid: errors.length === 0, errors, unsupportedFields };
}
