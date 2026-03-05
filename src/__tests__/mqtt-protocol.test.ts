import { describe, expect, test } from "bun:test";
import {
  mqtt,
  type MqttClientLike,
  type MqttProtocolDependencies,
} from "../protocols/mqtt.ts";

interface PublishCall {
  topic: string;
  message: string;
}

interface SubscriptionCall {
  action: "subscribe" | "unsubscribe";
  topic: string;
}

interface MessageHarness {
  emit: (topic: string, message: string) => void;
}

function createStubClient(
  publishes: PublishCall[],
  subscriptions: SubscriptionCall[],
  endCalls: number[],
  messageHarness: MessageHarness,
): MqttClientLike {
  let messageListener: ((topic: string, payload: Uint8Array) => void) | undefined;

  messageHarness.emit = (topic, message) => {
    if (messageListener === undefined) {
      return;
    }

    messageListener(topic, new TextEncoder().encode(message));
  };

  return {
    publish(topic, message, callback) {
      publishes.push({ topic, message });
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
}

describe("mqtt protocol", () => {
  test("publishes app and notify operations to Awtrix MQTT topics", async () => {
    const publishes: PublishCall[] = [];
    const subscriptions: SubscriptionCall[] = [];
    const endCalls: number[] = [];
    const messageHarness: MessageHarness = {
      emit() {},
    };
    let connectBroker: string | undefined;

    const dependencies: MqttProtocolDependencies = {
      connectClient: (broker) => {
        connectBroker = broker;
        return createStubClient(publishes, subscriptions, endCalls, messageHarness);
      },
    };

    const protocol = mqtt(
      {
        broker: "mqtt://test-broker",
        prefix: "/awtrix_test/",
      },
      dependencies,
    );

    await protocol.pushApp("clock", {
      text: "Clock",
      draw: [{ dt: [0, 0, "12:34", "#FFFFFF"] }],
    });
    await protocol.deleteApp("clock");
    await protocol.pushNotify({
      hold: true,
      draw: [{ dp: [1, 1, "#00FF00"] }],
    });
    await protocol.dismissNotify?.();

    expect(protocol.kind).toBe("mqtt");
    expect(protocol.key).toBe("mqtt:mqtt://test-broker:awtrix_test");
    expect(connectBroker).toBe("mqtt://test-broker");
    expect(publishes).toEqual([
      {
        topic: "awtrix_test/custom/clock",
        message: '{"text":"Clock","draw":[{"dt":[0,0,"12:34","#FFFFFF"]}]}',
      },
      {
        topic: "awtrix_test/custom/clock",
        message: "",
      },
      {
        topic: "awtrix_test/notify",
        message: '{"hold":true,"draw":[{"dp":[1,1,"#00FF00"]}]}',
      },
      {
        topic: "awtrix_test/notify/dismiss",
        message: "",
      },
    ]);
    expect(endCalls).toEqual([]);
    expect(subscriptions).toEqual([]);
  });

  test("dispose disconnects the mqtt client", async () => {
    const publishes: PublishCall[] = [];
    const subscriptions: SubscriptionCall[] = [];
    const endCalls: number[] = [];
    const messageHarness: MessageHarness = {
      emit() {},
    };

    const dependencies: MqttProtocolDependencies = {
      connectClient: (_broker) => createStubClient(publishes, subscriptions, endCalls, messageHarness),
    };

    const protocol = mqtt(
      {
        broker: "mqtt://test-broker",
        prefix: "awtrix_test",
      },
      dependencies,
    );

    await protocol.dispose?.();
    await protocol.dispose?.();

    expect(endCalls).toEqual([1]);
    expect(subscriptions).toEqual([]);
    await expect(protocol.pushNotify({ text: "late" })).rejects.toThrow("MQTT protocol is disposed");
  });

  test("subscribes to mqtt stats topics and emits runtime events", async () => {
    const publishes: PublishCall[] = [];
    const subscriptions: SubscriptionCall[] = [];
    const endCalls: number[] = [];
    const messageHarness: MessageHarness = {
      emit() {},
    };

    const dependencies: MqttProtocolDependencies = {
      connectClient: (_broker) => createStubClient(publishes, subscriptions, endCalls, messageHarness),
    };

    const protocol = mqtt(
      {
        broker: "mqtt://test-broker",
        prefix: "awtrix_test",
      },
      dependencies,
    );

    const buttonEvents: boolean[] = [];
    const statsEvents: Array<Record<string, unknown>> = [];

    const offLeft = protocol.on?.("button:left", (payload) => {
      buttonEvents.push(payload.pressed);
    });

    const offStats = protocol.on?.("stats", (payload) => {
      statsEvents.push(payload.value);
    });

    if (offLeft === undefined || offStats === undefined) {
      throw new Error("Expected MQTT protocol to support subscriptions.");
    }

    expect(subscriptions).toEqual([
      { action: "subscribe", topic: "awtrix_test/stats/buttonLeft" },
      { action: "subscribe", topic: "awtrix_test/stats" },
    ]);

    messageHarness.emit("awtrix_test/stats/buttonLeft", "1");
    messageHarness.emit("awtrix_test/stats", '{"uptime":123}');

    expect(buttonEvents).toEqual([true]);
    expect(statsEvents).toEqual([{ uptime: 123 }]);

    offLeft();
    offStats();

    expect(subscriptions).toEqual([
      { action: "subscribe", topic: "awtrix_test/stats/buttonLeft" },
      { action: "subscribe", topic: "awtrix_test/stats" },
      { action: "unsubscribe", topic: "awtrix_test/stats/buttonLeft" },
      { action: "unsubscribe", topic: "awtrix_test/stats" },
    ]);

    await protocol.dispose?.();
    expect(endCalls).toEqual([1]);
    expect(publishes).toEqual([]);
  });

  test("shares broker connection and disconnects after final dispose", async () => {
    const publishes: PublishCall[] = [];
    const subscriptions: SubscriptionCall[] = [];
    const endCalls: number[] = [];
    const messageHarness: MessageHarness = {
      emit() {},
    };
    let connectCalls = 0;

    const dependencies: MqttProtocolDependencies = {
      connectClient: (_broker) => {
        connectCalls += 1;
        return createStubClient(publishes, subscriptions, endCalls, messageHarness);
      },
    };

    const first = mqtt(
      {
        broker: "mqtt://shared-broker",
        prefix: "awtrix_a",
      },
      dependencies,
    );

    const second = mqtt(
      {
        broker: "mqtt://shared-broker",
        prefix: "awtrix_b",
      },
      dependencies,
    );

    expect(connectCalls).toBe(1);

    await first.dispose?.();
    expect(endCalls).toEqual([]);

    await second.dispose?.();
    expect(endCalls).toEqual([1]);
  });
});
