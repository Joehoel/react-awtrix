// Home Assistant binding for react-awtrix.
//
// Running as an add-on with `homeassistant_api: true`, the Supervisor injects a
// SUPERVISOR_TOKEN and exposes an internal proxy to Core. We connect to
// ws://supervisor/core/websocket with that token: no long-lived token to
// generate, nothing exposed on the network.
import { useSyncExternalStore } from "react";
import {
  callService,
  createConnection,
  createLongLivedTokenAuth,
  subscribeEntities,
} from "home-assistant-js-websocket";
import type { Auth, Connection, HassEntities, HassEntity } from "home-assistant-js-websocket";

let entities: HassEntities = {};
let connection: Connection | undefined;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function resolveAuth(): Auth {
  // As an add-on (homeassistant_api: true), the Supervisor injects
  // SUPERVISOR_TOKEN and proxies Core internally — no token to manage.
  const supervisorToken = process.env.SUPERVISOR_TOKEN;
  if (supervisorToken !== undefined) {
    // Duck-typed Auth: the client only needs wsUrl + accessToken for the proxy.
    return {
      wsUrl: "ws://supervisor/core/websocket",
      accessToken: supervisorToken,
      expired: false,
      async refreshAccessToken() {},
    } as unknown as Auth;
  }

  // Local dev: long-lived token against a reachable HA instance.
  const url = process.env.HASS_URL;
  const token = process.env.HASS_TOKEN;
  if (url !== undefined && token !== undefined) {
    return createLongLivedTokenAuth(url, token);
  }

  throw new Error(
    "No Home Assistant credentials. As an add-on, set `homeassistant_api: true` " +
      "(SUPERVISOR_TOKEN is injected). For local dev, set HASS_URL and HASS_TOKEN.",
  );
}

async function connect(): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      connection = await createConnection({ auth: resolveAuth() });
      subscribeEntities(connection, (next) => {
        entities = next;
        emit();
      });
      console.log("[ha] connected to Home Assistant");
      return;
    } catch (error) {
      const delay = Math.min(30_000, attempt * 2_000);
      console.error(`[ha] connect failed (attempt ${attempt}), retrying in ${delay}ms`, error);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// Start connecting as soon as this module is imported. The client auto-reconnects
// after the first successful connection; this loop only covers initial startup.
void connect();

/** Subscribe a component to a single Home Assistant entity's live state. */
export function useEntity(entityId: string): HassEntity | undefined {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => entities[entityId],
  );
}

/** Call a Home Assistant service (e.g. from an AWTRIX button handler). */
export async function callHassService(
  domain: string,
  service: string,
  serviceData?: object,
  target?: Parameters<typeof callService>[4],
): Promise<unknown> {
  if (connection === undefined) {
    throw new Error("[ha] not connected to Home Assistant yet");
  }

  return callService(connection, domain, service, serviceData, target);
}
