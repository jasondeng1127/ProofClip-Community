import { proofclipApi as realProofclipApi, ProofClipApiError } from '../core/proofclip-api.mjs';

export { ProofClipApiError };

export function proofclipApi(path, options = {}) {
  return realProofclipApi(path, { ...options, apiOrigin: 'https://worker.test.invalid' });
}
