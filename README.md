# Webex Suite MCP OAuth Helper

A small local companion for the official hosted [Webex Messaging MCP server](https://developer.webex.com/mcp/docs/messaging-mcp-server) and [Webex Meetings MCP server](https://developer.webex.com/mcp/docs/meetings-mcp-server).

This repository is **not** a Webex Messaging MCP server and it does not proxy Webex traffic. It performs the Webex OAuth authorization-code flow locally, keeps the resulting tokens out of Git, and writes the current bearer token into Codex's local MCP configuration.

## Why this helper exists

The hosted Webex Messaging and Meetings MCP servers need a user-authorized Webex access token. This helper uses a deliberate, inspectable setup that works with explicit bearer-token headers:

1. You create a Webex OAuth Integration and approve access in your browser.
2. The helper receives the local callback and exchanges the authorization code for access and refresh tokens.
3. It stores the tokens only in local ignored files.
4. It updates the `Webex-messaging` and `Webex-meeting` entries in `~/.codex/config.toml` with the same current access token.
5. A later refresh rotates the token and updates both config entries again.

The helper removes the need to manually copy a short-lived access token into `config.toml`. It does not replace native OAuth support where a Codex client and an MCP server provide it.

## Prerequisites

- Node.js `18.20.0` or later.
- A Webex account allowed to use the required scopes.
- A manually created Webex OAuth Integration. Webex does not provide a supported API for automatically creating this user integration.
- Codex configured locally. The helper's default target is `~/.codex/config.toml`.

## Create the Webex OAuth Integration

1. Open [My Webex Apps](https://developer.webex.com/my-apps) and select **Create a New App** then **Create an Integration**.
2. Give the integration a clear name, such as `Webex Suite MCP - <your name>`.
3. Set the redirect URI to exactly `http://127.0.0.1:8787/callback`.
4. Enable every scope in the list below. The scopes configured in Webex must match the helper's `WEBEX_OAUTH_SCOPES` value.
5. Create the integration, then copy its client ID and client secret. Keep the secret private.

Required default scopes:

```text
spark:mcp meeting:schedules_read meeting:schedules_write meeting:participants_read meeting:summaries_read meeting:recordings_read meeting:transcripts_read spark:messages_write spark:messages_read spark:rooms_write spark:rooms_read spark:memberships_write spark:webhooks_write Identity:Organization Identity:Config
```

If Webex rejects the login with an invalid-scope error, check both the Integration scope selection and `WEBEX_OAUTH_SCOPES`. You may use a smaller compatible set only if the official Webex MCP servers support the reduced permissions you need.

## Install and first login

```bash
git clone https://github.com/stecohen/webex-suite-mcp-oauth-helper.git
cd webex-suite-mcp-oauth-helper
npm install
cp .webex-suite-oauth.env.example .webex-suite-oauth.env
```

Open `.webex-suite-oauth.env` and set these values:

```dotenv
WEBEX_OAUTH_CLIENT_ID=your-client-id
WEBEX_OAUTH_CLIENT_SECRET=your-client-secret
WEBEX_OAUTH_REDIRECT_URI=http://127.0.0.1:8787/callback
```

Then start the login:

```bash
npm run oauth:webex-suite:login
```

The command starts a callback listener on `127.0.0.1:8787` and prints a Webex authorization URL. Open that URL in your normal browser, sign in, and approve the requested access. Leave the command running until it reports `OAuth login succeeded.`

The redirect URI must match exactly in all three places: the Webex Integration, `.webex-suite-oauth.env`, and the browser authorization request. A mismatch causes Webex's `redirect_uri_mismatch` error.

## How Codex is updated

After a successful login or refresh, the helper creates a backup of the current file at `~/.codex/config.toml.webex-oauth.backup` and upserts both sections in `~/.codex/config.toml` with the same bearer token:

```toml
[mcp_servers.Webex-messaging]
enabled = true
url = "https://mcp.webexapis.com/mcp/webex-messaging"
http_headers = {"Authorization" = "Bearer <current Webex access token>"}

[mcp_servers.Webex-meeting]
enabled = true
url = "https://mcp.webexapis.com/mcp/webex-meeting"
http_headers = {"Authorization" = "Bearer <current Webex access token>"}
```

Only the `Webex-messaging` and `Webex-meeting` sections are replaced; other Codex MCP server entries remain unchanged. The bearer token shown above is illustrative: never paste, commit, or share a real one. If Codex does not pick up the updated configuration immediately, start a new task or restart/reconnect the MCP client.

## Commands

```bash
# Start browser-based OAuth login, save tokens, and update config.toml.
npm run oauth:webex-suite:login

# Use the stored refresh token, rotate the access token, and update config.toml.
npm run oauth:webex-suite:refresh

# Show configuration and expiry state without revealing the full token.
npm run oauth:webex-suite:status

# Run the helper tests.
npm test
```

Run all commands from the repository root. The default local token file is `.webex-suite-oauth.json`; it includes both the access token and refresh token.

## Automate a weekly refresh

Refresh before the access token expires. A weekly schedule is a sensible default, but choose a cadence shorter than the access-token lifetime reported by `npm run oauth:webex-suite:status`.

### Option 1: Codex recurring task

Create a weekly recurring task in Codex with a prompt such as:

```text
In /absolute/path/to/webex-suite-mcp-oauth-helper, run npm run oauth:webex-suite:refresh.
Report only whether it succeeded and the token expiry time. Do not print OAuth secrets or tokens.
```

Choose a weekly schedule and make sure the task can run local terminal commands. The first authorization must still be completed interactively with `npm run oauth:webex-suite:login`.

### Option 2: macOS `launchd`

For a refresh independent of the Codex app, first run `command -v npm`. Create `~/Library/LaunchAgents/com.example.webex-suite-mcp-oauth-refresh.plist`, substituting `REPOSITORY_PATH` and `NPM_PATH` with the repository and `npm` paths from your machine:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.example.webex-suite-mcp-oauth-refresh</string>
  <key>ProgramArguments</key>
  <array>
    <string>NPM_PATH</string>
    <string>run</string>
    <string>oauth:webex-suite:refresh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>REPOSITORY_PATH</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key><integer>1</integer>
    <key>Hour</key><integer>9</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/tmp/webex-suite-mcp-oauth-refresh.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/webex-suite-mcp-oauth-refresh.error.log</string>
</dict>
</plist>
```

Load it for the current user:

```bash
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.example.webex-suite-mcp-oauth-refresh.plist
```

This example runs every Monday at 09:00 local time. To test it immediately, use:

```bash
launchctl kickstart -k "gui/$(id -u)/com.example.webex-suite-mcp-oauth-refresh"
```

Review `/tmp/webex-suite-mcp-oauth-refresh.log` if the refresh does not succeed. If the refresh token has expired or been revoked, run the interactive login command again.

## Security and sharing

Do not commit or share these local files:

- `.webex-suite-oauth.env` contains the client secret.
- `.webex-suite-oauth.json` contains live access and refresh tokens.
- `~/.codex/config.toml` contains the bearer token while this helper is configured.
- `~/.codex/config.toml.webex-oauth.backup` may contain an earlier bearer token.

The repository's `.gitignore` excludes the first two files. Run `npm run package:share` to create a sanitized archive for teammates. Each teammate should create their own Webex Integration and authenticate their own Webex account; never distribute a shared integration secret or a token store.

See [SHARE-WEBEX-SUITE-OAUTH.md](SHARE-WEBEX-SUITE-OAUTH.md) for a concise teammate-sharing checklist.

## Troubleshooting

- `redirect_uri_mismatch`: make the redirect URI exactly `http://127.0.0.1:8787/callback` in the Webex Integration and env file.
- `invalid scope`: enable the requested scopes on the Webex Integration and retry login.
- `No refresh token found`: run `npm run oauth:webex-suite:login` first.
- Refresh fails after working previously: the refresh token may have expired or been revoked. Run the login command again.
- Webex MCP does not connect after a successful refresh: run `npm run oauth:webex-suite:status`, confirm the server URL, then restart/reconnect the MCP client so it reads the latest config.
