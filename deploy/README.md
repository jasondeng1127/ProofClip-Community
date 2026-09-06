# ProofClip Community 0.8.1 deployment

This is the short, one-command path for a deployer-owned Community 0.8.1
deployment. The wrappers run from the candidate root, install the pinned local
Wrangler package only when it is missing, and pass the three required values to
the existing deployment core without printing the environment file.

## Prerequisites

- Node.js 20 or newer and npm.
- PowerShell 7 on Windows, or a POSIX-compatible shell.
- A Cloudflare account with the required Workers and D1 permissions.
- A deployer-owned public Notion OAuth integration.
- A Chromium browser for the final unpacked-extension action.

## Start the deployment

From the candidate root, copy the environment example, fill its three values,
and run the platform wrapper:

```text
copy deploy/deploy.env.example deploy/deploy.env
fill CF_API_TOKEN, NOTION_CLIENT_ID, NOTION_CLIENT_SECRET
pwsh -File deploy/deploy.ps1
```

On POSIX systems, use the equivalent wrapper:

```sh
sh deploy/deploy.sh
```

The deployment prints a redacted result with the callback URL and the generated
extension directory. The wrapper does not take deployment identity, callback,
or secret arguments; those values are derived or read by the core from the
three-value environment contract.

## Two actions that remain manual

1. In the deployer-owned Notion integration, save the exact printed **Notion
   callback URL** as the integration callback URL.
2. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose
   **Load unpacked**, and select the exact directory printed as **Generated
   extension directory**.

Do not load the ZIP, the repository root, or an older candidate directory. The
printed generated directory is the object to load.

For the full beginner flow, failure handling, and first-capture checklist,
see [the Community 0.8.1 deployment guide](../docs/community-0.8.1-deployment.md).
