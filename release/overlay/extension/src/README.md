# ProofClip Community 0.8

ProofClip captures a page body, a text selection, or a visible region as local
evidence, and explicitly sends it to a Notion workspace you authorize. This is
the Community edition: a self-hosted Chrome extension paired with a
deployer-owned Cloudflare Worker and D1 database. It has no dependency on any
managed ProofClip service.

## Run tests

From this `src` directory:

```powershell
node --test '.\tests\*.test.mjs'
```

## Deploy and load

1. Follow `deploy/README.md` at the repository root to create the
   deployer-owned Worker, D1 database, Notion integration, and Worker secrets.
2. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose
   **Load unpacked**, and select this `src` folder.
3. Copy the generated 32-character extension ID into `PROOFCLIP_EXTENSION_ID`
   in the Worker configuration and deploy the Worker.
4. Edit `community-config.mjs` so `COMMUNITY_API_ORIGIN` equals the deployed
   HTTPS Worker origin (no trailing slash), then reload the extension.

The extension ID and HTTPS API origin are a paired security boundary: a
different extension must not receive CORS permission from the Worker.

## Capture

- **Selection** (`Alt+1`): preserves a quoted claim with its page source.
- **Image area** (`Alt+2`): preserves a figure, table, or other visual
  evidence as a watermarked screenshot.
- **Full page** (`Alt+3`): preserves the cleaned page body, structured
  content blocks, links, and obtainable images. Long pages are kept in full —
  there is no capture truncation. Delivery fails visibly if a service limit is
  reached instead of silently shortening the record.

The default route is **Save locally** (browser Archive). Choose **Send to Notion** only when you want the capture delivered directly to your mapped Data
Source; a successful direct delivery is not added to the Archive. An empty
selection is refused. Selecting text and right-clicking offers the same
capture through the context menu.

## Archive

Every capture is saved in your browser (IndexedDB) and can be searched,
filtered by project/tag/mode/delivery status, annotated with projects, tags
and notes, sent to Notion individually or as a filtered batch, and exported as
a read-only JSON archive that includes screenshots. Failed deliveries stay in
the Outbox for retry or verified resend. **Remove local copy** deletes only
the browser record and its paired Outbox item; it never deletes a Notion page
already sent.

## Privacy boundary

- Capture is explicit: nothing is captured until you click a capture button.
- Local records stay in your browser until you explicitly send them.
- The extension never stores a Notion token. OAuth material lives only in your
  deployer-owned Worker and D1 database, encrypted with your token-vault key.
- The Worker stores no capture bodies, selections, screenshots, or page URLs.
- `Export JSON` is a read-only archive copy; there is no import or restore
  function. Uninstalling the extension clears its local storage.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt+3` | Capture page body |
| `Alt+2` | Capture region |
| `Alt+1` | Capture selection |

On Linux, `Alt+Number` may be reserved for switching tabs; open
`chrome://extensions/shortcuts` and rebind the three ProofClip commands
(recommended fallback: `Ctrl+Shift+3/2/1`, keeping the same mode order).