export function normalizeLunaLabel(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Luna label must be a string');
  }

  return value.trim().toLowerCase().replace(/\s+/g, '-');
}
