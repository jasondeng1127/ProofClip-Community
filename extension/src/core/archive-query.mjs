function textOf(card) {
  return [card.title, card.canonicalUrl, card.bodyText, card.note, ...(Array.isArray(card.tags) ? card.tags : [])]
    .join('\n')
    .toLowerCase();
}

export function queryArchive(cards, filters = {}) {
  const text = String(filters.text || '').trim().toLowerCase();
  const projectId = String(filters.projectId || '').trim();
  const tag = String(filters.tag || '').trim().toLowerCase();
  const captureMode = String(filters.captureMode || '').trim();
  const deliveryStatus = String(filters.deliveryStatus || '').trim();
  return (Array.isArray(cards) ? cards : [])
    .filter((card) => !text || textOf(card).includes(text))
    .filter((card) => !projectId || card.projectId === projectId)
    .filter((card) => !tag || (Array.isArray(card.tags) && card.tags.includes(tag)))
    .filter((card) => !captureMode || card.mode === captureMode)
    .filter((card) => !deliveryStatus || card.delivery?.status === deliveryStatus)
    .toSorted((left, right) => String(right.capturedAt || '').localeCompare(String(left.capturedAt || '')));
}
