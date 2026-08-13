# ProofClip Community: a research workbench that stays in your flow

ProofClip Community is a self-hosted research workbench for keeping web evidence close to the reading that produced it. It helps a researcher preserve a useful passage or page and its source without interrupting reading. A capture defaults to the local Archive, with no background or automatic sync.

## Literature and document research

Capture while reading a paper, report, policy, or long-form document when a passage needs a second look. Then open the saved Archive record to add a personal note explaining why it matters. Use the selection shortcut when a quotation is enough, an image-area capture when a figure matters, or a full-page capture when the surrounding context matters. The reading flow stays keyboard-first:

| Shortcut | Capture mode | Useful when |
| --- | --- | --- |
| `Alt+1` | Selection | You want a short quotation with its page source. |
| `Alt+2` | Image area | You need a figure, table, or other visual evidence. |
| `Alt+3` | Full page | You need the document context around the evidence. |

![ProofClip capture panel with Selection, Image area, and Full page shortcuts](assets/capture-panel.png)

*The Capture panel presents the three keyboard-first modes while you remain on the document you are reading.*

## Other research use cases

Full-page research makes it practical to preserve the context for a changing web page, while image-area capture helps retain visual evidence that text alone cannot represent. Each local record can preserve its source URL and capture time alongside the evidence and a personal note. A capture can be held in the **local Archive** for review, notes, and later organization before any delivery is requested.

![ProofClip capture panel showing explicit delivery success](assets/connected-settings.png)

*A sanitized Capture-panel view shows a completed explicit delivery action without exposing the destination or captured material.*

## Keep research organized locally

Organize local records with projects and tags, use search to find them later, and keep editable templates for repeatable note structure. The Outbox recovery flow keeps a failed explicit delivery available to review and retry. The Community edition does not deliver automatically. During capture, a user may explicitly select direct delivery; this route does not require the capture to enter the local Archive first.

![ProofClip field mapping controls](assets/field-mapping.png)

*A sanitized crop of the real Community field-mapping controls shows only generic property choices; it excludes the data-source name, target values, and account details.*

The public asset files are `docs/assets/capture-panel.png`, `docs/assets/connected-settings.png`, and `docs/assets/field-mapping.png`.

## Local-first, explicit delivery

ProofClip keeps captures in the browser first. A delivery is an explicit user action: the default path saves locally, while a user may explicitly select direct delivery during capture. It is never a background or automatic sync, and direct delivery does not imply that the capture was first added to the local Archive. When a deployer configures a Worker, D1, and Notion OAuth for their own environment, that deployer's Worker can deliver the requested record to the user-authorized workspace. See the [architecture](architecture.md) and [self-hosted Notion OAuth guide](self-hosted-notion-oauth.md) for the operational boundary.

## Self-hosting boundary

This repository contains the Community edition: a self-hosted deployment with deployer-owned Cloudflare Worker/D1, Notion OAuth, upgrades, backups, and operations. It has no central ProofClip-hosted dependency. Start with [Getting started](getting-started.md), continue with the [deployment guide](../deploy/README.md), and review the [security model](security.md) before operating it.

## Community edition vs Commercial edition

| Topic | Community edition | Commercial edition |
| --- | --- | --- |
| Status and license | A published earlier-version baseline, AGPL-3.0-only and self-hosted, suited to users who want to self-deploy and operate it themselves. | Not available yet. When released, it is intended for users who want a cloud-managed service, a more complete feature set, a more polished experience, and continuing version updates. |
| Operating responsibility | The Community deployer owns Cloudflare Worker/D1, Notion OAuth, upgrades, backups, and operations. There is no central ProofClip-hosted dependency. | Commercial terms are separate from the Community deployer's self-hosted operation. |
| Current scope | This repository documents only the Community baseline. | The commercial offering is separate from this self-deployable Community baseline. |

See [Commercial edition availability](edition-availability.md) for the current release-status statement and the intended post-release delivery path. It is not a promise of current availability.

## Continue from here

- [Deploy ProofClip Community](../deploy/README.md)
- [Get a first successful capture](getting-started.md)
- [Read Commercial edition availability](edition-availability.md)
- [Understand the architecture](architecture.md)
- [Review the security model](security.md)
- [Use the Community release checklist](acceptance/community-release-checklist.md)
