import { timingSafeEqual } from "node:crypto";
import { getAppStatuses } from "./app-status.ts";
import { authenticatedFetch } from "./credentials/auth.ts";
import { getManager } from "./credentials/manager.ts";
import { authorize, handleCallback } from "./credentials/oauth.ts";
import { getCredentialType, listCredentialTypes } from "./credentials/registry.ts";
import type { CredentialType, Field } from "./credentials/registry.ts";

/**
 * The control-plane HTTP API: a JSON-only Bun.serve fronting the credential
 * manager singleton and the registry. Every `/api/*` request must carry
 * `Authorization: Bearer <REACT_AWTRIX_API_TOKEN>`; the `creds` CLI is the only
 * intended client. No HTML, no static assets, no web UI (see ADR 0002).
 */

function json(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Expected a JSON request body.");
  }
}

/** Constant-time string comparison that tolerates differing lengths. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    // Still run a comparison to keep timing roughly uniform, then fail.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/** The server handle Bun passes to `fetch`; `Bun.Server` is generic over its websocket data. */
type ServeServer = Bun.Server<undefined>;

function isLocalhost(request: Request, server: ServeServer): boolean {
  const address = server.requestIP(request)?.address;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

let warnedNoToken = false;

/**
 * Gate every `/api/*` request behind the bearer token. When the token env is
 * unset we allow localhost-only access (dev convenience) and warn once;
 * otherwise the request is rejected with 401.
 */
function authorizeRequest(request: Request, server: ServeServer): Response | null {
  const expected = process.env.REACT_AWTRIX_API_TOKEN;

  if (expected === undefined || expected.length === 0) {
    if (isLocalhost(request, server)) {
      if (!warnedNoToken) {
        warnedNoToken = true;
        console.warn(
          "[react-awtrix] REACT_AWTRIX_API_TOKEN is unset; allowing unauthenticated localhost access (dev only).",
        );
      }
      return null;
    }
    return json({ error: "Unauthorized." }, { status: 401 });
  }

  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match === null || !safeEqual(match[1]!, expected)) {
    return json({ error: "Unauthorized." }, { status: 401 });
  }

  return null;
}

/** A JSON-serializable view of a Field (drops the arktype validator object). */
function publicField(field: Field): {
  name: string;
  displayName: string;
  secret: boolean;
  description?: string;
} {
  return {
    name: field.name,
    displayName: field.displayName,
    secret: field.secret === true,
    description: field.description,
  };
}

/** Declarative, JSON-safe description of a Credential Type for the CLI. */
function publicType(credentialType: CredentialType): unknown {
  return {
    name: credentialType.name,
    displayName: credentialType.displayName,
    fields: credentialType.fields.map(publicField),
    auth:
      credentialType.auth.kind === "apiKey"
        ? { kind: "apiKey", inject: credentialType.auth.inject }
        : {
            kind: "oauth2-code",
            provider: credentialType.auth.provider,
            scopes: credentialType.auth.scopes,
            pkce: credentialType.auth.pkce,
          },
    test: credentialType.test,
  };
}

async function handleApi(request: Request, pathname: string): Promise<Response> {
  const manager = getManager();

  // GET /api/types -> declarative registry info.
  if (request.method === "GET" && pathname === "/api/types") {
    return json(listCredentialTypes().map(publicType));
  }

  // GET /api/credentials -> masked credential views.
  if (request.method === "GET" && pathname === "/api/credentials") {
    return json(manager.listPublic());
  }

  // GET /api/status -> masked credentials + app statuses.
  if (request.method === "GET" && pathname === "/api/status") {
    return json({
      credentials: manager.listPublic(),
      apps: getAppStatuses(),
    });
  }

  const typeMatch = pathname.match(/^\/api\/credentials\/([^/]+)(\/authorize|\/callback|\/test)?$/);
  if (typeMatch !== null) {
    const type = typeMatch[1]!;
    const action = typeMatch[2];
    const credentialType = getCredentialType(type);
    if (credentialType === undefined) {
      return json({ error: `Unknown credential type "${type}".` }, { status: 404 });
    }

    // POST /api/credentials/:type -> set apiKey-style fields.
    if (action === undefined && request.method === "POST") {
      if (credentialType.auth.kind !== "apiKey") {
        return json(
          { error: `Credential type "${type}" uses oauth2-code; use /authorize and /callback.` },
          { status: 400 },
        );
      }
      const body = await readJsonBody<{ fields?: Record<string, string> }>(request);
      if (body.fields === undefined || typeof body.fields !== "object") {
        return json({ error: "Expected a JSON body with a `fields` object." }, { status: 400 });
      }
      await manager.upsertCredential(type, { fields: body.fields });
      return json(manager.listPublic().find((credential) => credential.type === type) ?? null);
    }

    // DELETE /api/credentials/:type -> delete the Credential.
    if (action === undefined && request.method === "DELETE") {
      const deleted = await manager.deleteCredential(type);
      return deleted ? json({ ok: true }) : json({ error: "Credential not found." }, { status: 404 });
    }

    // POST /api/credentials/:type/test -> run the descriptor's test request.
    if (action === "/test" && request.method === "POST") {
      if (credentialType.test === undefined) {
        return json({ error: `Credential type "${type}" has no test request.` }, { status: 400 });
      }
      try {
        await authenticatedFetch(type, credentialType.test.url);
        return json({ ok: true, status: 200 });
      } catch (error) {
        const status =
          error !== null && typeof error === "object" && "statusCode" in error
            ? Number((error as { statusCode?: unknown }).statusCode)
            : undefined;
        const message = error instanceof Error ? error.message : String(error);
        return json({ ok: false, status: status ?? null, error: message });
      }
    }

    // POST /api/credentials/:type/authorize -> begin OAuth connect flow.
    if (action === "/authorize" && request.method === "POST") {
      if (credentialType.auth.kind !== "oauth2-code") {
        return json(
          { error: `Credential type "${type}" does not use oauth2-code.` },
          { status: 400 },
        );
      }
      // Persist any client credentials the CLI forwarded so a deployed addon can
      // be provisioned from the laptop without the creds in its own env (Q7).
      const body = await readJsonBody<{ clientId?: string; clientSecret?: string }>(request).catch(
        () => ({}) as { clientId?: string; clientSecret?: string },
      );
      const fields: Record<string, string> = {};
      if (typeof body.clientId === "string" && body.clientId.length > 0) {
        fields.clientId = body.clientId;
      }
      if (typeof body.clientSecret === "string" && body.clientSecret.length > 0) {
        fields.clientSecret = body.clientSecret;
      }
      if (Object.keys(fields).length > 0) {
        await manager.upsertCredential(type, { fields });
      }
      const { authUrl, state } = authorize(type);
      return json({ authUrl, state });
    }

    // POST /api/credentials/:type/callback -> complete OAuth connect flow.
    if (action === "/callback" && request.method === "POST") {
      if (credentialType.auth.kind !== "oauth2-code") {
        return json(
          { error: `Credential type "${type}" does not use oauth2-code.` },
          { status: 400 },
        );
      }
      const body = await readJsonBody<{ code?: string; state?: string }>(request);
      if (typeof body.code !== "string" || typeof body.state !== "string") {
        return json({ error: "Expected a JSON body with `code` and `state`." }, { status: 400 });
      }
      await handleCallback(type, body.code, body.state);
      const credential = manager.listPublic().find((entry) => entry.type === type);
      return json({ connected: credential?.connected === true, credential: credential ?? null });
    }
  }

  return json({ error: "Not found." }, { status: 404 });
}

export function startWebServer(): ReturnType<typeof Bun.serve> {
  const port = Number(process.env.REACT_AWTRIX_PORT ?? 8099);
  const server = Bun.serve({
    hostname: "0.0.0.0",
    port,
    async fetch(request, server) {
      const url = new URL(request.url);

      if (!url.pathname.startsWith("/api/")) {
        return json({ error: "Not found." }, { status: 404 });
      }

      const unauthorized = authorizeRequest(request, server);
      if (unauthorized !== null) {
        return unauthorized;
      }

      try {
        return await handleApi(request, url.pathname);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return json({ error: message }, { status: 500 });
      }
    },
  });

  console.log(`[react-awtrix] credential control-plane API listening on http://localhost:${server.port ?? port}/`);
  return server;
}
