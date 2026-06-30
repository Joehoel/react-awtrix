import { ofetch } from "ofetch";
import type { FetchOptions, FetchResponse } from "ofetch";
import { getCredentialType } from "./registry.ts";
import { getManager } from "./manager.ts";
import { refresh } from "./oauth.ts";
import type { ApiKeyAuthSpec } from "./registry.ts";
import type { StoredCredential, StoredTokens } from "./storage.ts";

/**
 * The runtime side of the credential subsystem: {@link authenticatedFetch}
 * reads a stored Credential from the manager singleton and attaches its auth to
 * every outgoing request — static header/query injection for `apiKey`, a Bearer
 * access token (with proactive + reactive refresh) for `oauth2-code`.
 */

/** Refresh an access token this many milliseconds before it actually expires. */
const REFRESH_SKEW_MS = 60_000;

const TEMPLATE_PATTERN = /\{\{\s*(base64\()?\s*([A-Za-z0-9_]+)\s*\)?\s*\}\}/g;

/**
 * Expand an injection template against a Credential's stored fields. Supports
 * ONLY `{{field}}` and `{{base64(field)}}` — e.g. `Bearer {{apiKey}}` or
 * `Basic {{base64(clientId)}}`. Unknown fields expand to the empty string.
 */
export function resolveTemplate(template: string, fields: Record<string, string>): string {
  return template.replace(TEMPLATE_PATTERN, (_match, base64, name: string) => {
    const value = fields[name] ?? "";
    return base64 ? Buffer.from(value, "utf8").toString("base64") : value;
  });
}

/** Whether a token is expired or within the refresh skew window. */
function isExpiring(tokens: StoredTokens): boolean {
  if (tokens.expiresAt === undefined) {
    return false;
  }
  return Date.now() >= tokens.expiresAt - REFRESH_SKEW_MS;
}

/** Inject an `apiKey` Credential's field into the request headers or query. */
function injectApiKey(
  spec: ApiKeyAuthSpec,
  credential: StoredCredential,
  headers: Headers,
  query: Record<string, unknown>,
): void {
  const value = resolveTemplate(spec.inject.template, credential.fields);
  if (spec.inject.in === "header") {
    headers.set(spec.inject.name, value);
  } else {
    query[spec.inject.name] = value;
  }
}

/**
 * A `fetch`-compatible client bound to a Credential Type. Reads the stored
 * Credential from the manager singleton at call time and attaches its auth:
 *
 * - `apiKey`: expands the injection template and sets the configured header or
 *   query parameter.
 * - `oauth2-code`: proactively refreshes the access token when it is expired or
 *   about to expire (and a refresh token exists), persists the new tokens, then
 *   sets `Authorization: Bearer <accessToken>`. On a 401 it refreshes once and
 *   retries the request.
 *
 * Throws if the Credential Type is unknown or no Credential is connected.
 */
export async function authenticatedFetch<T = unknown>(
  type: string,
  request: string,
  options: FetchOptions<"json"> = {},
): Promise<T> {
  const credentialType = getCredentialType(type);
  if (credentialType === undefined) {
    throw new Error(`Unknown credential type "${type}".`);
  }

  const auth = credentialType.auth;
  // Tracks whether we've already attempted a reactive (401) refresh this call.
  let refreshedOn401 = false;

  if (auth.kind === "oauth2-code") {
    // Proactive refresh before the first request when the token is expiring.
    const current = getManager().getCredential(type);
    if (current?.tokens !== undefined && isExpiring(current.tokens)) {
      if (current.tokens.refreshToken !== undefined) {
        await refresh(type);
      }
    }
  }

  const client = ofetch.create({
    retry: auth.kind === "oauth2-code" ? 1 : 0,
    retryStatusCodes: [401],
    onRequest({ options: requestOptions }) {
      const credential = getManager().getCredential(type);
      if (credential === undefined) {
        throw new Error(`No connected credential for "${type}".`);
      }

      const headers = requestOptions.headers;
      if (auth.kind === "apiKey") {
        const query: Record<string, unknown> = (requestOptions.query ??= {});
        injectApiKey(auth, credential, headers, query);
        return;
      }

      const accessToken = credential.tokens?.accessToken;
      if (accessToken === undefined) {
        throw new Error(`Credential "${type}" is not connected (no access token).`);
      }
      headers.set("Authorization", `Bearer ${accessToken}`);
    },
    async onResponseError({ response }) {
      if (auth.kind !== "oauth2-code") {
        return;
      }
      if (response.status !== 401 || refreshedOn401) {
        return;
      }
      refreshedOn401 = true;
      const credential = getManager().getCredential(type);
      if (credential?.tokens?.refreshToken !== undefined) {
        await refresh(type);
      }
    },
  });

  return client<T>(request, options);
}

export type { FetchResponse };
