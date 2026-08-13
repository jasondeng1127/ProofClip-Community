# Getting started with ProofClip Community

This page is for the first successful self-hosted Community capture. It complements the technical [deployment guide](../deploy/README.md): a deployed Worker is not the end state. The end state is a deliberate capture that you can find locally or, when you choose, in your own Notion Data Source.

## Before you spend time deploying

Choose this edition only if you can operate a Cloudflare Worker, D1 database, Notion OAuth integration, and a locally loaded Chrome extension. Community is a source-first, self-hosted baseline; it is not a Chrome Web Store package and it does not provide a managed API or automatic updates.

If you want the future cloud-managed path instead, read [Commercial edition availability](edition-availability.md). It is not available yet.

## 1. Load and connect the extension

1. Download a source archive from the [GitHub Releases page](https://github.com/jasondeng1127/ProofClip-Community/releases) or clone this repository.
2. Follow the [deployment guide](../deploy/README.md) to create the deployer-owned Worker, D1 database, Notion OAuth integration, and Worker secrets.
3. In Chrome, open the extensions page, enable Developer mode, select **Load unpacked**, and choose this repository's `extension/src` directory.
4. Copy the resulting extension ID into `PROOFCLIP_EXTENSION_ID` in the Worker configuration. Deploy the Worker.
5. Set `COMMUNITY_API_ORIGIN` in `extension/src/community-config.mjs` to the deployed HTTPS Worker origin, then reload the extension.

The extension ID and HTTPS API origin are a paired security boundary. A different extension must not receive CORS permission from the Worker.

## 2. Authorize your own Notion workspace

Open ProofClip **Settings**, select **Connect**, and approve the Notion integration that belongs to this deployment. This is a user-authorized action: ProofClip Community does not store a Notion token in the extension.

Choose the Notion Data Source where you want deliberate deliveries to appear. Map the required **Title** and **URL** properties before saving the target mapping. Optional properties such as capture time, project, tags, note, evidence type, delivery status, and screenshot depend on the properties available in your Data Source.

## 3. Make the first capture

On a page you are reading, keep the side panel open and choose the evidence shape that matches the research question:

| Shortcut | Mode | First-use example |
| --- | --- | --- |
| `Alt+1` | Selection | Preserve a quoted claim with the page that stated it. |
| `Alt+2` | Image area | Preserve a chart, figure, table, or other visual evidence. |
| `Alt+3` | Full page | Preserve the surrounding context of a long document. |

The default route is **Save locally**. This creates a browser-local Archive record for review, annotation, projects, tags, and search. If you deliberately choose **Send to Notion** before the capture, that capture is delivered to the mapped Data Source. There is no background or automatic sync between the Archive and Notion.

## 4. Confirm the expected result

For a local capture, open **Archive** and check that the record has the intended source URL, capture time, and evidence. Add your personal note only after reviewing the saved evidence.

For an explicit Notion delivery, use **Open saved page in Notion** when it appears, or open the mapped Data Source. At minimum, expect a new record with the mapped title and source URL. The capture content and optional properties reflect the capture mode and the field mapping you chose. A failed delivery goes to the Outbox for review and retry rather than silently disappearing.

## Where data goes

| Location | Responsibility | What it holds in this workflow |
| --- | --- | --- |
| Browser | User's local extension | Local Archive records and evidence until the user explicitly selects delivery. |
| Deployer-owned Worker and D1 | Deployment operator | The Notion connection and delivery state needed to perform the requested delivery; capture bodies and screenshots are not retained. |
| User-authorized Notion workspace | Workspace owner | The record explicitly delivered to the mapped Data Source. |

Review [architecture](architecture.md), [security](security.md), and [self-hosted Notion OAuth](self-hosted-notion-oauth.md) before operating this for anyone other than yourself.
