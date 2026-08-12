const TIMEOUT_MESSAGE = 'This is taking longer than expected. Check the result and retry if needed.';

function errorText(error) {
  return error instanceof Error ? error.message : String(error || 'Unknown error.');
}

export function pendingFeedback(label) {
  return { text: `${label}…`, isError: false };
}

export function successFeedback(text) {
  return { text, isError: false };
}

export function failureFeedback(error) {
  return { text: errorText(error), isError: true };
}

export async function runWithTimeout(work, timeoutMs = 10_000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve()
        .then(work)
        .then((value) => ({ ok: true, value }))
        .catch((error) => ({ ok: false, timedOut: false, error: errorText(error) })),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, timedOut: true, error: TIMEOUT_MESSAGE }), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
