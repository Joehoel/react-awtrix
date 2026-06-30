// React hooks for rendering data from a connected Credential on the clock.
// `useApiData` runs a fetcher (typically wrapping `authenticatedFetch`) keyed
// to a Credential Type, refetching whenever that Credential changes or on an
// optional interval, and reports lifecycle through `setAppStatus`. `useCredential`
// exposes the masked connection status so a component can render nothing until
// the Credential is connected.
import { useEffect, useState } from "react";
import { setAppStatus } from "./app-status.ts";
import { getManager, useCredentialVersion } from "./credentials/manager.ts";
import type { PublicCredential } from "./credentials/manager.ts";

export interface ApiDataStatus {
  state: "missing-credential" | "loading" | "ready" | "error";
  message?: string;
}

export interface ApiData<T> {
  data: T | undefined;
  status: ApiDataStatus;
}

export interface UseApiDataOptions {
  /** Refetch interval in milliseconds. Omit for a single fetch on connect. */
  intervalMs?: number;
  /** `setAppStatus` key for lifecycle reporting. Defaults to the Credential type. */
  appName?: string;
}

/**
 * The masked connection status for a Credential Type, sourced from the manager
 * singleton. Re-renders when the Credential changes. `undefined` when no
 * Credential exists for `type`.
 */
export function useCredential(type: string): PublicCredential | undefined {
  useCredentialVersion();
  return getManager()
    .listPublic()
    .find((credential) => credential.type === type);
}

/**
 * Fetch and refresh data for a Credential Type. The `fetcher` should call
 * `authenticatedFetch(type, ...)`; it is re-run whenever the Credential changes
 * (via the manager singleton version) and on the optional `intervalMs` cadence.
 * Lifecycle is mirrored into `setAppStatus(appName, ...)` (defaulting `appName`
 * to `type`) for the `missing-credential`, `loading`, and `error` states; the
 * fetcher owns the `ready` status so it can attach app-specific details. The
 * same lifecycle is returned as `{ data, status }`.
 */
export function useApiData<T>(
  type: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: UseApiDataOptions = {},
): ApiData<T> {
  const version = useCredentialVersion();
  const credential = getManager()
    .listPublic()
    .find((entry) => entry.type === type);
  const connected = credential?.connected ?? false;
  const { intervalMs, appName = type } = options;

  const [data, setData] = useState<T | undefined>(undefined);
  const [status, setStatus] = useState<ApiDataStatus>({ state: "missing-credential" });

  useEffect(() => {
    if (!connected) {
      setData(undefined);
      setStatus({ state: "missing-credential" });
      setAppStatus(appName, "missing-credential", `No ${type} credential connected.`);
      return;
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;

    async function refresh(): Promise<void> {
      try {
        setStatus({ state: "loading" });
        setAppStatus(appName, "loading", `Loading ${type} data.`);
        const result = await fetcher(controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        setData(result);
        setStatus({ state: "ready" });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setData(undefined);
        setStatus({ state: "error", message });
        setAppStatus(appName, "error", message);
      }
    }

    void refresh();
    if (intervalMs !== undefined) {
      timer = setInterval(() => void refresh(), intervalMs);
    }

    return () => {
      controller.abort();
      if (timer !== undefined) {
        clearInterval(timer);
      }
    };
    // `version` re-runs the effect when the Credential record changes (e.g. a
    // token refresh persisted by the runtime).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, connected, intervalMs, appName, version]);

  return { data, status };
}
