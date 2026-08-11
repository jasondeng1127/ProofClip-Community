# ProofClip Community

> Private bootstrap repository. It is not published or ready for public use yet.

ProofClip Community will be a self-hosted Chrome extension and Cloudflare Worker for explicitly capturing webpage evidence and sending it to a Notion workspace authorized by the user.

The self-hosted design has no dependency on an Official ProofClip Worker: a deployer owns the Worker, D1 database, Notion OAuth integration, extension configuration, and associated data flow. This repository is being prepared from the stable v0.7 product baseline; deployment documentation and a public-source security gate are part of the bootstrap work.

Official ProofClip is a separate product line. Its domains, Cloudflare accounts, OAuth credentials, operations, release assets, and future product work are not part of this repository.

See [MIGRATION.md](MIGRATION.md) for provenance and [docs/architecture.md](docs/architecture.md) for the intended self-hosted boundary.
