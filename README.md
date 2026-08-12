# ProofClip Community

Copyright (C) 2026 Jason. Licensed under [AGPL-3.0-only](LICENSE).

ProofClip Community is a self-hosted Chrome extension and a deployer-owned Cloudflare Worker/D1 service for explicitly capturing webpage evidence and sending it to a Notion workspace the user authorizes.

Each deployer owns and configures its Worker, D1 database, Notion OAuth integration, extension ID, and HTTPS API origin. There is no central ProofClip-hosted dependency: captures stay in the browser until the user explicitly sends them, and the deployer's Worker writes the requested record to Notion without retaining capture bodies or screenshots.

Read [the project introduction](docs/project-introduction.md), [the deployment guide](deploy/README.md), [architecture](docs/architecture.md), [security model](docs/security.md), [Notion OAuth guide](docs/self-hosted-notion-oauth.md), and [release checklist](docs/acceptance/community-release-checklist.md) before operating a deployment. [TRADEMARKS.md](TRADEMARKS.md) states the separate brand-use restriction.
