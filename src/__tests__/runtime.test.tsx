import { afterEach, describe, expect, test } from "bun:test";
import { AwtrixApp, AwtrixText } from "../components.tsx";
import { mqtt, type MqttClientLike, type MqttProtocolDependencies } from "../protocols/mqtt.ts";
import { createRuntime } from "../runtime.ts";
import { createVirtualAwtrixDevice, type VirtualAwtrixDevice } from "../test/virtual-device.ts";
import type { AwtrixProtocol, Runtime } from "../types.ts";

const noop = (_payload: { pressed: boolean; raw: string }): void => {};

interface RuntimeTestContext {
  device: VirtualAwtrixDevice;
  runtime: Runtime;
}

function createContext(): RuntimeTestContext {
  const device = createVirtualAwtrixDevice();

  const runtime = createRuntime({
    host: device.host,
    port: device.port,
    debounce: 0,
  });

  return {
    device,
    runtime,
  };
}

function appWithText(text: string) {
  return (
    <AwtrixApp>
      <AwtrixText x={0} y={0} color="#FFFFFF">
        {text}
      </AwtrixText>
    </AwtrixApp>
  );
}

async function waitFor(check: () => boolean, timeoutMs = 500): Promise<void> {
  const startedAt = Date.now();

  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for expected condition.");
    }

    await Bun.sleep(5);
  }
}

interface SubscriptionCall {
  action: "subscribe" | "unsubscribe";
  topic: string;
}

interface MqttRuntimeHarness {
  protocol: AwtrixProtocol;
  subscriptions: SubscriptionCall[];
  endCalls: number[];
  emit: (topic: string, message: string) => void;
}

function createMqttRuntimeHarness(keySuffix: string): MqttRuntimeHarness {
  const subscriptions: SubscriptionCall[] = [];
  const endCalls: number[] = [];
  let messageListener: ((topic: string, payload: Uint8Array) => void) | undefined;

  const client: MqttClientLike = {
    publish(_topic, _message, callback) {
      callback();
    },
    subscribe(topic, callback) {
      subscriptions.push({ action: "subscribe", topic });
      callback();
    },
    unsubscribe(topic, callback) {
      subscriptions.push({ action: "unsubscribe", topic });
      callback();
    },
    on(_event, handler) {
      messageListener = handler;
    },
    removeListener(_event, handler) {
      if (messageListener === handler) {
        messageListener = undefined;
      }
    },
    end(_force, _options, callback) {
      endCalls.push(1);
      callback();
    },
  };

  const dependencies: MqttProtocolDependencies = {
    connectClient: (_broker) => client,
  };

  const protocol = mqtt(
    {
      broker: `mqtt://runtime-${keySuffix}`,
      prefix: "awtrix_test",
    },
    dependencies,
  );

  return {
    protocol,
    subscriptions,
    endCalls,
    emit(topic, message) {
      if (messageListener === undefined) {
        return;
      }

      messageListener(topic, new TextEncoder().encode(message));
    },
  };
}

describe("runtime", () => {
  let context: RuntimeTestContext | undefined;

  afterEach(async () => {
    if (context === undefined) {
      return;
    }

    await context.runtime.dispose();
    context.device.stop();
    context = undefined;
  });

  test("renders multiple apps in one runtime", async () => {
    context = createContext();

    context.runtime.app("clock", appWithText("CLOCK"));
    context.runtime.app("weather", appWithText("WX"));

    await context.device.waitForCustomRequestCount(2, 2000);

    const clockPayload = await context.device.waitForApp("clock", 2000);
    const weatherPayload = await context.device.waitForApp("weather", 2000);

    expect(clockPayload.draw).toEqual([{ dt: [0, 0, "CLOCK", "#FFFFFF"] }]);
    expect(weatherPayload.draw).toEqual([{ dt: [0, 0, "WX", "#FFFFFF"] }]);
    expect(context.runtime.apps().toSorted()).toEqual(["clock", "weather"]);
  });

  test("upserts app by name and updates existing root", async () => {
    context = createContext();

    context.runtime.app("clock", appWithText("OLD"));
    await context.device.waitForCustomRequestCount(1, 2000);

    context.runtime.app("clock", appWithText("NEW"));
    await context.device.waitForCustomRequestCount(2, 2000);

    const payload = await context.device.waitForApp("clock", 2000);
    expect(payload.draw).toEqual([{ dt: [0, 0, "NEW", "#FFFFFF"] }]);
  });

  test("stale handles cannot unmount a newer generation", async () => {
    context = createContext();

    const oldHandle = context.runtime.app("clock", appWithText("OLD"));
    await context.device.waitForCustomRequestCount(1, 2000);

    context.runtime.app("clock", appWithText("NEW"));
    await context.device.waitForCustomRequestCount(2, 2000);

    await oldHandle.unmount();
    await Bun.sleep(30);

    const payload = await context.device.waitForApp("clock", 2000);
    expect(payload.draw).toEqual([{ dt: [0, 0, "NEW", "#FFFFFF"] }]);

    const deletedRequests = context.device
      .getCustomRequests()
      .filter((request) => request.name === "clock" && request.deleted);
    expect(deletedRequests).toHaveLength(0);
  });

  test("remove deletes only one app", async () => {
    context = createContext();

    context.runtime.app("clock", appWithText("CLOCK"));
    context.runtime.app("weather", appWithText("WX"));
    await context.device.waitForCustomRequestCount(2, 2000);

    await context.runtime.remove("clock");
    await context.device.waitForAppDeletion("clock", 2000);

    const weatherPayload = await context.device.waitForApp("weather", 2000);
    expect(weatherPayload.draw).toEqual([{ dt: [0, 0, "WX", "#FFFFFF"] }]);
    expect(context.runtime.apps()).toEqual(["weather"]);
  });

  test("dispose cleans up all apps", async () => {
    context = createContext();

    context.runtime.app("clock", appWithText("CLOCK"));
    context.runtime.app("weather", appWithText("WX"));
    await context.device.waitForCustomRequestCount(2, 2000);

    await context.runtime.dispose();

    await context.device.waitForAppDeletion("clock", 2000);
    await context.device.waitForAppDeletion("weather", 2000);
    expect(context.runtime.apps()).toEqual([]);
  });

  test("supports protocol option for runtime operations", async () => {
    const pushed: Array<{ name: string; text: string | undefined }> = [];
    const deleted: string[] = [];

    const protocol: AwtrixProtocol = {
      kind: "mock",
      key: "mock:runtime",
      pushApp: async (name, payload) => {
        pushed.push({ name, text: payload.text });
      },
      deleteApp: async (name) => {
        deleted.push(name);
      },
      pushNotify: async (_payload) => {},
    };

    const runtime = createRuntime({
      protocol,
      debounce: 0,
    });

    try {
      runtime.app("clock", appWithText("MOCK"));
      await waitFor(() => pushed.length === 1);
      expect(pushed[0]).toEqual({ name: "clock", text: undefined });

      await runtime.remove("clock");
      await waitFor(() => deleted.length === 1);
      expect(deleted).toEqual(["clock"]);
    } finally {
      await runtime.dispose();
    }
  });

  test("reuses runtime instances by protocol key", async () => {
    const firstProtocol: AwtrixProtocol = {
      kind: "mock",
      key: "mock:shared-runtime-key",
      pushApp: async (_name, _payload) => {},
      deleteApp: async (_name) => {},
      pushNotify: async (_payload) => {},
    };

    const secondProtocol: AwtrixProtocol = {
      kind: "mock",
      key: "mock:shared-runtime-key",
      pushApp: async (_name, _payload) => {},
      deleteApp: async (_name) => {},
      pushNotify: async (_payload) => {},
    };

    const first = createRuntime({ protocol: firstProtocol });
    const second = createRuntime({ protocol: secondProtocol });

    expect(second).toBe(first);
    await first.dispose();
  });

  test("throws when subscribing on a protocol without event support", () => {
    context = createContext();

    if (context === undefined) {
      throw new Error("Expected runtime test context.");
    }

    const runtime = context.runtime;

    expect(() => {
      runtime.on("button:left", noop);
    }).toThrow("does not support subscriptions");
  });

  test("forwards protocol events and unsubscribes via off", async () => {
    const harness = createMqttRuntimeHarness("events");
    const runtime = createRuntime({ protocol: harness.protocol });
    const received: boolean[] = [];
    const listener = (payload: { pressed: boolean; raw: string }): void => {
      received.push(payload.pressed);
    };

    try {
      runtime.on("button:left", listener);
      expect(harness.subscriptions).toEqual([
        { action: "subscribe", topic: "awtrix_test/stats/buttonLeft" },
      ]);

      harness.emit("awtrix_test/stats/buttonLeft", "1");
      expect(received).toEqual([true]);

      runtime.off("button:left", listener);
      expect(harness.subscriptions).toEqual([
        { action: "subscribe", topic: "awtrix_test/stats/buttonLeft" },
        { action: "unsubscribe", topic: "awtrix_test/stats/buttonLeft" },
      ]);
    } finally {
      await runtime.dispose();
    }

    expect(harness.endCalls).toEqual([1]);
  });

  test("dispose unsubscribes protocol listeners", async () => {
    const harness = createMqttRuntimeHarness("dispose");
    const runtime = createRuntime({ protocol: harness.protocol });

    runtime.on("button:left", noop);
    await runtime.dispose();

    expect(harness.subscriptions).toEqual([
      { action: "subscribe", topic: "awtrix_test/stats/buttonLeft" },
      { action: "unsubscribe", topic: "awtrix_test/stats/buttonLeft" },
    ]);
    expect(harness.endCalls).toEqual([1]);
  });
});
