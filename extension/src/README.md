# ProofClip Community extension

ProofClip keeps captured evidence in this browser until you explicitly choose
to send it to your connected Notion Data Source. Local Archive records,
screenshots, projects, notes, templates, and Outbox recovery remain available
without an account requirement or usage cap.

## Run tests

From this `src` directory:

```powershell
& 'D:\node.js\node.exe' --test '.\tests\*.test.mjs'
```

## Load locally

1. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, then select this `src` folder.
2. Capture a page body, selection, or region. Choose **Save locally** to add an immutable evidence record to Archive.
3. Connect Notion, choose a Data Source, save a valid title and URL mapping, then explicitly choose **Send to Notion** for direct capture or an Archive record.
4. Failed deliveries remain in Outbox for retry. Removing a local copy never deletes a Notion page already sent.

## Privacy boundary

Export JSON creates a read-only archive copy with locally saved screenshots.
Clear local archive and settings removes local Archive records, mapping, and
Outbox. Disconnecting Notion separately removes the saved server-side
connection. No Notion token is stored in the extension.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt+3` | Capture page body |
| `Alt+2` | Capture region |
| `Alt+1` | Capture selection |
