# Community Publication Design

## Objective

Publish the frozen v0.7 capture product as ProofClip Community: a deployer-owned Chrome extension and Cloudflare Worker/D1 integration for explicit evidence capture and optional Notion delivery.

## Boundary

The Community edition is self-hosted and feature-complete for capture and Notion delivery. It has no official Worker dependency, fixed extension identity, payment, subscription, license keys, device entitlement, bridge keys, refund webhook, usage telemetry, cloud archive, or automatic browsing.

Every deployment uses its own Worker origin, D1 database, Notion OAuth integration, token-vault key, and generated Chrome extension ID. The extension never receives a Notion token. The Worker stores only encrypted OAuth connection material and minimum OAuth state required for that deployer.

## Licensing and naming

Source is licensed under AGPL-3.0-only. A modified Community Worker made available for remote network interaction must offer its corresponding source to those users. `TRADEMARKS.md` remains separate: the license does not grant ProofClip branding rights.

## Release gates

1. The extension and Worker contain no commercial entitlement or official deployment identity.
2. The public-source scanner succeeds for tracked and untracked files.
3. Extension and Worker offline suites are green from the self-hosted checkout.
4. A fresh deployer-owned Cloudflare/D1/Notion OAuth rehearsal succeeds with a separately loaded extension ID; this is recorded without credentials or customer data.
5. Only then may the primary agent create the GitHub repository, push the branch, and publish it after Jason's explicit authorization already provided in this task.
