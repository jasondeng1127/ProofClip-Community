function messageOf(error) {
  return error instanceof Error ? error.message : String(error || 'Unknown capture error.');
}

export function captureExtractionError(error) {
  const message = messageOf(error);
  if (/cannot access contents of url|cannot access a chrome:\/\//i.test(message)) {
    return 'Chrome blocks ProofClip from reading this internal page. Open a normal website and try again.';
  }
  return 'ProofClip could not read this page. Try reloading the page, then capture again.';
}

export function canSaveTargetMapping(connected, dataSourceId) {
  return Boolean(connected && String(dataSourceId || '').trim());
}

export function captureFeedback(result) {
  if (result?.ok) {
    const truncation = result?.record?.truncated ? ' This previously saved record was truncated.' : '';
    return { text: `Evidence saved locally. Open Archive to review or send it to Notion.${truncation}`, isError: false };
  }
  if (result?.locallySaved) {
    return { text: `Evidence saved locally. Notion delivery failed: ${result.error || 'Unknown delivery error.'}`, isError: true };
  }
  return { text: `Capture did not start: ${result?.error || 'Unknown capture error.'}`, isError: true };
}

export function retryFeedback(result) {
  if (!result) return { text: 'Retrying Notion delivery…', isError: false };
  if (result.ok) return { text: 'Evidence sent to Notion.', isError: false };
  return { text: `Retry failed: ${result.error || 'Unknown delivery error.'}`, isError: true };
}
