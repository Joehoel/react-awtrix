import { useSyncExternalStore } from "react";
import { CredentialStorage } from "./storage.ts";
import type { CredentialState, StoredCredential, StoredTokens } from "./storage.ts";
import { getCredentialType } from "./registry.ts";

/**
 * A masked, secret-free view of a stored Credential, safe to return from the
 * API. Secret fields are reduced to their last 4 characters; tokens are never
 * exposed, only `connected`.
 */
export interface PublicCredential {
  type: string;
  /** Non-secret field values, verbatim. */
  fields: Record<string, string>;
  /** Secret field names mapped to the last 4 chars of their value. */
  secretFields: Record<string, string>;
  /** Whether any field value is present at all. */
  hasAuth: boolean;
  /** Whether an access token has been minted (oauth2-code types). */
  connected: boolean;
  updatedAt: string;
}

/**
 * Partial write for `upsertCredential`. `fields` is merged into any existing
 * record; `tokens` replaces the stored tokens when provided.
 */
export interface CredentialUpsert {
  fields?: Record<string, string>;
  tokens?: StoredTokens;
}

function now(): string {
  return new Date().toISOString();
}

function toPublic(credential: StoredCredential): PublicCredential {
  const credentialType = getCredentialType(credential.type);
  const secretNames = new Set(
    (credentialType?.fields ?? []).filter((field) => field.secret).map((field) => field.name),
  );

  const fields: Record<string, string> = {};
  const secretFields: Record<string, string> = {};
  for (const [name, value] of Object.entries(credential.fields)) {
    if (secretNames.has(name)) {
      secretFields[name] = value.slice(-4);
    } else {
      fields[name] = value;
    }
  }

  return {
    type: credential.type,
    fields,
    secretFields,
    hasAuth: Object.keys(credential.fields).length > 0,
    connected: credential.tokens?.accessToken !== undefined,
    updatedAt: credential.updatedAt,
  };
}

/**
 * Owns the in-memory credential state and persistence. A module-level singleton
 * (see {@link initManager}/{@link getManager}) so `authenticatedFetch` and React
 * hooks reach it without prop-drilling.
 */
export class CredentialManager {
  private state: CredentialState = { version: 1, credentials: [] };
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(private readonly storage = new CredentialStorage()) {}

  async init(): Promise<void> {
    this.state = await this.storage.load();
    console.log(`[credentials] using encrypted storage at ${this.storage.storageDir}`);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): number {
    return this.version;
  }

  /** The raw stored Credential for a type, including secrets and tokens. */
  getCredential(type: string): StoredCredential | undefined {
    return this.state.credentials.find((credential) => credential.type === type);
  }

  /** Masked, secret-free views of every stored Credential. */
  listPublic(): PublicCredential[] {
    return this.state.credentials.map(toPublic);
  }

  /**
   * Create or update the single Credential for `type`, merging `fields` and
   * replacing `tokens` when provided. Persists and notifies subscribers.
   */
  async upsertCredential(type: string, partial: CredentialUpsert): Promise<StoredCredential> {
    const existing = this.getCredential(type);
    const timestamp = now();

    if (existing === undefined) {
      const credential: StoredCredential = {
        type,
        fields: { ...partial.fields },
        tokens: partial.tokens,
        updatedAt: timestamp,
      };
      this.state.credentials.push(credential);
      await this.persist();
      return credential;
    }

    existing.fields = { ...existing.fields, ...partial.fields };
    if (partial.tokens !== undefined) {
      existing.tokens = partial.tokens;
    }
    existing.updatedAt = timestamp;
    await this.persist();
    return existing;
  }

  /** Remove the Credential for `type`. Returns whether one existed. */
  async deleteCredential(type: string): Promise<boolean> {
    const before = this.state.credentials.length;
    this.state.credentials = this.state.credentials.filter(
      (credential) => credential.type !== type,
    );
    if (this.state.credentials.length === before) {
      return false;
    }

    await this.persist();
    return true;
  }

  private async persist(): Promise<void> {
    await this.storage.save(this.state);
    this.version += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

let singleton: CredentialManager | undefined;

/** Initialize and load the module-level CredentialManager singleton. */
export async function initManager(storage?: CredentialStorage): Promise<CredentialManager> {
  const manager = new CredentialManager(storage);
  await manager.init();
  singleton = manager;
  return manager;
}

/** The initialized singleton. Throws if {@link initManager} hasn't run. */
export function getManager(): CredentialManager {
  if (singleton === undefined) {
    throw new Error("CredentialManager not initialized; call initManager() at boot.");
  }
  return singleton;
}

/** React hook: re-renders when the singleton's credential state changes. */
export function useCredentialVersion(): number {
  const manager = getManager();
  return useSyncExternalStore(
    (onChange) => manager.subscribe(onChange),
    () => manager.getSnapshot(),
  );
}
