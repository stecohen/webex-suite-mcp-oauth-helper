import os from "os";

export const DEFAULT_WEBEX_AUTHORIZE_URL = "https://webexapis.com/v1/authorize";
export const DEFAULT_WEBEX_TOKEN_URL = "https://webexapis.com/v1/access_token";
export const DEFAULT_CODEX_CONFIG_PATH = "~/.codex/config.toml";
export const DEFAULT_WEBEX_MESSAGING_MCP_SERVER_NAME = "Webex-messaging";
export const DEFAULT_WEBEX_MESSAGING_MCP_SERVER_URL =
  "https://mcp.webexapis.com/mcp/webex-messaging";
export const DEFAULT_WEBEX_MEETING_MCP_SERVER_NAME = "Webex-meeting";
export const DEFAULT_WEBEX_MEETING_MCP_SERVER_URL =
  "https://mcp.webexapis.com/mcp/webex-meeting";
export const DEFAULT_WEBEX_SUITE_SCOPES =
  "spark:mcp meeting:schedules_read meeting:schedules_write meeting:participants_read meeting:summaries_read meeting:recordings_read meeting:transcripts_read spark:messages_write spark:messages_read spark:rooms_write spark:rooms_read spark:memberships_write spark:webhooks_write Identity:Organization Identity:Config";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function expandHomePath(inputPath, homeDir = os.homedir()) {
  if (!inputPath || inputPath === "~") {
    return homeDir;
  }

  if (inputPath.startsWith("~/")) {
    return `${homeDir}/${inputPath.slice(2)}`;
  }

  return inputPath;
}

export function getWebexSuiteOAuthSettings(env = process.env) {
  const configPath = expandHomePath(
    clean(env.CODEX_CONFIG_PATH) || DEFAULT_CODEX_CONFIG_PATH
  );

  const tokenStorePath = expandHomePath(
    clean(env.WEBEX_OAUTH_TOKEN_STORE_PATH) || ".webex-suite-oauth.json"
  );

  const backupPath = expandHomePath(
    clean(env.CODEX_CONFIG_BACKUP_PATH) || `${configPath}.webex-oauth.backup`
  );

  return {
    clientId: clean(env.WEBEX_OAUTH_CLIENT_ID),
    clientSecret: clean(env.WEBEX_OAUTH_CLIENT_SECRET),
    redirectUri:
      clean(env.WEBEX_OAUTH_REDIRECT_URI) || "http://127.0.0.1:8787/callback",
    scopes: clean(env.WEBEX_OAUTH_SCOPES) || DEFAULT_WEBEX_SUITE_SCOPES,
    authorizeUrl:
      clean(env.WEBEX_OAUTH_AUTHORIZE_URL) || DEFAULT_WEBEX_AUTHORIZE_URL,
    tokenUrl: clean(env.WEBEX_OAUTH_TOKEN_URL) || DEFAULT_WEBEX_TOKEN_URL,
    configPath,
    backupPath,
    tokenStorePath,
    mcpServers: [
      {
        serverName:
          clean(env.CODEX_WEBEX_MESSAGING_MCP_SERVER_NAME) ||
          DEFAULT_WEBEX_MESSAGING_MCP_SERVER_NAME,
        serverUrl:
          clean(env.CODEX_WEBEX_MESSAGING_MCP_SERVER_URL) ||
          DEFAULT_WEBEX_MESSAGING_MCP_SERVER_URL,
      },
      {
        serverName:
          clean(env.CODEX_WEBEX_MEETING_MCP_SERVER_NAME) ||
          DEFAULT_WEBEX_MEETING_MCP_SERVER_NAME,
        serverUrl:
          clean(env.CODEX_WEBEX_MEETING_MCP_SERVER_URL) ||
          DEFAULT_WEBEX_MEETING_MCP_SERVER_URL,
      },
    ],
  };
}

export function validateOAuthSettings(settings, { requireClientSecret = true } = {}) {
  const missing = [];

  if (!settings.clientId) {
    missing.push("WEBEX_OAUTH_CLIENT_ID");
  }

  if (requireClientSecret && !settings.clientSecret) {
    missing.push("WEBEX_OAUTH_CLIENT_SECRET");
  }

  if (!settings.redirectUri) {
    missing.push("WEBEX_OAUTH_REDIRECT_URI");
  }

  if (!settings.scopes) {
    missing.push("WEBEX_OAUTH_SCOPES");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required OAuth settings: ${missing.join(", ")}`);
  }
}

export function buildAuthorizationUrl(settings, state) {
  validateOAuthSettings(settings);

  if (!clean(state)) {
    throw new Error("state is required to build the Webex authorization URL");
  }

  const url = new URL(settings.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", settings.clientId);
  url.searchParams.set("redirect_uri", settings.redirectUri);
  url.searchParams.set("scope", settings.scopes);
  url.searchParams.set("state", state);
  return url.toString();
}

export function normalizeTokenResponse(tokenResponse, now = Date.now()) {
  const accessToken = clean(tokenResponse.access_token);
  const refreshToken = clean(tokenResponse.refresh_token);

  if (!accessToken) {
    throw new Error("Webex token response did not include an access_token");
  }

  if (!refreshToken) {
    throw new Error("Webex token response did not include a refresh_token");
  }

  const accessTokenExpiresIn = Number(tokenResponse.expires_in);
  const refreshTokenExpiresIn = Number(tokenResponse.refresh_token_expires_in);
  const accessTokenExpiresAt = Number.isFinite(accessTokenExpiresIn)
    ? new Date(now + accessTokenExpiresIn * 1000).toISOString()
    : null;
  const refreshTokenExpiresAt = Number.isFinite(refreshTokenExpiresIn)
    ? new Date(now + refreshTokenExpiresIn * 1000).toISOString()
    : null;

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    accessTokenExpiresIn: Number.isFinite(accessTokenExpiresIn)
      ? accessTokenExpiresIn
      : null,
    refreshTokenExpiresIn: Number.isFinite(refreshTokenExpiresIn)
      ? refreshTokenExpiresIn
      : null,
    tokenType: clean(tokenResponse.token_type) || "Bearer",
    scope: clean(tokenResponse.scope),
    raw: tokenResponse,
  };
}

export function createTokenStorePayload(settings, tokenData) {
  return {
    mcpServers: settings.mcpServers,
    authorizeUrl: settings.authorizeUrl,
    tokenUrl: settings.tokenUrl,
    clientId: settings.clientId,
    redirectUri: settings.redirectUri,
    scopes: settings.scopes,
    refreshToken: tokenData.refreshToken,
    refreshTokenExpiresAt: tokenData.refreshTokenExpiresAt,
    accessToken: tokenData.accessToken,
    accessTokenExpiresAt: tokenData.accessTokenExpiresAt,
    updatedAt: new Date().toISOString(),
  };
}

export function buildTokenExchangeRequestBody(settings, code) {
  return new URLSearchParams({
    grant_type: "authorization_code",
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
    redirect_uri: settings.redirectUri,
    code: clean(code),
  });
}

export function buildRefreshRequestBody(settings, refreshToken) {
  return new URLSearchParams({
    grant_type: "refresh_token",
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
    refresh_token: clean(refreshToken),
  });
}

function escapeTomlString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

export function renderMcpServerSection({ serverName, serverUrl, accessToken }) {
  return [
    `[mcp_servers.${serverName}]`,
    "enabled = true",
    `url = "${escapeTomlString(serverUrl)}"`,
    `http_headers = {"Authorization" = "Bearer ${escapeTomlString(accessToken)}"}`,
  ].join("\n");
}

export function upsertMcpServerSection(configText, sectionOptions) {
  const sectionText = renderMcpServerSection(sectionOptions);
  const lines = configText.split(/\r?\n/);
  const header = `[mcp_servers.${sectionOptions.serverName}]`;

  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === header) {
      start = index;
      break;
    }
  }

  if (start === -1) {
    const trimmed = configText.trimEnd();
    return trimmed ? `${trimmed}\n\n${sectionText}\n` : `${sectionText}\n`;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[[^\]]+\]\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }

  const nextLines = [
    ...lines.slice(0, start),
    ...sectionText.split("\n"),
    ...lines.slice(end),
  ];

  return `${nextLines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

export function upsertMcpServerSections(configText, sections) {
  return sections.reduce(
    (updatedConfig, section) => upsertMcpServerSection(updatedConfig, section),
    configText
  );
}

export function maskToken(token) {
  const cleaned = clean(token);
  if (cleaned.length <= 12) {
    return cleaned ? `${cleaned.slice(0, 3)}...` : "";
  }

  return `${cleaned.slice(0, 6)}...${cleaned.slice(-6)}`;
}
