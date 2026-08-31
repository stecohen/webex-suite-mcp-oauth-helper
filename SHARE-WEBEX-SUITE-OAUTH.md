# Share the Webex Suite OAuth Helper

This repo includes a helper for the official Webex Messaging and Meetings MCP servers. Each login or refresh updates both Codex entries with the same access token:

- `Webex-messaging` at `https://mcp.webexapis.com/mcp/webex-messaging`
- `Webex-meeting` at `https://mcp.webexapis.com/mcp/webex-meeting`

- `npm run oauth:webex-suite:login`
- `npm run oauth:webex-suite:refresh`
- `npm run oauth:webex-suite:status`

## Easiest way to share with teammates

Use the packaging command below from the project root:

```bash
npm run package:share
```

That command creates a sanitized `.tar.gz` archive in `share/` that:

- includes the OAuth helper code, tests, and docs
- excludes local secrets and tokens
- excludes `node_modules`
- excludes the generated local OAuth token store

## What teammates need to do

1. Extract the archive
2. Run `npm install`
3. Copy `.webex-suite-oauth.env.example` to `.webex-suite-oauth.env`
4. Add their own Webex OAuth integration values
5. Run `npm run oauth:webex-suite:login`

## Scope checklist

For the official Webex Messaging and Meetings MCP servers, the default helper expects this scope set:

```text
spark:mcp meeting:schedules_read meeting:schedules_write meeting:participants_read meeting:summaries_read meeting:recordings_read meeting:transcripts_read spark:messages_write spark:messages_read spark:rooms_write spark:rooms_read spark:memberships_write spark:webhooks_write Identity:Organization Identity:Config
```

## Important

Do not share these local files:

- `.env`
- `.webex-suite-oauth.env`
- `.webex-suite-oauth.json`

They may contain secrets or live tokens tied to your account.
