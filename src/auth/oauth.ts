import { randomBytes, createHash } from "node:crypto";
import type { Request, Response } from "express";
import { config, isDev } from "../core/config.js";
import { logger } from "../core/audit.js";

export interface OAuthClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
}

export interface OAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
}

interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  clientId: string;
  userId: string;
  scope: string;
  expiresAt: number;
}

const clients = new Map<string, OAuthClient>();
const tokens = new Map<string, StoredToken>();
const authCodes = new Map<string, { clientId: string; redirectUri: string; codeChallenge: string; codeChallengeMethod: string; scope: string; expiresAt: number }>();

const TOKEN_TTL = 3600_000;
const REFRESH_TTL = 86400_000;
const CODE_TTL = 600_000;

export function registerClient(client: OAuthClient): OAuthClient {
  clients.set(client.client_id, client);
  return client;
}

export function getClient(clientId: string): OAuthClient | undefined {
  return clients.get(clientId);
}

export function generateAuthCode(
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  codeChallengeMethod: string,
  scope: string,
): string {
  const code = randomBytes(32).toString("hex");
  authCodes.set(code, {
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope,
    expiresAt: Date.now() + CODE_TTL,
  });
  return code;
}

export function validateAuthCode(code: string, verifier: string): { clientId: string; scope: string; redirectUri: string } | null {
  const stored = authCodes.get(code);
  if (!stored) return null;
  if (Date.now() > stored.expiresAt) {
    authCodes.delete(code);
    return null;
  }
  if (stored.codeChallengeMethod === "S256") {
    const hash = createHash("sha256").update(verifier).digest("base64url");
    if (hash !== stored.codeChallenge) return null;
  }
  authCodes.delete(code);
  return { clientId: stored.clientId, scope: stored.scope, redirectUri: stored.redirectUri };
}

export function issueToken(clientId: string, userId: string, scope: string): OAuthToken {
  const accessToken = randomBytes(32).toString("hex");
  const refreshToken = randomBytes(32).toString("hex");
  tokens.set(accessToken, {
    accessToken,
    refreshToken,
    clientId,
    userId,
    scope,
    expiresAt: Date.now() + TOKEN_TTL,
  });
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: TOKEN_TTL / 1000,
    scope,
    refresh_token: refreshToken,
  };
}

export function refreshAccessToken(refreshToken: string): OAuthToken | null {
  for (const [accessToken, stored] of tokens) {
    if (stored.refreshToken === refreshToken) {
      tokens.delete(accessToken);
      return issueToken(stored.clientId, stored.userId, stored.scope);
    }
  }
  return null;
}

export function validateAccessToken(accessToken: string): { clientId: string; userId: string; scope: string } | null {
  if (isDev() && !config.bridge.authSecret) {
    return { clientId: "dev", userId: "dev", scope: "read write" };
  }
  const stored = tokens.get(accessToken);
  if (!stored) return null;
  if (Date.now() > stored.expiresAt) {
    tokens.delete(accessToken);
    return null;
  }
  return { clientId: stored.clientId, userId: stored.userId, scope: stored.scope };
}

export function revokeToken(token: string): boolean {
  if (tokens.has(token)) {
    tokens.delete(token);
    return true;
  }
  for (const [accessToken, stored] of tokens) {
    if (stored.refreshToken === token) {
      tokens.delete(accessToken);
      return true;
    }
  }
  return false;
}

export function getMetadata() {
  const issuer = config.oauth.issuer || config.bridge.publicUrl;
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    registration_endpoint: `${issuer}/oauth/register`,
    scopes_supported: ["read", "write", "admin"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
    service_documentation: `${issuer}/docs`,
    code_challenge_methods_supported: ["S256"],
  };
}

export function getProtectedResourceMetadata() {
  const issuer = config.oauth.issuer || config.bridge.publicUrl;
  return {
    resource: issuer,
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: ["read", "write", "admin"],
    resource_documentation: `${issuer}/docs`,
  };
}
