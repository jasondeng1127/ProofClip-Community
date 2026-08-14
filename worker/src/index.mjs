import { createD1Repository } from './d1-repository.mjs';
import { createWorker } from './worker.mjs';

export default {
  async fetch(request, env) {
    return createWorker({ repository: createD1Repository(env.DB), env }).fetch(request);
  }
};
