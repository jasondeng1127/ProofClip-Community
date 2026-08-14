export function removeArchiveCard(state, recordId, { isDeliveryInFlight = () => false } = {}) {
  if (isDeliveryInFlight(recordId)) {
    return { ok: false, error: 'This evidence is being sent to Notion. Wait for the result before removing its local copy.' };
  }
  if (!state.archive.some((card) => card.id === recordId)) throw new Error('Evidence card was not found.');
  const outbox = state.outbox.filter((item) => item.record.id !== recordId);
  return {
    ok: true,
    state: { ...state, archive: state.archive.filter((card) => card.id !== recordId), outbox },
    removedOutboxCount: state.outbox.length - outbox.length
  };
}

export async function sendArchiveRequest(sendMessage, message, fallbackError) {
  try {
    return await sendMessage(message);
  } catch (error) {
    return { ok: false, error: error?.message || fallbackError };
  }
}
