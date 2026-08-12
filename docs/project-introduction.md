# ProofClip Community: a research workbench that stays in your flow

ProofClip Community is a self-hosted research workbench for keeping web evidence close to the reading that produced it. It helps a researcher preserve a useful passage or page, its source, and a **personal note** without interrupting reading. Capture remains local until you explicitly choose a delivery action.

## Literature and document research

While reading a paper, report, policy, or long-form document, capture the passage that needs a second look and add a personal note explaining why it matters. Use the selection shortcut when a quotation is enough, an image-area capture when a figure matters, or a full-page capture when the surrounding context matters. The reading flow stays keyboard-first:

| Shortcut | Capture mode | Useful when |
| --- | --- | --- |
| `Alt+1` | Selection | You want a short quotation with its page source. |
| `Alt+2` | Image area | You need a figure, table, or other visual evidence. |
| `Alt+3` | Full page | You need the document context around the evidence. |

![ProofClip capture panel](assets/capture-panel.png)

*The Capture panel presents the three keyboard-first modes while you remain on the document you are reading.*

## Other research use cases

Full-page research makes it practical to preserve the context for a changing web page, while image-area capture helps retain visual evidence that text alone cannot represent. A capture can be held in the **local Archive** for review, notes, and later organization before any delivery is requested.

![ProofClip delivery status](assets/connected-settings.png)

*A sanitized side-panel view shows a completed delivery state without exposing the destination or captured material.*

## Review your target fields before delivery

Configure a deployer-owned target once, then inspect the field mapping before you send a record. The settings view below intentionally uses neutral placeholders: this public guide does not expose target names, source values, or captured content.

![ProofClip field mapping settings](assets/field-mapping.png)

*The Field mapping control lets a self-hosted deployer review how a capture is prepared for its own configured target.*

The public asset files are `docs/assets/capture-panel.png`, `docs/assets/connected-settings.png`, and `docs/assets/field-mapping.png`.

## Local-first, explicit delivery

ProofClip keeps captures in the browser first. A delivery is an explicit user action; it is not implied merely by capturing or saving a record. When a deployer configures a Worker, D1, and Notion OAuth for their own environment, that deployer's Worker can deliver the requested record to the user-authorized workspace. See the [architecture](architecture.md) and [self-hosted Notion OAuth guide](self-hosted-notion-oauth.md) for the operational boundary.

## Self-hosting boundary

This repository contains the Community edition: a self-hosted deployment with deployer-owned Cloudflare Worker/D1, Notion OAuth, upgrades, backups, and operations. It has no central ProofClip-hosted dependency. Start with the [deployment guide](../deploy/README.md) and review the [security model](security.md) before operating it.

## Community edition vs Commercial edition

| Topic | Community edition | Commercial edition |
| --- | --- | --- |
| Status and license | A published earlier-version baseline, AGPL-3.0-only and self-hosted, suited to users who want to self-deploy and operate it themselves. | Separately licensed and currently evolving under commercial terms, for users who want a more complete feature set, a more polished experience, and continuing version updates. |
| Operating responsibility | The Community deployer owns Cloudflare Worker/D1, Notion OAuth, upgrades, backups, and operations. There is no central ProofClip-hosted dependency. | Consult the commercial offering for its current hosting and support. |
| Current scope | This repository documents only the Community baseline. | Consult the commercial offering for current features and pricing; this repository is not an entitlement statement. |

## Continue from here

- [Deploy ProofClip Community](../deploy/README.md)
- [Understand the architecture](architecture.md)
- [Review the security model](security.md)
- [Use the Community release checklist](acceptance/community-release-checklist.md)
