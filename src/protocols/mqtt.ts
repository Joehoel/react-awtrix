import { connect } from "mqtt";
import type { AwtrixProtocol, AwtrixProtocolEventMap } from "../types.ts";

export interface MqttProtocolOptions {
  broker: string;
  prefix: string;
}

type MqttMessageHandler = (topic: string, payload: Uint8Array) => void;

export interface MqttClientLike {
  publish(topic: string, message: string, callback: (error?: Error) => void): void;
  subscribe(topic: string, callback: (error?: Error) => void): void;
  unsubscribe(topic: string, callback: (error?: Error) => void): void;
  on(event: "message", handler: MqttMessageHandler): void;
  removeListener(event: "message", handler: MqttMessageHandler): void;
  end(force: boolean, options: Record<string, never>, callback: () => void): void;
}

export interface MqttProtocolDependencies {
  connectClient: (broker: string) => MqttClientLike;
}

interface SharedConnection {
  client: MqttClientLike;
  refCount: number;
  topicRefs: Map<string, number>;
}

const utf8Decoder = new TextDecoder();

function normalizePrefix(prefix: string): string {
  let value = prefix.trim();

  while (value.startsWith("/")) {
    value = value.slice(1);
  }

  while (value.endsWith("/")) {
    value = value.slice(0, -1);
  }

  return value;
}

function publish(client: MqttClientLike, topic: string, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    client.publish(topic, message, (error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function subscribeTopic(client: MqttClientLike, topic: string): Promise<void> {
  return new Promise((resolve, reject) => {
    client.subscribe(topic, (error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function unsubscribeTopic(client: MqttClientLike, topic: string): Promise<void> {
  return new Promise((resolve, reject) => {
    client.unsubscribe(topic, (error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function disconnect(client: MqttClientLike): Promise<void> {
  return new Promise((resolve) => {
    client.end(false, {}, () => {
      resolve();
    });
  });
}

const defaultDependencies: MqttProtocolDependencies = {
  connectClient: (broker) => connect(broker),
};

const sharedConnectionsByDependencies = new WeakMap<
  MqttProtocolDependencies,
  Map<string, SharedConnection>
>();

function getConnectionPool(dependencies: MqttProtocolDependencies): Map<string, SharedConnection> {
  const existingPool = sharedConnectionsByDependencies.get(dependencies);
  if (existingPool !== undefined) {
    return existingPool;
  }

  const nextPool = new Map<string, SharedConnection>();
  sharedConnectionsByDependencies.set(dependencies, nextPool);
  return nextPool;
}

function acquireSharedConnection(
  broker: string,
  dependencies: MqttProtocolDependencies,
): SharedConnection {
  const pool = getConnectionPool(dependencies);
  const existingConnection = pool.get(broker);

  if (existingConnection !== undefined) {
    existingConnection.refCount += 1;
    return existingConnection;
  }

  const nextConnection: SharedConnection = {
    client: dependencies.connectClient(broker),
    refCount: 1,
    topicRefs: new Map(),
  };

  pool.set(broker, nextConnection);
  return nextConnection;
}

async function releaseSharedConnection(
  broker: string,
  dependencies: MqttProtocolDependencies,
): Promise<void> {
  const pool = getConnectionPool(dependencies);
  const connection = pool.get(broker);

  if (connection === undefined) {
    return;
  }

  connection.refCount -= 1;
  if (connection.refCount > 0) {
    return;
  }

  pool.delete(broker);
  await disconnect(connection.client);
}

function retainSharedTopic(connection: SharedConnection, topic: string): void {
  const nextCount = (connection.topicRefs.get(topic) ?? 0) + 1;
  connection.topicRefs.set(topic, nextCount);

  if (nextCount === 1) {
    void subscribeTopic(connection.client, topic).catch((error: unknown) => {
      console.error(`[react-awtrix] Failed to subscribe to topic "${topic}":`, error);
    });
  }
}

function releaseSharedTopic(connection: SharedConnection, topic: string): void {
  const currentCount = connection.topicRefs.get(topic);
  if (currentCount === undefined) {
    return;
  }

  if (currentCount <= 1) {
    connection.topicRefs.delete(topic);
    void unsubscribeTopic(connection.client, topic).catch((error: unknown) => {
      console.error(`[react-awtrix] Failed to unsubscribe from topic "${topic}":`, error);
    });
    return;
  }

  connection.topicRefs.set(topic, currentCount - 1);
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const record: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    record[key] = entry;
  }

  return record;
}

export function mqtt(
  options: MqttProtocolOptions,
  dependencies: MqttProtocolDependencies = defaultDependencies,
): AwtrixProtocol {
  const prefix = normalizePrefix(options.prefix);
  const connection = acquireSharedConnection(options.broker, dependencies);
  const topicByEvent: { [K in keyof AwtrixProtocolEventMap]: string } = {
    "button:left": `${prefix}/stats/buttonLeft`,
    "button:select": `${prefix}/stats/buttonSelect`,
    "button:right": `${prefix}/stats/buttonRight`,
    currentApp: `${prefix}/stats/currentApp`,
    stats: `${prefix}/stats`,
    device: `${prefix}/stats/device`,
  };
  const parseByEvent: {
    [K in keyof AwtrixProtocolEventMap]: (raw: string) => AwtrixProtocolEventMap[K] | undefined;
  } = {
    "button:left": (raw) => ({
      pressed: raw === "1",
      raw,
    }),
    "button:select": (raw) => ({
      pressed: raw === "1",
      raw,
    }),
    "button:right": (raw) => ({
      pressed: raw === "1",
      raw,
    }),
    currentApp: (raw) => ({ name: raw }),
    stats: (raw) => {
      let parsed: unknown;

      try {
        parsed = JSON.parse(raw);
      } catch {
        return undefined;
      }

      const value = toRecord(parsed);
      if (value === undefined) {
        return undefined;
      }

      return { value };
    },
    device: (raw) => ({
      online: raw === "online",
    }),
  };
  const rawHandlersByEvent: { [K in keyof AwtrixProtocolEventMap]: Set<(raw: string) => void> } = {
    "button:left": new Set(),
    "button:select": new Set(),
    "button:right": new Set(),
    currentApp: new Set(),
    stats: new Set(),
    device: new Set(),
  };
  const eventByTopic = new Map<string, keyof AwtrixProtocolEventMap>();
  eventByTopic.set(topicByEvent["button:left"], "button:left");
  eventByTopic.set(topicByEvent["button:select"], "button:select");
  eventByTopic.set(topicByEvent["button:right"], "button:right");
  eventByTopic.set(topicByEvent.currentApp, "currentApp");
  eventByTopic.set(topicByEvent.stats, "stats");
  eventByTopic.set(topicByEvent.device, "device");
  const localTopicRefs = new Map<string, number>();
  let disposed = false;

  const messageHandler: MqttMessageHandler = (topic, payload) => {
    const event = eventByTopic.get(topic);
    if (event === undefined) {
      return;
    }

    const raw = utf8Decoder.decode(payload).trim();
    const handlers = rawHandlersByEvent[event];

    for (const handler of handlers) {
      handler(raw);
    }
  };

  connection.client.on("message", messageHandler);

  async function publishIfActive(topic: string, message: string): Promise<void> {
    if (disposed) {
      throw new Error("[react-awtrix] MQTT protocol is disposed.");
    }

    await publish(connection.client, topic, message);
  }

  function retainTopic(topic: string): void {
    const nextCount = (localTopicRefs.get(topic) ?? 0) + 1;
    localTopicRefs.set(topic, nextCount);
    retainSharedTopic(connection, topic);
  }

  function releaseTopic(topic: string): void {
    const currentCount = localTopicRefs.get(topic);
    if (currentCount === undefined) {
      return;
    }

    if (currentCount <= 1) {
      localTopicRefs.delete(topic);
    } else {
      localTopicRefs.set(topic, currentCount - 1);
    }

    releaseSharedTopic(connection, topic);
  }

  function onEvent<K extends keyof AwtrixProtocolEventMap>(
    event: K,
    handler: (payload: AwtrixProtocolEventMap[K]) => void,
  ): () => void {
    if (disposed) {
      throw new Error("[react-awtrix] Cannot subscribe on a disposed MQTT protocol.");
    }

    const topic = topicByEvent[event];
    const parsePayload = parseByEvent[event];
    const handlers = rawHandlersByEvent[event];
    const rawHandler = (raw: string): void => {
      const payload = parsePayload(raw);

      if (payload !== undefined) {
        handler(payload);
      }
    };

    handlers.add(rawHandler);
    retainTopic(topic);

    let active = true;

    return () => {
      if (!active) {
        return;
      }

      active = false;
      handlers.delete(rawHandler);
      releaseTopic(topic);
    };
  }

  return {
    kind: "mqtt",
    key: `mqtt:${options.broker}:${prefix}`,
    pushApp: async (name, payload) => {
      await publishIfActive(`${prefix}/custom/${name}`, JSON.stringify(payload));
    },
    deleteApp: async (name) => {
      await publishIfActive(`${prefix}/custom/${name}`, "");
    },
    pushNotify: async (payload) => {
      await publishIfActive(`${prefix}/notify`, JSON.stringify(payload));
    },
    dismissNotify: async () => {
      await publishIfActive(`${prefix}/notify/dismiss`, "");
    },
    on: onEvent,
    dispose: async () => {
      if (disposed) {
        return;
      }

      disposed = true;
      connection.client.removeListener("message", messageHandler);

      for (const [topic, count] of localTopicRefs.entries()) {
        for (let index = 0; index < count; index += 1) {
          releaseSharedTopic(connection, topic);
        }
      }

      localTopicRefs.clear();

      for (const handlers of Object.values(rawHandlersByEvent)) {
        handlers.clear();
      }

      await releaseSharedConnection(options.broker, dependencies);
    },
  };
}
