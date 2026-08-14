function detailOf(error) {
  return error instanceof Error ? error.message : String(error || 'Unknown error.');
}

export function regionCaptureFailureMessage(stage, error, { queued = false } = {}) {
  const detail = detailOf(error);
  if (stage === 'screenshot') return `Region screenshot was not captured. ${detail}`;
  if (stage === 'crop') return `Region screenshot could not be prepared. ${detail}`;
  if (stage === 'record') return `Region screenshot could not be saved. ${detail}`;
  if (stage === 'delivery') {
    const retry = queued ? ' It is in Outbox; retry it there.' : '';
    return `Region screenshot was captured, but Notion could not receive it. ${detail}${retry}`;
  }
  return `Region capture failed. ${detail}`;
}
