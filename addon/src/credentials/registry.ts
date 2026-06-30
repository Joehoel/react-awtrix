import type { Type } from "arktype";

/**
 * A single user-supplied input on a Credential Type (e.g. an API key, a client
 * id, a client secret). The `schema` is an arktype validator describing the
 * field's value; `secret` marks it write-only and masked in API responses.
 */
export interface Field {
  /** Stable key used in the stored `fields` record and injection templates. */
  name: string;
  /** Human-facing label shown by the CLI. */
  displayName: string;
  /** arktype validator for this field's value (typically a `type("string")`). */
  schema: Type;
  /** Write-only: masked to `valueLast4` in responses, never returned in full. */
  secret?: boolean;
  /** Optional CLI hint describing the expected value. */
  description?: string;
}

/**
 * Static-injection auth: a stored field is attached to every outgoing request
 * as a header or query parameter, expanded from a template (see below).
 */
export interface ApiKeyAuthSpec {
  kind: "apiKey";
  inject: {
    in: "header" | "query";
    /** Header or query-parameter name, e.g. `Authorization`. */
    name: string;
    /**
     * Injection mini-language. Supports ONLY `{{field}}` and
     * `{{base64(field)}}`, e.g. `Bearer {{apiKey}}`.
     */
    template: string;
  };
}

/**
 * OAuth 2.0 Authorization Code auth via arctic. GitHub is a confidential client
 * (client_id + client_secret); Spotify is a public client with PKCE (client_id,
 * no secret). Token exchange happens server-side; the CLI only relays the code.
 */
export interface OAuth2CodeAuthSpec {
  kind: "oauth2-code";
  provider: "github" | "spotify";
  scopes: string[];
  /** Public clients (Spotify) use PKCE; confidential clients (GitHub) do not. */
  pkce: boolean;
}

export type AuthSpec = ApiKeyAuthSpec | OAuth2CodeAuthSpec;

/**
 * The declarative description of a service: its input fields, how it
 * authenticates, and an optional validation request. Data, not code.
 */
export interface CredentialType {
  /** Stable machine name and storage key (one Credential per type). */
  name: string;
  /** Human-facing name shown by the CLI. */
  displayName: string;
  /** Inputs the user supplies when connecting. */
  fields: Field[];
  /** The single auth method this type uses. */
  auth: AuthSpec;
  /** Optional request used to validate a freshly connected Credential. */
  test?: { url: string };
}

const registry = new Map<string, CredentialType>();

/** Register a Credential Type. Throws on duplicate name. */
export function registerCredentialType(credentialType: CredentialType): void {
  if (registry.has(credentialType.name)) {
    throw new Error(`Credential type "${credentialType.name}" is already registered.`);
  }
  registry.set(credentialType.name, credentialType);
}

/** Look up a Credential Type by name, or `undefined` if not registered. */
export function getCredentialType(name: string): CredentialType | undefined {
  return registry.get(name);
}

/** All registered Credential Types, in registration order. */
export function listCredentialTypes(): CredentialType[] {
  return [...registry.values()];
}
