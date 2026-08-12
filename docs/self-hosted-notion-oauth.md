# Notion OAuth ownership and data flow

Each Community deployment uses a Notion OAuth integration created by that deployer. The extension opens the authorization URL returned by the deployer's Worker; the Notion authorization callback returns to the deployer's Worker; the access token is encrypted with the deployer's token-vault key before it is stored in that deployer's D1 database.

The extension never receives a Notion access token. Do not put a Notion client secret, token-vault key, or OAuth callback state in the extension source, its configuration file, browser storage export, issue report, or pull request.

The Worker accepts extension API calls only from the exact extension ID configured by the deployer. If a developer rebuilds or installs another copy of the extension, they must update `PROOFCLIP_EXTENSION_ID` and redeploy before using OAuth.

The deployer owns this Notion OAuth integration, Cloudflare Worker, D1 database, and HTTPS origin. The Worker has no dependency on a central hosted service. When offering a modified Worker for remote interaction, provide the corresponding source as required by AGPL-3.0 section 13.
