# ProofClip Community

Copyright (C) 2026 Jason. Licensed under [AGPL-3.0-only](LICENSE).

ProofClip Community is a self-hosted research workbench for keeping web evidence close to the reading that produced it. It helps literature, academic, and document researchers preserve a useful passage, figure, or full page with its source, then return to it without breaking concentration.

## Keep research moving

Capture while reading, then open the saved Archive record to add a personal note about why the evidence matters. Use the keyboard-first capture mode that matches the material in front of you:

| Shortcut | Capture mode | Useful when |
| --- | --- | --- |
| `Alt+1` | Selection | A quotation or claim needs its page source. |
| `Alt+2` | Image area | A figure, table, or other visual evidence matters. |
| `Alt+3` | Full page | The surrounding context matters as much as the passage. |

![ProofClip Community capture panel with Selection, Image area, and Full page shortcuts](docs/assets/capture-panel.png)

## Save locally, deliver deliberately

Captures default to the local Archive. Keep them there for review, personal notes, projects, tags, and search; editable templates and field mapping help make repeated research workflows consistent. A user may explicitly select direct delivery during capture, but there is no background or automatic sync. Failed explicit deliveries remain available in the Outbox for review and retry.

![ProofClip Community Capture panel showing an explicit delivery completed](docs/assets/connected-settings.png)

![ProofClip Community generic field-mapping controls](docs/assets/field-mapping.png)

## Community edition vs Commercial edition

| | Community edition | Commercial edition |
| --- | --- | --- |
| Best fit | Users who want to self-deploy and operate it themselves. | Users who want a more complete feature set, a more polished experience, and continuing version updates. |
| Responsibility | The deployer runs the Worker, D1 database, Notion OAuth, upgrades, backups, and operations. | Commercial terms are separate from this self-hosted Community baseline. |

## Deploy your own Community instance

ProofClip Community uses a deployer-owned Cloudflare Worker/D1 service and Notion OAuth integration. Each deployer configures its own extension ID and HTTPS API origin. There is no central ProofClip-hosted dependency: captures stay in the browser until the user explicitly sends them, and the deployer's Worker writes the requested record to Notion without retaining capture bodies or screenshots.

Read [the detailed project introduction](docs/project-introduction.md), [the deployment guide](deploy/README.md), [architecture](docs/architecture.md), [security model](docs/security.md), [Notion OAuth guide](docs/self-hosted-notion-oauth.md), and [release checklist](docs/acceptance/community-release-checklist.md) before operating a deployment. [TRADEMARKS.md](TRADEMARKS.md) states the separate brand-use restriction.
