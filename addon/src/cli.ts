#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import { ofetch, FetchError } from "ofetch";
import open from "open";

/**
 * The `creds` CLI: the human/agent control plane for the addon's credential
 * subsystem. It talks to the addon over HTTP (the same JSON API a browser would
 * never see), authenticating with a bearer token. It never touches the
 * encrypted store directly — every write goes through the addon.
 *
 * Configuration comes entirely from the environment so the CLI stays
 * non-interactive and agent-friendly:
 *   REACT_AWTRIX_API        base URL of the addon API (default localhost:8099)
 *   REACT_AWTRIX_API_TOKEN  bearer token sent on every request
 * For the OAuth `connect` flow, client credentials are read from env by the
 * server (GITHUB_CLIENT_ID/SECRET, SPOTIFY_CLIENT_ID); the CLID forwards them in
 * the authorize call as a convenience for setups where the server can't see the
 * same env.
 */

const API_BASE = process.env.REACT_AWTRIX_API ?? "http://localhost:8099";
const API_TOKEN = process.env.REACT_AWTRIX_API_TOKEN;

/** Fixed loopback the OAuth apps redirect to; must match the server's REDIRECT_URI. */
const LOOPBACK_PORT = 8765;
const LOOPBACK_PATH = "/cb";

interface PublicField {
  name: string;
  displayName: string;
  secret: boolean;
  description?: string;
}

interface ApiKeyAuth {
  kind: "apiKey";
  inject: { in: "header" | "query"; name: string; template: string };
}

interface OAuthAuth {
  kind: "oauth2-code";
  provider: "github" | "spotify";
  scopes: string[];
  pkce: boolean;
}

interface PublicType {
  name: string;
  displayName: string;
  fields: PublicField[];
  auth: ApiKeyAuth | OAuthAuth;
  test?: { url: string };
}

interface PublicCredential {
  type: string;
  fields: Record<string, string>;
  secretFields: Record<string, string>;
  hasAuth: boolean;
  connected: boolean;
  updatedAt: string;
}

/** A typed HTTP client bound to the addon base URL and bearer token. */
const api = ofetch.create({
  baseURL: API_BASE,
  headers: API_TOKEN !== undefined ? { Authorization: `Bearer ${API_TOKEN}` } : {},
});

/** Print a structured error to stderr and exit non-zero. */
function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/** Normalize an ofetch error into a single-line message, surfacing the API's `{ error }` envelope. */
function describeError(error: unknown): string {
  if (error instanceof FetchError) {
    const data = error.data as { error?: string } | undefined;
    const detail = data?.error ?? error.message;
    const status = error.statusCode !== undefined ? ` (HTTP ${error.statusCode})` : "";
    return `${detail}${status}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Run an API call, converting any thrown error into a clean CLI failure. */
async function callApi<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    return fail(describeError(error));
  }
}

/** The env-var name a field reads from when `--field` is omitted, e.g. wakatime/apiKey -> WAKATIME_API_KEY. */
function fieldEnvName(type: string, fieldName: string): string {
  const snake = fieldName.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  return `${type}_${snake}`.toUpperCase();
}

/** Parse repeated `--field key=value` args (citty collapses a single one to a string). */
function parseFieldArgs(raw: string | string[] | undefined): Record<string, string> {
  const values = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const fields: Record<string, string> = {};
  for (const entry of values) {
    const eq = entry.indexOf("=");
    if (eq === -1) {
      fail(`Invalid --field "${entry}": expected key=value.`);
    }
    fields[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
  return fields;
}

const typesCommand = defineCommand({
  meta: { name: "types", description: "List the registered credential types." },
  args: {
    json: { type: "boolean", description: "Print machine-readable JSON.", default: false },
  },
  async run({ args }) {
    const types = await callApi(() => api<PublicType[]>("/api/types"));
    if (args.json) {
      process.stdout.write(`${JSON.stringify(types, null, 2)}\n`);
      return;
    }
    for (const type of types) {
      const auth =
        type.auth.kind === "apiKey"
          ? "apiKey"
          : `oauth2-code (${type.auth.provider}${type.auth.pkce ? ", pkce" : ""})`;
      process.stdout.write(`${type.name}  —  ${type.displayName}  [${auth}]\n`);
      for (const field of type.fields) {
        const tag = field.secret ? " (secret)" : "";
        const desc = field.description !== undefined ? `  ${field.description}` : "";
        process.stdout.write(`    ${field.name}${tag}${desc}\n`);
      }
    }
  },
});

const listCommand = defineCommand({
  meta: { name: "list", description: "List stored credentials (masked)." },
  args: {
    json: { type: "boolean", description: "Print machine-readable JSON.", default: false },
  },
  async run({ args }) {
    const credentials = await callApi(() => api<PublicCredential[]>("/api/credentials"));
    if (args.json) {
      process.stdout.write(`${JSON.stringify(credentials, null, 2)}\n`);
      return;
    }
    if (credentials.length === 0) {
      process.stdout.write("No credentials stored.\n");
      return;
    }
    for (const credential of credentials) {
      const status = credential.connected
        ? "connected"
        : credential.hasAuth
          ? "configured"
          : "empty";
      process.stdout.write(`${credential.type}  [${status}]  updated ${credential.updatedAt}\n`);
      for (const [name, last4] of Object.entries(credential.secretFields)) {
        process.stdout.write(`    ${name}: ••••${last4}\n`);
      }
      for (const [name, value] of Object.entries(credential.fields)) {
        process.stdout.write(`    ${name}: ${value}\n`);
      }
    }
  },
});

const addCommand = defineCommand({
  meta: {
    name: "add",
    description: "Set fields for an apiKey credential (reads missing secrets from env).",
  },
  args: {
    type: { type: "positional", required: true, description: "Credential type (e.g. wakatime)." },
    field: {
      type: "string",
      description: "Field as key=value. Repeatable.",
      alias: "f",
    },
    json: { type: "boolean", description: "Print machine-readable JSON.", default: false },
  },
  async run({ args }) {
    const type = args.type;
    const descriptor = (await callApi(() => api<PublicType[]>("/api/types"))).find(
      (entry) => entry.name === type,
    );
    if (descriptor === undefined) {
      fail(`Unknown credential type "${type}".`);
    }
    if (descriptor.auth.kind !== "apiKey") {
      fail(`Credential type "${type}" uses ${descriptor.auth.kind}; run \`creds connect ${type}\`.`);
    }

    const fields = parseFieldArgs(args.field as string | string[] | undefined);

    // Fill any unset field from its conventional env var, e.g. WAKATIME_API_KEY.
    for (const field of descriptor.fields) {
      if (fields[field.name] !== undefined) {
        continue;
      }
      const envName = fieldEnvName(type, field.name);
      const fromEnv = process.env[envName];
      if (fromEnv !== undefined && fromEnv.length > 0) {
        fields[field.name] = fromEnv;
      }
    }

    if (Object.keys(fields).length === 0) {
      fail(
        `No fields provided for "${type}". Pass --field key=value or set ${descriptor.fields
          .map((field) => fieldEnvName(type, field.name))
          .join(", ")}.`,
      );
    }

    const credential = await callApi(() =>
      api<PublicCredential>(`/api/credentials/${encodeURIComponent(type)}`, {
        method: "POST",
        body: { fields },
      }),
    );

    if (args.json) {
      process.stdout.write(`${JSON.stringify(credential, null, 2)}\n`);
      return;
    }
    process.stdout.write(`Stored ${type}.\n`);
  },
});

interface CallbackResult {
  code: string;
  state: string;
}

/**
 * Stand up a transient loopback listener on 127.0.0.1:8765 and resolve with the
 * first OAuth redirect that hits `/cb`. The browser is sent a tiny HTML page so
 * the human knows they can close the tab. Times out so the CLI never hangs.
 */
function waitForCallback(timeoutMs = 300_000): {
  promise: Promise<CallbackResult>;
  close: () => void;
} {
  let server: ReturnType<typeof Bun.serve> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const close = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    server?.stop(true);
    server = undefined;
  };

  const promise = new Promise<CallbackResult>((resolve, reject) => {
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: LOOPBACK_PORT,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname !== LOOPBACK_PATH) {
          return new Response("Not found", { status: 404 });
        }
        const error = url.searchParams.get("error");
        if (error !== null) {
          const description = url.searchParams.get("error_description") ?? error;
          reject(new Error(`Authorization failed: ${description}`));
          return new Response(`Authorization failed: ${description}`, { status: 400 });
        }
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (code === null || state === null) {
          reject(new Error("Callback was missing `code` or `state`."));
          return new Response("Missing code or state.", { status: 400 });
        }
        resolve({ code, state });
        return new Response(
          "<!doctype html><meta charset=utf-8><title>Connected</title>" +
            "<p>Authorization complete. You can close this tab and return to the terminal.</p>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      },
    });

    timer = setTimeout(() => {
      reject(new Error("Timed out waiting for the OAuth redirect."));
    }, timeoutMs);
  });

  return { promise, close };
}

/** Collect provider client credentials from env to forward in the authorize call. */
function oauthClientEnv(provider: "github" | "spotify"): Record<string, string> {
  const env: Record<string, string> = {};
  if (provider === "github") {
    if (process.env.GITHUB_CLIENT_ID) env.clientId = process.env.GITHUB_CLIENT_ID;
    if (process.env.GITHUB_CLIENT_SECRET) env.clientSecret = process.env.GITHUB_CLIENT_SECRET;
  } else {
    if (process.env.SPOTIFY_CLIENT_ID) env.clientId = process.env.SPOTIFY_CLIENT_ID;
  }
  return env;
}

const connectCommand = defineCommand({
  meta: {
    name: "connect",
    description: "Run an OAuth credential's connect flow via a loopback redirect.",
  },
  args: {
    type: {
      type: "positional",
      required: true,
      description: "OAuth credential type (e.g. github, spotify).",
    },
    json: { type: "boolean", description: "Print machine-readable JSON.", default: false },
  },
  async run({ args }) {
    const type = args.type;
    const descriptor = (await callApi(() => api<PublicType[]>("/api/types"))).find(
      (entry) => entry.name === type,
    );
    if (descriptor === undefined) {
      fail(`Unknown credential type "${type}".`);
    }
    if (descriptor.auth.kind !== "oauth2-code") {
      fail(`Credential type "${type}" uses ${descriptor.auth.kind}; run \`creds add ${type}\`.`);
    }

    // Begin the listener before opening the browser so we never miss the redirect.
    const listener = waitForCallback();
    try {
      const { authUrl } = await callApi(() =>
        api<{ authUrl: string; state: string }>(
          `/api/credentials/${encodeURIComponent(type)}/authorize`,
          {
            method: "POST",
            body: oauthClientEnv((descriptor.auth as OAuthAuth).provider),
          },
        ),
      );

      process.stdout.write(
        `Open this URL to authorize ${descriptor.displayName} (one approval step):\n  ${authUrl}\n`,
      );
      try {
        await open(authUrl);
      } catch {
        process.stdout.write("(Could not auto-open a browser; copy the URL above.)\n");
      }

      const { code, state } = await listener.promise;

      const result = await callApi(() =>
        api<{ connected: boolean; credential: PublicCredential | null }>(
          `/api/credentials/${encodeURIComponent(type)}/callback`,
          { method: "POST", body: { code, state } },
        ),
      );

      if (args.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else if (result.connected) {
        process.stdout.write(`Connected ${type}.\n`);
      } else {
        fail(`Connect flow for "${type}" did not produce tokens.`);
      }
    } finally {
      listener.close();
    }
  },
});

const testCommand = defineCommand({
  meta: { name: "test", description: "Run a credential's validation request." },
  args: {
    type: { type: "positional", required: true, description: "Credential type to test." },
    json: { type: "boolean", description: "Print machine-readable JSON.", default: false },
  },
  async run({ args }) {
    const type = args.type;
    const result = await callApi(() =>
      api<{ ok: boolean; status: number | null; error?: string }>(
        `/api/credentials/${encodeURIComponent(type)}/test`,
        { method: "POST" },
      ),
    );
    if (args.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (!result.ok) process.exit(1);
      return;
    }
    if (result.ok) {
      process.stdout.write(`${type}: OK (HTTP ${result.status}).\n`);
    } else {
      fail(`${type}: FAILED${result.status !== null ? ` (HTTP ${result.status})` : ""}: ${result.error ?? "unknown error"}`);
    }
  },
});

const rmCommand = defineCommand({
  meta: { name: "rm", description: "Delete a stored credential." },
  args: {
    type: { type: "positional", required: true, description: "Credential type to delete." },
    json: { type: "boolean", description: "Print machine-readable JSON.", default: false },
  },
  async run({ args }) {
    const type = args.type;
    const result = await callApi(() =>
      api<{ ok: boolean }>(`/api/credentials/${encodeURIComponent(type)}`, { method: "DELETE" }),
    );
    if (args.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    process.stdout.write(`Deleted ${type}.\n`);
  },
});

const main = defineCommand({
  meta: {
    name: "creds",
    description: "Manage react-awtrix credentials via the addon control-plane API.",
  },
  subCommands: {
    types: typesCommand,
    list: listCommand,
    add: addCommand,
    connect: connectCommand,
    test: testCommand,
    rm: rmCommand,
  },
});

runMain(main);
