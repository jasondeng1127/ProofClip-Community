# Community project introduction design

## Goal

Help a first-time GitHub visitor understand ProofClip Community in under
30 seconds: what it captures, why local-first and explicit delivery matter,
who should deploy it, and where to start.

## Audience and success signal

The primary reader is an open-source visitor who may self-host the extension
and Worker. A successful page lets that reader identify the product's capture
modes, local Archive workflow, explicit Notion delivery, and deployer-owned
privacy boundary without reading source code.

## Content structure

Create `docs/project-introduction.md` with five short sections:

1. A plain-language summary and the evidence-to-Notion workflow.
2. Three concrete use cases, each expressed as situation, action, and
   outcome: retain selected passages and claims for long-form literary or
   academic research; save full supplier, product, policy, or market pages for
   later review; capture a visual page region as evidence and send it to a
   Notion workflow.
3. A concrete feature list grouped by the job it supports: body, selection,
   and region capture; local Archive; projects, tags, notes, and search;
   editable templates and field mapping; explicit Notion delivery; Outbox
   recovery; and keyboard shortcuts. Give particular prominence to the
   local-first Archive, the preserved source URL and capture time, explicit
   delivery rather than automatic sync, and the three keyboard-first capture
   actions (`Alt+1` selection, `Alt+2` region, and `Alt+3` full page).
4. The local-first data boundary and self-hosting responsibilities.
5. Intended users and explicit non-goals, including no central hosted archive
   or automatic delivery.
6. A next-step path to the deployment guide and Notion OAuth guide.

Update the root README with a prominent link to the new introduction before
the operational documentation links. Keep the README as a concise landing
page rather than duplicating the whole introduction.

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
