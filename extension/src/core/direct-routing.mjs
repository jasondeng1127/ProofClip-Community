import { ProofClipApiError } from './proofclip-api.mjs';

export function normalizeCaptureRoute(value) {
  if (value === 'archive' || value === 'direct') return value;
  return 'archive';
}

export function outboxFailurePolicy(error) {
  if (error instanceof ProofClipApiError && error.kind === 'response') {
    const status = error.status;
    // Only rate-limit (429) and timeout (408) can succeed on an ordinary retry
    // without the user changing state. Other 4xx errors (invalid input,
    // authorization, missing connection, ...) need verification first.
    if (status === 429 || status === 408) {
      return { state: 'RETRYABLE', canOrdinaryRetry: true };
    }
  }
  return { state: 'NEEDS_VERIFICATION', canOrdinaryRetry: false };
}
