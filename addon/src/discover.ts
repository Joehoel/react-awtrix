import { readFileSync } from "node:fs";
import { mqtt, http } from "react-awtrix";
import type { AwtrixProtocol } from "react-awtrix";
import { getConnection } from "./ha.tsx";

interface MqttBrokerConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  ssl: boolean;
}

interface AwtrixDevice {
  id: string;
  name: string;
  mqttPrefix: string;
  swVersion: string | null;
  configurationUrl: string | null;
}

interface DeviceRegistryEntry {
  id: string;
  identifiers: [string, string][];
  manufacturer: string | null;
  model: string | null;
  name: string | null;
  sw_version: string | null;
  configuration_url: string | null;
}

interface EntityRegistryEntry {
  device_id: string;
  entity_id: string;
  unique_id: string;
  original_name: string | null;
  platform: string;
}

interface EntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

interface AddonOptions {
  awtrix_host?: string;
  awtrix_mqtt_prefix?: string;
  mqtt_host?: string;
  mqtt_port?: number;
  mqtt_username?: string;
  mqtt_password?: string;
}

function readOptions(): AddonOptions {
  try {
    return JSON.parse(readFileSync("/data/options.json", "utf8")) as AddonOptions;
  } catch {
    return {};
  }
}

async function getMqttBrokerConfig(): Promise<MqttBrokerConfig | null> {
  const token = process.env.SUPERVISOR_TOKEN;
  if (token === undefined) {
    return null;
  }

  try {
    const response = await fetch("http://supervisor/services/mqtt", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      let body = "";
      try {
        body = await response.text();
      } catch {}
      console.warn(
        `[discover] MQTT service responded with ${response.status}: ${body || "(empty body)"}`,
      );
      return null;
    }

    const body = (await response.json()) as {
      result: string;
      data?: {
        host?: string;
        port?: number;
        username?: string;
        password?: string;
        ssl?: boolean;
      };
    };

    if (body.result !== "ok" || body.data === undefined) {
      return null;
    }

    const { host, port, username, password, ssl } = body.data;

    return {
      host: host ?? "localhost",
      port: port ?? 1883,
      username: username ?? "",
      password: password ?? "",
      ssl: ssl ?? false,
    };
  } catch (error) {
    console.warn("[discover] Failed to fetch MQTT service config:", error);
    return null;
  }
}

async function discoverAwtrixDevices(): Promise<AwtrixDevice[]> {
  const connection = await getConnection();

  const devices = await connection.sendMessagePromise<DeviceRegistryEntry[]>({
    type: "config/device_registry/list",
  });

  const awtrixDevices = devices.filter((device) => device.manufacturer === "Blueforcer");

  if (awtrixDevices.length === 0) {
    return [];
  }

  // Get entity registry to find the "ID" sensor for each AWTRIX device.
  // The ID sensor's state contains the actual MQTT prefix.
  const entities = await connection.sendMessagePromise<EntityRegistryEntry[]>({
    type: "config/entity_registry/list",
  });

  // Get all entity states to read the ID sensor value.
  const states = await connection.sendMessagePromise<EntityState[]>({
    type: "get_states",
  });

  const result: AwtrixDevice[] = [];

  for (const device of awtrixDevices) {
    // Find the ID sensor entity for this device (unique_id ends with "_id").
    const idEntity = entities.find(
      (entity) =>
        entity.device_id === device.id &&
        entity.platform === "mqtt" &&
        entity.unique_id.endsWith("_id"),
    );

    let mqttPrefix = device.name ?? "awtrix";

    if (idEntity !== undefined) {
      // The ID sensor's state is the actual MQTT prefix.
      const state = states.find((s) => s.entity_id === idEntity.entity_id);
      if (state !== undefined && state.state !== "" && state.state !== "unknown") {
        mqttPrefix = state.state;
      }
    }

    result.push({
      id: device.id,
      name: device.name ?? "unknown",
      mqttPrefix,
      swVersion: device.sw_version,
      configurationUrl: device.configuration_url,
    });
  }

  return result;
}

function buildBrokerUrl(config: MqttBrokerConfig): string {
  const protocol = config.ssl ? "mqtts" : "mqtt";
  const auth =
    config.username !== ""
      ? `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@`
      : "";

  return `${protocol}://${auth}${config.host}:${config.port}`;
}

/**
 * Try to get MQTT broker config from direct addon options (mqtt_host, etc.).
 * Returns null if mqtt_host is not configured.
 */
function getDirectMqttConfig(options: AddonOptions): MqttBrokerConfig | null {
  const host = options.mqtt_host || undefined;
  if (host === undefined) {
    return null;
  }

  return {
    host,
    port: options.mqtt_port ?? 1883,
    username: options.mqtt_username ?? "",
    password: options.mqtt_password ?? "",
    ssl: false,
  };
}

export async function resolveProtocol(): Promise<AwtrixProtocol> {
  // 0. Direct MQTT env vars — fastest path for local dev.
  //    Set AWTRIX_MQTT_BROKER + AWTRIX_MQTT_PREFIX to skip all HA/Supervisor logic.
  const envBroker = process.env.AWTRIX_MQTT_BROKER;
  const envPrefix = process.env.AWTRIX_MQTT_PREFIX;
  if (envBroker !== undefined && envPrefix !== undefined) {
    console.log(`[discover] Using env MQTT: broker=${envBroker}, prefix=${envPrefix}`);
    return mqtt({ broker: envBroker, prefix: envPrefix });
  }

  const options = readOptions();
  const explicitPrefix = options.awtrix_mqtt_prefix || undefined;
  const explicitHost = options.awtrix_host || undefined;

  // 1. If explicit MQTT prefix is configured, use it directly.
  if (explicitPrefix !== undefined) {
    console.log(`[discover] Using configured MQTT prefix: ${explicitPrefix}`);
    const broker = await getMqttBrokerConfig() ?? getDirectMqttConfig(options);

    if (broker === null) {
      throw new Error(
        "[discover] awtrix_mqtt_prefix is set but no MQTT broker available. " +
          "Configure mqtt_host/mqtt_port/mqtt_username/mqtt_password, or " +
          "install the Mosquitto broker add-on.",
      );
    }

    const brokerUrl = buildBrokerUrl(broker);
    console.log(`[discover] Connecting via MQTT to ${broker.host}:${broker.port}`);
    return mqtt({ broker: brokerUrl, prefix: explicitPrefix });
  }

  // 2. Try auto-discovery via MQTT + device registry.
  const broker = await getMqttBrokerConfig() ?? getDirectMqttConfig(options);

  if (broker !== null) {
    console.log(`[discover] MQTT broker available at ${broker.host}:${broker.port}`);
    console.log("[discover] Querying device registry for AWTRIX devices...");

    const devices = await discoverAwtrixDevices();

    if (devices.length > 0) {
      const device = devices[0]!;

      if (devices.length > 1) {
        console.warn(
          `[discover] Found ${devices.length} AWTRIX devices, using first: "${device.name}". ` +
            "Set awtrix_mqtt_prefix to select a specific device.",
        );
      }

      console.log(
        `[discover] Found AWTRIX device: "${device.name}" (AWTRIX 3 v${device.swVersion ?? "unknown"})`,
      );

      const brokerUrl = buildBrokerUrl(broker);
      console.log(`[discover] Connecting via MQTT (prefix: ${device.mqttPrefix})`);
      return mqtt({ broker: brokerUrl, prefix: device.mqttPrefix });
    }

    console.warn("[discover] No AWTRIX devices found in device registry.");
    console.warn(
      "[discover] Ensure HA_DISCOVERY is enabled on your AWTRIX device and it's connected to the same MQTT broker.",
    );
  } else {
    console.warn("[discover] MQTT service not available (Supervisor API failed and no direct mqtt_host configured).");
  }

  // 3. Fall back to HTTP if awtrix_host is configured.
  if (explicitHost !== undefined) {
    console.log(`[discover] Falling back to HTTP (host: ${explicitHost})`);
    return http({ host: explicitHost });
  }

  // 4. Check environment variable (local dev).
  const envHost = process.env.AWTRIX_HOST;
  if (envHost !== undefined) {
    console.log(`[discover] Using AWTRIX_HOST env var: ${envHost}`);
    return http({ host: envHost });
  }

  throw new Error(
    "[discover] No AWTRIX device found. Either:\n" +
      "  1. Install Mosquitto broker add-on and enable HA_DISCOVERY on your AWTRIX device, or\n" +
      "  2. Set the awtrix_mqtt_prefix option (plus mqtt_host if Supervisor API is blocked), or\n" +
      "  3. Set the awtrix_host option for HTTP fallback.",
  );
}
