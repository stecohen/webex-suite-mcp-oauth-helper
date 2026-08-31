# Webex Suite MCP OAuth Helper

Local OAuth helper for the official hosted Webex Suite MCP server at `https://mcp.webexapis.com/mcp/webex-suite`.

This is not a Webex Messaging MCP server. It starts a local OAuth callback, stores OAuth tokens outside Git, and updates `[mcp_servers.Webex-suite]` in `~/.codex/config.toml` with a current bearer token.

## Install

```bash
git clone https://github.com/stecohen/webex-suite-mcp-oauth-helper.git
cd webex-suite-mcp-oauth-helper
npm install
cp .webex-suite-oauth.env.example .webex-suite-oauth.env
```

Add your Webex OAuth Integration client ID and client secret to `.webex-suite-oauth.env`. The integration redirect URI must exactly match `http://127.0.0.1:8787/callback`.

## Commands

```bash
npm run oauth:webex-suite:login
npm run oauth:webex-suite:refresh
npm run oauth:webex-suite:status
npm test
```

Use `npm run package:share` to create a sanitized archive for teammates. Do not share `.webex-suite-oauth.env` or `.webex-suite-oauth.json`.

See [SHARE-WEBEX-SUITE-OAUTH.md](SHARE-WEBEX-SUITE-OAUTH.md) for the required scopes and teammate setup.
