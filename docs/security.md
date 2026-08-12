# Security model

ProofClip Community is self-hosted. The deployer is responsible for their Cloudflare account, D1 database, Notion integration, extension installation, backups, access control, and upgrade timing.

The project should never store captured page bodies in a central service. Capture delivery is explicit: local archive storage is separate from an explicit Notion send action. OAuth credentials remain Worker-only, and the Worker must limit extension CORS to one configured extension ID.

Before release, verify the repository with `pwsh -NoProfile -File scripts/verify-public-source.ps1 -IncludeUntracked`. This local source gate rejects private deployment identities, secrets, and executable retired commercial artifacts; it is not a substitute for a fresh deployment rehearsal or independent security review.
