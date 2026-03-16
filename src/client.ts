/**
 * HTTP client for the Awtrix 3 API.
 * All methods throw on non-ok responses.
 */

import type { AwtrixPayload } from "./types.ts";

function url(host: string, port: number, path: string): string {
  return `http://${host}:${port}${path}`;
}

export async function pushApp(
  host: string,
  port: number,
  name: string,
  payload: AwtrixPayload,
): Promise<void> {
  const res = await fetch(url(host, port, `/api/custom?name=${name}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`[react-awtrix] Failed to push app "${name}": ${res.status} ${res.statusText}`);
  }
}

export async function deleteApp(host: string, port: number, name: string): Promise<void> {
  const res = await fetch(url(host, port, `/api/custom?name=${name}`), {
    method: "DELETE",
  });

  if (!res.ok) {
    throw new Error(
      `[react-awtrix] Failed to delete app "${name}": ${res.status} ${res.statusText}`,
    );
  }
}

export async function pushNotify(
  host: string,
  port: number,
  payload: AwtrixPayload,
): Promise<void> {
  const res = await fetch(url(host, port, "/api/notify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`[react-awtrix] Failed to push notification: ${res.status} ${res.statusText}`);
  }
}
