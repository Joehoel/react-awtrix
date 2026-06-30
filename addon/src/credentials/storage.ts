import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Minted auth tokens for an `oauth2-code` Credential. `expiresAt` is epoch
 * milliseconds; absent for tokens that don't expire.
 */
export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

/**
 * One connected integration's complete state — all its config fields and any
 * minted tokens — held in a single record, keyed by credential type. At most
 * one record exists per type.
 */
export interface StoredCredential {
  type: string;
  fields: Record<string, string>;
  tokens?: StoredTokens;
  updatedAt: string;
}

export interface CredentialState {
  version: 1;
  credentials: StoredCredential[];
}

interface EncryptedFile {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

const emptyState = (): CredentialState => ({ version: 1, credentials: [] });

function resolveStorageDir(): string {
  if (process.env.SUPERVISOR_TOKEN !== undefined || existsSync("/data/options.json")) {
    return "/data";
  }

  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", ".react-awtrix");
}

async function readOrCreateKey(keyPath: string): Promise<Buffer> {
  try {
    return Buffer.from((await readFile(keyPath, "utf8")).trim(), "base64");
  } catch {
    const key = randomBytes(32);
    await writeFile(keyPath, key.toString("base64"), { mode: 0o600 });
    return key;
  }
}

function encryptState(state: CredentialState, key: Buffer): EncryptedFile {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(state), "utf8"),
    cipher.final(),
  ]);

  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptState(file: EncryptedFile, key: Buffer): CredentialState {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(file.iv, "base64"));
  decipher.setAuthTag(Buffer.from(file.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(file.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(plaintext) as CredentialState;
}

export class CredentialStorage {
  private readonly dir = resolveStorageDir();
  private readonly statePath = join(this.dir, "credentials.json");
  private readonly keyPath = join(this.dir, "credentials.key");

  get storageDir(): string {
    return this.dir;
  }

  async load(): Promise<CredentialState> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const key = await readOrCreateKey(this.keyPath);

    try {
      const encrypted = JSON.parse(await readFile(this.statePath, "utf8")) as EncryptedFile;
      return decryptState(encrypted, key);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return emptyState();
      }

      throw error;
    }
  }

  async save(state: CredentialState): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const key = await readOrCreateKey(this.keyPath);
    await writeFile(this.statePath, JSON.stringify(encryptState(state, key)), { mode: 0o600 });
  }
}
