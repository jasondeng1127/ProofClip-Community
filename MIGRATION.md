# Community publication record

This public Community repository contains the self-hosted extension and Worker source only. It excludes account configuration, identifiers, OAuth credentials, token-vault keys, runtime evidence, browser data, release archives, and customer material.

Before publishing a changed version, run the source scanner, regenerate `COPYING_MANIFEST.json` from the tracked public tree, run both offline test suites, and complete the fresh-account rehearsal in [the release checklist](docs/acceptance/community-release-checklist.md). The deployment owner must use new deployer-owned Cloudflare, D1, and Notion OAuth configuration.
