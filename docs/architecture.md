# Community architecture

```text
Chrome extension
    | explicit capture / explicit send
    v
Deployer-owned Cloudflare Worker + D1
    | OAuth token vault / Notion API proxy
    v
Deployer-authorized Notion workspace
```

The extension must be configured with a deployer-owned HTTPS Worker origin. The Worker accepts extension API calls only from the exact `chrome-extension://<extension-id>` configured by the deployer, and stores OAuth material only in that deployer's D1 database using its configured vault key.

The Community repository must contain templates and documentation, never live account identifiers or secrets. A deployer creates their own Notion integration and registers their own Worker callback URL; the Notion client secret remains a Worker secret and is never placed in the extension.

The project intentionally does not create a cloud archive, automatic browsing agent, payment channel, or capture telemetry stream.
