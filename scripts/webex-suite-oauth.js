#!/usr/bin/env node

import dotenv from "dotenv";
import fs from "fs/promises";
import http from "http";
import path from "path";
import { randomUUID } from "crypto";
import {
  buildAuthorizationUrl,
  buildRefreshRequestBody,
  buildTokenExchangeRequestBody,
  createTokenStorePayload,
  getWebexSuiteOAuthSettings,
  maskToken,
  normalizeTokenResponse,
  upsertMcpServerSections,
  validateOAuthSettings,
} from "../lib/webex-suite-oauth.js";

const WORKSPACE_ROOT = process.cwd();
const ENV_PATH = path.join(WORKSPACE_ROOT, ".webex-suite-oauth.env");

dotenv.config({ path: ENV_PATH });

function printUsage() {
  console.log(`Usage:
  node scripts/webex-suite-oauth.js login
  node scripts/webex-suite-oauth.js refresh
  node scripts/webex-suite-oauth.js status

Commands:
  login    Start a local OAuth callback server, exchange the code, store tokens, and update ~/.codex/config.toml
  refresh  Refresh the stored access token using the saved refresh token and update ~/.codex/config.toml
  status   Show current OAuth helper settings and token expiry information
`);
}

function formatHelpfulErrorMessage(error, settings) {
  const message = error instanceof Error ? error.message : String(error);

  if (!/scope/i.test(message) || !/invalid/i.test(message)) {
    return message;
  }

  return [
    message,
    "",
    "Webex rejected one or more requested OAuth scopes.",
    "Check the Webex OAuth Integration and make sure every scope below is enabled there:",
    settings.scopes.split(/\s+/).filter(Boolean).map((scope) => `- ${scope}`).join("\n"),
    "",
    "If you want a smaller permission set, edit WEBEX_OAUTH_SCOPES in .webex-suite-oauth.env to a subset that is both supported by the Webex Suite MCP server and enabled in the Integration.",
  ].join("\n");
}

async function loadTokenStore(settings) {
  try {
    const raw = await fs.readFile(settings.tokenStorePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function saveTokenStore(settings, store) {
  await fs.writeFile(settings.tokenStorePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function exchangeForToken(settings, body) {
  const response = await fetch(settings.tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload.error_description ||
        payload.message ||
        payload.error ||
        `Webex OAuth request failed with status ${response.status}`
    );
  }

  return normalizeTokenResponse(payload);
}

async function ensureConfigFileExists(settings) {
  try {
    await fs.access(settings.configPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.writeFile(settings.configPath, "", "utf8");
      return;
    }

    throw error;
  }
}

async function updateCodexConfig(settings, accessToken) {
  await ensureConfigFileExists(settings);
  const original = await fs.readFile(settings.configPath, "utf8");
  await fs.writeFile(settings.backupPath, original, "utf8");

  const updated = upsertMcpServerSections(
    original,
    settings.mcpServers.map((server) => ({ ...server, accessToken }))
  );

  await fs.writeFile(settings.configPath, updated, "utf8");
}

function createCallbackListener(settings, expectedState) {
  const redirectUrl = new URL(settings.redirectUri);
  const callbackPath = redirectUrl.pathname || "/";

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url, settings.redirectUri);

      if (requestUrl.pathname !== callbackPath) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }

      const returnedState = requestUrl.searchParams.get("state");
      const code = requestUrl.searchParams.get("code");
      const error = requestUrl.searchParams.get("error");
      const errorDescription = requestUrl.searchParams.get("error_description");

      if (error) {
        res.statusCode = 400;
        res.end(`Webex OAuth failed: ${errorDescription || error}`);
        server.close();
        reject(new Error(`Webex OAuth failed: ${errorDescription || error}`));
        return;
      }

      if (returnedState !== expectedState) {
        res.statusCode = 400;
        res.end("OAuth state mismatch.");
        server.close();
        reject(new Error("OAuth state mismatch."));
        return;
      }

      if (!code) {
        res.statusCode = 400;
        res.end("Missing OAuth code.");
        server.close();
        reject(new Error("Missing OAuth code."));
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Webex OAuth complete</title></head>
  <body>
    <h1>Webex OAuth complete</h1>
    <p>You can return to the terminal. The token exchange is continuing there.</p>
  </body>
</html>`);

      server.close();
      resolve(code);
    });

    server.on("error", reject);
    server.listen(Number(redirectUrl.port || 80), redirectUrl.hostname);
  });
}

function printStatus(settings, store) {
  console.log(`OAuth helper env file: ${ENV_PATH}`);
  console.log(`Token store: ${settings.tokenStorePath}`);
  console.log(`Codex config: ${settings.configPath}`);
  console.log(`Backup path: ${settings.backupPath}`);
  console.log("MCP server entries:");
  for (const server of settings.mcpServers) {
    console.log(`- ${server.serverName}: ${server.serverUrl}`);
  }
  console.log(`Redirect URI: ${settings.redirectUri}`);
  console.log(`Scopes: ${settings.scopes}`);
  console.log(`Client ID configured: ${settings.clientId ? "yes" : "no"}`);
  console.log(`Client secret configured: ${settings.clientSecret ? "yes" : "no"}`);

  if (!store) {
    console.log("Stored refresh token: no");
    console.log("Stored access token: no");
    return;
  }

  console.log(`Stored refresh token: ${store.refreshToken ? "yes" : "no"}`);
  console.log(`Stored access token: ${store.accessToken ? "yes" : "no"}`);
  console.log(`Access token preview: ${maskToken(store.accessToken)}`);
  console.log(`Access token expires at: ${store.accessTokenExpiresAt || "unknown"}`);
  console.log(`Refresh token expires at: ${store.refreshTokenExpiresAt || "unknown"}`);
  console.log(`Last updated: ${store.updatedAt || "unknown"}`);
}

async function runLogin() {
  const settings = getWebexSuiteOAuthSettings();
  validateOAuthSettings(settings);

  const state = randomUUID();
  const authorizationUrl = buildAuthorizationUrl(settings, state);

  console.log("Starting local callback listener for Webex OAuth...");
  const codePromise = createCallbackListener(settings, state);

  console.log("");
  console.log("Open this URL in your browser:");
  console.log(authorizationUrl);
  console.log("");
  console.log("Waiting for the OAuth callback...");

  const code = await codePromise;
  const tokenData = await exchangeForToken(
    settings,
    buildTokenExchangeRequestBody(settings, code)
  );

  const store = createTokenStorePayload(settings, tokenData);
  await saveTokenStore(settings, store);
  await updateCodexConfig(settings, tokenData.accessToken);

  console.log("");
  console.log("OAuth login succeeded.");
  console.log(`Access token expires at: ${tokenData.accessTokenExpiresAt || "unknown"}`);
  console.log(`Refresh token expires at: ${tokenData.refreshTokenExpiresAt || "unknown"}`);
  console.log(
    `Updated Codex config entries: ${settings.mcpServers.map((server) => server.serverName).join(", ")}`
  );
}

async function runRefresh() {
  const settings = getWebexSuiteOAuthSettings();
  validateOAuthSettings(settings);

  const store = await loadTokenStore(settings);
  if (!store?.refreshToken) {
    throw new Error(
      `No refresh token found in ${settings.tokenStorePath}. Run the login command first.`
    );
  }

  const tokenData = await exchangeForToken(
    settings,
    buildRefreshRequestBody(settings, store.refreshToken)
  );

  const nextStore = createTokenStorePayload(settings, tokenData);
  await saveTokenStore(settings, nextStore);
  await updateCodexConfig(settings, tokenData.accessToken);

  console.log("OAuth refresh succeeded.");
  console.log(`Access token expires at: ${tokenData.accessTokenExpiresAt || "unknown"}`);
  console.log(`Refresh token expires at: ${tokenData.refreshTokenExpiresAt || "unknown"}`);
  console.log(
    `Updated Codex config entries: ${settings.mcpServers.map((server) => server.serverName).join(", ")}`
  );
}

async function runStatus() {
  const settings = getWebexSuiteOAuthSettings();
  const store = await loadTokenStore(settings);
  printStatus(settings, store);
}

async function main() {
  const command = process.argv[2];

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (command === "login") {
    await runLogin();
    return;
  }

  if (command === "refresh") {
    await runRefresh();
    return;
  }

  if (command === "status") {
    await runStatus();
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main().catch((error) => {
  const settings = getWebexSuiteOAuthSettings();
  console.error(formatHelpfulErrorMessage(error, settings));
  process.exitCode = 1;
});
