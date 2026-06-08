// Home Assistant binding for react-awtrix.
//
// Running as an add-on with `homeassistant_api: true`, the Supervisor injects a
// SUPERVISOR_TOKEN and exposes an internal proxy to Core. We connect to
// ws://supervisor/core/websocket with that token: no long-lived token to
// generate, nothing exposed on the network.
import { useSyncExternalStore } from "react";
import { callService, createConnection, subscribeEntities } from "home-assistant-js-websocket";
import type { Auth, Connection, HassEntities, HassEntity } from "home-assistant-js-websocket";

let entities: HassEntities = {};
let connection: Connection | undefined;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function supervisorAuth(): Auth {
  const token = process.env.SUPERVISOR_TOKEN;
  if (token === undefined) {
    throw new Error(
      "SUPERVISOR_TOKEN is missing. Set `homeassistant_api: true` in config.yaml, " +
        "or run locally with HASS_URL/HASS_TOKEN and swap this for createLongLivedTokenAuth.",
    );
  }

  // Duck-typed Auth: the client only needs wsUrl + accessToken to dial the proxy.
  return {
    wsUrl: "ws://supervisor/core/websocket",
    accessToken: token,
    expired: false,
    async refreshAccessToken() {},
  } as unknown as Auth;
}

async function connect(): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      connection = await createConnection({ auth: supervisorAuth() });
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
