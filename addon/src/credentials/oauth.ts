import { GitHub, Spotify, generateCodeVerifier, generateState, OAuth2Tokens } from "arctic";
import { getCredentialType } from "./registry.ts";
import { getManager } from "./manager.ts";
import type { OAuth2CodeAuthSpec } from "./registry.ts";
import type { StoredTokens } from "./storage.ts";

/**
 * Server-side OAuth 2.0 Authorization Code flow (arctic). The addon generates
 * the `state` and (for public clients) the PKCE verifier, holds the
 * `client_secret`, and performs token exchange; the CLI only relays the
 * authorization `code` back. Callbacks land on the CLI-hosted loopback below.
 */

/** Fixed loopback redirect URI registered in each OAuth app (see ADR 0002). */
export const REDIRECT_URI = "http://127.0.0.1:8765/cb";

/** A connect flow awaiting its authorization code, keyed by `state`. */
interface PendingAuthorization {
  type: string;
  state: string;
  /** PKCE code verifier; present only for public clients (Spotify). */
  verifier?: string;
}

const pending = new Map<string, PendingAuthorization>();

/**
 * Resolve a field value for a Credential Type, preferring an environment
 * variable, then a stored field. Used for OAuth client credentials, which may
 * be supplied either via env (GITHUB_CLIENT_ID, …) or stored on the Credential.
 */
function resolveClientValue(type: string, envName: string, fieldName: string): string | undefined {
  const fromEnv = process.env[envName];
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  return getManager().getCredential(type)?.fields[fieldName];
}

/** Build the arctic client for an `oauth2-code` Credential Type from env + stored fields. */
function buildClient(type: string, spec: OAuth2CodeAuthSpec): GitHub | Spotify {
  if (spec.provider === "github") {
    const clientId = resolveClientValue(type, "GITHUB_CLIENT_ID", "clientId");
    const clientSecret = resolveClientValue(type, "GITHUB_CLIENT_SECRET", "clientSecret");
    if (clientId === undefined || clientSecret === undefined) {
      throw new Error(
        `GitHub OAuth requires a client id and secret (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET).`,
      );
    }
    return new GitHub(clientId, clientSecret, REDIRECT_URI);
  }

  // Spotify: public client + PKCE, no client secret.
  const clientId = resolveClientValue(type, "SPOTIFY_CLIENT_ID", "clientId");
  if (clientId === undefined) {
    throw new Error(`Spotify OAuth requires a client id (SPOTIFY_CLIENT_ID).`);
  }
  return new Spotify(clientId, null, REDIRECT_URI);
}

/** Look up the `oauth2-code` auth spec for a type, or throw if it isn't one. */
function oauthSpec(type: string): OAuth2CodeAuthSpec {
  const credentialType = getCredentialType(type);
  if (credentialType === undefined) {
    throw new Error(`Unknown credential type "${type}".`);
  }
  if (credentialType.auth.kind !== "oauth2-code") {
    throw new Error(`Credential type "${type}" does not use oauth2-code.`);
  }
  return credentialType.auth;
}

/** Map an arctic {@link OAuth2Tokens} response to our stored shape. */
function toStoredTokens(tokens: OAuth2Tokens): StoredTokens {
  let expiresAt: number | undefined;
  // GitHub classic-OAuth tokens have no `expires_in`; treat as non-expiring.
  try {
    expiresAt = tokens.accessTokenExpiresAt().getTime();
  } catch {
    expiresAt = undefined;
  }

  return {
    accessToken: tokens.accessToken(),
    refreshToken: tokens.hasRefreshToken() ? tokens.refreshToken() : undefined,
    expiresAt,
  };
}

/**
 * Begin a connect flow: generate `state` (+ PKCE verifier for public clients),
 * build the provider authorization URL, and stash the pending flow in memory.
 * Returns the URL to open in a browser and the `state` to echo on callback.
 */
export function authorize(type: string): { authUrl: string; state: string } {
  const spec = oauthSpec(type);
  const client = buildClient(type, spec);
  const state = generateState();

  let authUrl: string;
  let verifier: string | undefined;

  if (client instanceof Spotify) {
    verifier = spec.pkce ? generateCodeVerifier() : undefined;
    authUrl = client.createAuthorizationURL(state, verifier ?? null, spec.scopes).toString();
  } else {
    authUrl = client.createAuthorizationURL(state, spec.scopes).toString();
  }

  pending.set(state, { type, state, verifier });
  return { authUrl, state };
}

/**
 * Complete a connect flow: validate the relayed `code` against the pending
 * `state`, exchange it for tokens (server-side), and persist them on the
 * Credential. Returns the stored tokens (without secrets leaving the addon).
 */
export async function handleCallback(
  type: string,
  code: string,
  state: string,
): Promise<StoredTokens> {
  const flow = pending.get(state);
  if (flow === undefined) {
    throw new Error(`No pending authorization for state "${state}".`);
  }
  if (flow.type !== type) {
    throw new Error(`State "${state}" belongs to credential type "${flow.type}", not "${type}".`);
  }

  const spec = oauthSpec(type);
  const client = buildClient(type, spec);

  let tokens: OAuth2Tokens;
  if (client instanceof Spotify) {
    tokens = await client.validateAuthorizationCode(code, flow.verifier ?? null);
  } else {
    tokens = await client.validateAuthorizationCode(code);
  }

  pending.delete(state);
  const stored = toStoredTokens(tokens);
  await getManager().upsertCredential(type, { tokens: stored });
  return stored;
}

/**
 * Refresh the access token for a connected Credential using its stored refresh
 * token, then persist the new tokens. Throws if there is no refresh token
 * (e.g. GitHub classic-OAuth tokens, which never expire and cannot be
 * refreshed). Returns the refreshed stored tokens.
 */
export async function refresh(type: string): Promise<StoredTokens> {
  const spec = oauthSpec(type);
  const existing = getManager().getCredential(type);
  const refreshToken = existing?.tokens?.refreshToken;
  if (refreshToken === undefined) {
    throw new Error(`Credential "${type}" has no refresh token; cannot refresh.`);
  }

  const client = buildClient(type, spec);
  const tokens = await client.refreshAccessToken(refreshToken);
  const stored = toStoredTokens(tokens);
  // Providers may omit a new refresh token on refresh; keep the old one.
  if (stored.refreshToken === undefined) {
    stored.refreshToken = refreshToken;
  }

  await getManager().upsertCredential(type, { tokens: stored });
  return stored;
}
