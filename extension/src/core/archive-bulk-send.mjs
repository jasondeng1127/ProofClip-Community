export function pendingArchiveCards(cards) {
  return (Array.isArray(cards) ? cards : []).filter((card) => (card?.delivery?.status || 'PENDING') === 'PENDING');
}

export async function sendArchiveBatch(ids, sendOne) {
  const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean))];
  let sent = 0;
  let failed = 0;
  for (const id of uniqueIds) {
    let result;
    try { result = await sendOne(id); }
    catch { result = { ok: false }; }
    if (result?.ok) sent += 1;
    else failed += 1;
  }
  return { total: uniqueIds.length, sent, failed };
}
