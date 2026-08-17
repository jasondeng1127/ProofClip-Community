# ProofClip Community 0.8.0

ProofClip Community 0.8.0 is a self-hosted Chrome extension for preserving
web evidence locally and sending selected evidence to a Notion Data Source
that you authorize.

## Capture

- Capture a text selection with its source page.
- Capture a visible image area for figures, tables, and other visual evidence.
- Capture a cleaned page body or full page with structured content, links, and
  obtainable images.
- Preserve long pages without silently truncating the captured evidence.
- Use the built-in keyboard shortcuts or the context menu for supported
  capture actions.

## Local workflow

- Keep captures in a browser-local Archive until you explicitly send them.
- Search and filter evidence by text, project, tag, mode, and delivery status.
- Organize records with projects, tags, and notes.
- Export a read-only JSON archive for local backup or inspection.
- Keep failed deliveries in the Outbox for retry or verified resend.
- Remove only the local record when you choose **Remove local copy**; an
  already delivered Notion page is not deleted.

## Notion delivery

- Connect through Notion OAuth using an integration you own.
- Select a Notion Data Source and use **Set up ProofClip** for the standard
  fields.
- Review advanced Field Mapping when your Data Source needs custom property
  names or types.
- Send evidence explicitly and see the resulting Notion page link.
- Record successful delivery as `SENT` and retain failed deliveries for
  recovery.
- Protect against accidental duplicate delivery through the local delivery
  state and Outbox workflow.

## Self-hosting and privacy

- Deploy the backend to your own Cloudflare Worker and D1 database.
- Use your own public Notion OAuth integration and Worker secrets.
- Load the unpacked extension from `extension/src`.
- Follow the [self-hosted deployment guide](../deploy/README.md) for the
  complete setup, configuration, health check, and troubleshooting workflow.
- Captures stay in the browser until you explicitly send them.
- The extension does not store a Notion OAuth token, and the deployer-owned
  Worker does not persist capture bodies, selections, screenshots, or page
  URLs.

## Reliability

Community 0.8 improves the self-hosted delivery workflow with explicit
delivery state, local preservation, retryable Outbox recovery, Data Source
setup, full-page handling, and clearer failure feedback. The release remains
self-hostable rather than one-click or zero-config; deployment requires the
documented Worker, D1, Notion, and extension setup steps.
