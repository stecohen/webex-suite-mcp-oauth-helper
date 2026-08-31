import { describe, it } from "node:test";
import assert from "node:assert";
import {
  buildAuthorizationUrl,
  expandHomePath,
  getWebexSuiteOAuthSettings,
  normalizeTokenResponse,
  upsertMcpServerSection,
} from "../lib/webex-suite-oauth.js";

describe("Webex Suite OAuth Helper", () => {
  it("expands home-relative paths", () => {
    assert.strictEqual(
      expandHomePath("~/config.toml", "/Users/example"),
      "/Users/example/config.toml"
    );
  });

  it("builds a Webex authorization URL", () => {
    const settings = getWebexSuiteOAuthSettings({
      WEBEX_OAUTH_CLIENT_ID: "client-123",
      WEBEX_OAUTH_CLIENT_SECRET: "secret-123",
      WEBEX_OAUTH_REDIRECT_URI: "http://127.0.0.1:8787/callback",
      WEBEX_OAUTH_SCOPES: "spark:mcp spark:messages_read",
    });

    const url = new URL(buildAuthorizationUrl(settings, "state-123"));
    assert.strictEqual(url.origin + url.pathname, "https://webexapis.com/v1/authorize");
    assert.strictEqual(url.searchParams.get("client_id"), "client-123");
    assert.strictEqual(url.searchParams.get("redirect_uri"), "http://127.0.0.1:8787/callback");
    assert.strictEqual(url.searchParams.get("scope"), "spark:mcp spark:messages_read");
    assert.strictEqual(url.searchParams.get("state"), "state-123");
  });

  it("normalizes token response metadata", () => {
    const normalized = normalizeTokenResponse(
      {
        access_token: "access-123",
        refresh_token: "refresh-123",
        expires_in: 3600,
        refresh_token_expires_in: 7200,
      },
      Date.parse("2026-08-29T12:00:00.000Z")
    );

    assert.strictEqual(normalized.accessToken, "access-123");
    assert.strictEqual(normalized.refreshToken, "refresh-123");
    assert.strictEqual(normalized.accessTokenExpiresAt, "2026-08-29T13:00:00.000Z");
    assert.strictEqual(normalized.refreshTokenExpiresAt, "2026-08-29T14:00:00.000Z");
  });

  it("adds a new MCP server section when it is missing", () => {
    const updated = upsertMcpServerSection(
      'model = "gpt-5.5"\n',
      {
        serverName: "Webex-suite",
        serverUrl: "https://mcp.webexapis.com/mcp/webex-suite",
        accessToken: "access-token-123",
      }
    );

    assert.match(updated, /\[mcp_servers\.Webex-suite\]/);
    assert.match(updated, /Bearer access-token-123/);
  });

  it("replaces an existing MCP server section without touching neighbors", () => {
    const original = `model = "gpt-5.5"

[mcp_servers.Webex-suite]
enabled = true
url = "https://old.example.com/mcp"
http_headers = {"Authorization" = "Bearer old-token"}

[mcp_servers.jira]
enabled = true
url = "https://jira.example.com/"
`;

    const updated = upsertMcpServerSection(original, {
      serverName: "Webex-suite",
      serverUrl: "https://mcp.webexapis.com/mcp/webex-suite",
      accessToken: "new-access-token",
    });

    assert.match(updated, /https:\/\/mcp\.webexapis\.com\/mcp\/webex-suite/);
    assert.match(updated, /Bearer new-access-token/);
    assert.match(updated, /\[mcp_servers\.jira\]/);
    assert.doesNotMatch(updated, /old-token/);
  });
});
