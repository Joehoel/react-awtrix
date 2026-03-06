import { createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { Aedes } from "aedes";
import { AwtrixApp, AwtrixText, createRuntime, mqtt } from "../src/index.ts";

const prefix = process.env.AWTRIX_MQTT_PREFIX ?? "awtrix_demo";
const localBrokerEnabled = process.env.AWTRIX_MQTT_LOCAL_BROKER === "1";
const localBrokerPort = Number(process.env.AWTRIX_MQTT_LOCAL_PORT ?? "1883");

function firstLanIPv4(): string | undefined {
  const interfacesByName = networkInterfaces();

  for (const interfaces of Object.values(interfacesByName)) {
    if (interfaces === undefined) {
      continue;
    }

    for (const entry of interfaces) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }

  return undefined;
}

function listenServer(server: ReturnType<typeof createServer>, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };

    const onError = (error: unknown): void => {
      server.off("listening", onListening);
      reject(error);
    };

    server.once("listening", onListening);
    server.once("error", onError);
    server.listen(port);
  });
}

function serverPort(server: ReturnType<typeof createServer>): number | undefined {
  const address = server.address();

  if (typeof address !== "object" || address === null) {
    return undefined;
  }

  if (!("port" in address)) {
    return undefined;
  }

  const port = Reflect.get(address, "port");
  if (typeof port !== "number") {
    return undefined;
  }

  return port;
}

function hasErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  return Reflect.get(error, "code") === code;
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function closeBroker(broker: Aedes): Promise<void> {
  return new Promise((resolve) => {
    broker.close(() => {
      resolve();
    });
  });
}

let broker = process.env.AWTRIX_MQTT_BROKER ?? "mqtt://broker.hivemq.com:1883";
let stopLocalBroker: (() => Promise<void>) | undefined;
let resolvedLocalPort: number | undefined;

if (localBrokerEnabled) {
  const localBroker = new Aedes();
  const localServer = createServer((socket) => {
    localBroker.handle(socket);
  });

  let activeLocalPort = localBrokerPort;

  try {
    await listenServer(localServer, activeLocalPort);
  } catch (error) {
    if (!hasErrorCode(error, "EADDRINUSE")) {
      throw error;
    }

    console.warn(
      `[react-awtrix] Local MQTT port ${activeLocalPort} is already in use, choosing a free port...`,
    );

    await listenServer(localServer, 0);
    const detectedPort = serverPort(localServer);
    if (detectedPort === undefined) {
      throw new Error("[react-awtrix] Failed to detect local MQTT broker port.");
    }

    activeLocalPort = detectedPort;
  }

  broker = `mqtt://127.0.0.1:${activeLocalPort}`;
  resolvedLocalPort = activeLocalPort;

  stopLocalBroker = async () => {
    await closeServer(localServer);
    await closeBroker(localBroker);
  };
}

const runtime = createRuntime({
  protocol: mqtt({ broker, prefix }),
  debounce: 50,
});

runtime.app(
  "mqtt-hello",
  <AwtrixApp>
    <AwtrixText x={0} y={7} color="#FFFFFF">
      MQTT
    </AwtrixText>
  </AwtrixApp>,
);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[react-awtrix] Shutting down after ${signal}...`);

  try {
    await runtime.dispose();
  } catch (error) {
    console.error("[react-awtrix] Runtime dispose failed:", error);
  }

  if (stopLocalBroker !== undefined) {
    try {
      await stopLocalBroker();
    } catch (error) {
      console.error("[react-awtrix] Local MQTT broker shutdown failed:", error);
    }
  }

  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

console.log(
  `[react-awtrix] Running MQTT example on ${broker} (${prefix}). Press Ctrl+C to exit.`,
);

if (localBrokerEnabled) {
  const activeLocalPort = resolvedLocalPort ?? localBrokerPort;
  const lanAddress = firstLanIPv4();
  if (lanAddress !== undefined) {
    console.log(
      `[react-awtrix] Local broker listening on ${lanAddress}:${activeLocalPort}. Set your Awtrix MQTT server to this host/port.`,
    );
  }
}
