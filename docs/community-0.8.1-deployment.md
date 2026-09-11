# Community 0.8.1 beginner deployment guide

This guide starts a fresh, deployer-owned ProofClip Community 0.8.1
deployment. It uses the existing deployment core and its pinned Wrangler
package. No live deployment is performed by reading this document; run the
wrapper only after the local candidate and the three input values are ready.

## v0.8.1 at a glance

The deployer provides only three values in a local environment file:
`CF_API_TOKEN`, `NOTION_CLIENT_ID`, and `NOTION_CLIENT_SECRET`. From the
candidate root, one wrapper command prepares the pinned local runtime and runs
the deployment core. The command prints a redacted callback URL and the exact
generated extension directory for the two deliberate manual handoffs.

You do not supply pre-derived infrastructure or browser identity values as command
arguments. The deployment core derives and validates those values, and it keeps the
local environment file out of command output.

## Before you start

Have Node.js 20 or newer, npm, PowerShell 7 on Windows or a POSIX shell, a
Cloudflare account with Workers and D1 permissions, a deployer-owned public
Notion OAuth integration, and a Chromium browser.

The deployment package contains the candidate extension, backend, migrations,
and the offline deployment toolchain. Keep the package directory together
while the deployment runs.

## One-command start

Run these steps from the candidate root. The first line creates the local file;
the second line is the only input instruction. The third line starts the
PowerShell wrapper.

```text
copy deploy/deploy.env.example deploy/deploy.env
fill CF_API_TOKEN, NOTION_CLIENT_ID, NOTION_CLIENT_SECRET
pwsh -File deploy/deploy.ps1
```

On POSIX systems, run the same flow with:

```sh
sh deploy/deploy.sh
```

The wrappers check for Node.js and npm, install the pinned local Wrangler
package only when its local executable is missing, and invoke the deployment
core from the candidate root. They do not print `deploy.env` or accept extra
identity, callback, or secret arguments.

## Complete the two safe manual actions

The core prints a redacted summary when it finishes. Two actions intentionally
remain with the deployer because they require an account or browser decision:

1. Save the printed callback URL in the deployer-owned Notion integration's
   callback settings. Copy the URL exactly as printed.
2. Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**,
   and select the exact path printed after **Generated extension directory**.

The generated extension directory is the only extension object to load. Do not
load the ZIP, the candidate root, the deployment tool directory, a test
directory, or a superseded extraction.

## After the two actions

Open the generated extension and complete the setup flow in the browser. The
deployer-owned backend should answer its privacy endpoint, and the extension
should allow the deployer to connect the matching Notion integration, choose a
Data Source, and save its field mapping.

For the bounded release gate, complete exactly one stable real capture.
Selection (`Alt+1`) is recommended because it is the narrowest and easiest
path to reproduce. Confirm that the intended Notion record is created, the
source URL and capture time are present, delivery reports `SENT`, and the
Outbox is empty after a successful retryable flow.

Image area (`Alt+2`) and Full page (`Alt+3`) are optional follow-up coverage;
they are not part of the one-capture release gate.

## Safety and recovery

The local environment file contains sensitive credentials. Keep it outside
commits and do not paste its contents into logs, issues, screenshots, or chat.
The wrappers never echo it. If the command stops, preserve the printed stable
failure code and rerun only after correcting the stated local prerequisite or
permission problem.

This guide does not replace the candidate's offline checks. A successful local
wrapper invocation is deployment evidence; it is not by itself proof of a
completed browser capture or an external Notion record.
