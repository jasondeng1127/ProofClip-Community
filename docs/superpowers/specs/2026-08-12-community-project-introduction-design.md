# Community project introduction design

## Goal

Help a first-time GitHub visitor understand ProofClip Community in under
30 seconds: it is a local-first evidence workspace for literature and
document research, where a reader can save passages, sources, and their own
thinking without interrupting the research flow; it can also capture broader
web evidence, deliver deliberately to Notion, and be self-hosted.

## Audience and success signal

The primary reader is a researcher, student, analyst, or other knowledge
worker who may self-host the extension and Worker. A successful page lets the
reader identify the product's capture modes, low-friction research-note
workflow, local Archive, explicit Notion delivery, and deployer-owned privacy
boundary without reading source code.

## Content structure

Create `docs/project-introduction.md` with five short sections:

1. A plain-language summary led by literature and document research: capture
   the original passage with its source while reading, add the researcher's own
   note without breaking concentration, and return to a searchable evidence
   archive or explicitly deliver the finished record to Notion.
2. Three concrete use cases, each expressed as situation, action, and
   outcome. Place long-form literary, academic, and document research first:
   retain selected passages and claims with a source and personal note; then
   save full supplier, product, policy, or market pages for later review; then
   capture a visual page region as evidence and send it to a Notion workflow.
3. A concrete feature list grouped by the job it supports: body, selection,
   and region capture; local Archive; projects, tags, notes, and search;
   editable templates and field mapping; explicit Notion delivery; Outbox
   recovery; and keyboard shortcuts. Give particular prominence to the
   local-first Archive, preserved source URL and capture time, personal notes,
   explicit delivery rather than automatic sync, and the three keyboard-first
   capture actions (`Alt+1` selection, `Alt+2` region, and `Alt+3` full page).
4. The local-first data boundary and self-hosting responsibilities.
5. Intended users and explicit non-goals, including no central hosted archive
   or automatic delivery.
6. A next-step path to the deployment guide and Notion OAuth guide.

Update the root README with a prominent link to the new introduction before
the operational documentation links. Keep the README as a concise landing
page rather than duplicating the whole introduction.

## Visual proof

Place three supplied extension screenshots beside the relevant sections:
Capture, connected delivery setup, and field mapping. Use captions that tell a
visitor what the interaction demonstrates. The images must contain no Worker
origin, extension ID, OAuth secret, token, or resource identifier; no runtime
configuration screenshots are permitted.

## Constraints

- English-only public product copy.
- Describe only current Community behavior; never restore commercial,
  quota, official-hosting, or deployment-specific claims.
- Do not add live Worker origins, extension IDs, OAuth IDs, tokens,
  screenshots, or captured content.
- Keep deployment procedures in `deploy/README.md`.

## Verification

Run the extension public-copy and public-source guard tests, the public-source
scanner, and inspect the rendered Markdown links on GitHub after pushing.
