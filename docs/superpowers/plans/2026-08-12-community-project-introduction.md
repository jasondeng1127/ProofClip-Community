# Community Project Introduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a visitor-facing ProofClip Community introduction that leads with a frictionless literature/document research workflow, uses real extension screenshots, and has a prominent README entry point.

**Architecture:** One Markdown page explains the product through use cases, keyboard-first capture modes, local Archive, and explicit Notion delivery. Three sanitized supplied screenshots live under `docs/assets/` and are embedded next to the relevant explanation. The root README stays concise and links to the introduction.

**Tech Stack:** Markdown, PNG assets, Node.js built-in test runner, PowerShell public-source scanner.

## Global Constraints

- Public product copy is English-only.
- Lead with literature, academic, and document research: save a source passage
  and personal note while reading, then retrieve it later without losing the
  original evidence context.
- Include broad page research and visual evidence as additional use cases.
- State only current Community behavior, except for this Jason-approved
  positioning: Commercial is for users who want a more complete feature set,
  a more polished experience, and continuing version updates; Community suits
  users who self-deploy and operate it themselves. Do not state commercial
  pricing, named features, SLAs, support guarantees, or other unverified
  commercial claims.
- Screenshots must be real supplied Community side-panel crops, not generated
  illustrations. They must not expose Worker origins, extension IDs, OAuth
  IDs, secrets, tokens, resource IDs, browser/Notion host content, source URL,
  captured content, or account/workspace identity. A field-mapping crop may
  show only generic property labels and no configured target.
- Include `Alt+1` selection, `Alt+2` image area, and `Alt+3` full page.
- Use only the three provided screenshots as documentation assets.

---

### Task 1: Publish the project introduction and visual assets

**Files:**
- Create: `docs/project-introduction.md`
- Create: `docs/assets/capture-panel.png`
- Create: `docs/assets/connected-settings.png`
- Create: `docs/assets/field-mapping.png`
- Modify: `README.md`
- Modify: `extension/src/tests/release-copy.test.mjs`
- Modify: `COPYING_MANIFEST.json`

**Interfaces:**
- Consumes: the existing Community feature behavior in `extension/src/README.md` and the three supplied screenshots.
- Produces: one linked, rendered visitor guide with three image paths that are listed in `COPYING_MANIFEST.json`.

- [ ] **Step 1: Write the failing documentation contract test**

Add a test that reads `docs/project-introduction.md` and asserts a literature
or document research heading appears before the other use cases, the guide
states `personal note`, all three shortcuts, all three asset paths, `local
Archive`, and `explicitly` occur. Read the root README and assert it links to
`docs/project-introduction.md`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `& 'D:\node.js\node.exe' --test .\tests\release-copy.test.mjs`

Expected: FAIL because the project introduction and its README link do not
exist yet.

- [ ] **Step 3: Add the sanitized supplied images and write the guide**

Crop the supplied real Community side-panel screenshots into the capture,
explicit-delivery, and generic field-mapping PNGs at the three named
`docs/assets/` paths; do not generate illustration assets. Write the approved
copy structure: a plain-language research-workbench introduction; an opening
literary/document research workflow that captures a passage and its source
while reading, then lets the reader open the saved Archive record to add a
personal note; full-page research and visual evidence use
cases; a capture-mode table with the three shortcuts; the local Archive and
explicit delivery model; a short self-hosting boundary; and deployment links.
Embed each image with a caption that explains the demonstrated interaction.
Link the guide from the root README before the deployment link.

- [ ] **Step 4: Regenerate the public manifest**

Generate hashes from every tracked public file except `COPYING_MANIFEST.json`,
canonicalizing CRLF text to LF before SHA-256 hashing. Confirm the three PNG
assets and the introduction appear in the resulting `files` array.

- [ ] **Step 5: Run focused verification**

Run:

```powershell
& 'D:\node.js\node.exe' --test .\tests\release-copy.test.mjs
& 'D:\node.js\node.exe' --test .\tests\public-source-guard.test.mjs
pwsh -NoProfile -File ..\..\scripts\verify-public-source.ps1 -IncludeUntracked
```

Expected: all tests pass and the scanner reports no forbidden public source.

- [ ] **Step 6: Commit**

```powershell
git add -- README.md docs/project-introduction.md docs/assets/capture-panel.png docs/assets/connected-settings.png docs/assets/field-mapping.png extension/src/tests/release-copy.test.mjs COPYING_MANIFEST.json
git commit -m "docs: add Community project introduction"
```
