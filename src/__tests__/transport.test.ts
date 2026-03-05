import { describe, expect, test } from "bun:test";
import { DeviceTransport, type TransportClient } from "../transport.ts";
import type { AwtrixPayload } from "../types.ts";

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function createDeferred(): Deferred {
  let resolvePromise: (() => void) | undefined;

  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  const resolve = (): void => {
    const handler = resolvePromise;
    if (handler !== undefined) {
      handler();
    }
  };

  return { promise, resolve };
}

function createPayload(text: string): AwtrixPayload {
  return {
    draw: [{ dt: [0, 0, text, "#FFFFFF"] }],
  };
}

describe("DeviceTransport", () => {
  test("coalesces rapid pushes for the same app and sends latest payload", async () => {
    const calls: Array<{ name: string; payload: AwtrixPayload }> = [];

    const client: TransportClient = {
      pushApp(_host, _port, name, payload) {
        calls.push({ name, payload });
        return Promise.resolve();
      },
      deleteApp() {
        return Promise.resolve();
      },
    };

    const transport = new DeviceTransport({
      host: "127.0.0.1",
      port: 80,
      client,
      minIntervalMs: 0,
    });

    const first = transport.enqueuePush("clock", createPayload("A"));
    const second = transport.enqueuePush("clock", createPayload("B"));
    await Promise.all([first, second]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("clock");
    expect(calls[0]?.payload).toEqual(createPayload("B"));
  });

  test("processes requests serially with max concurrency one", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const client: TransportClient = {
      async pushApp() {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Bun.sleep(20);
        inFlight -= 1;
      },
      deleteApp() {
        return Promise.resolve();
      },
    };

    const transport = new DeviceTransport({
      host: "127.0.0.1",
      port: 80,
      client,
      minIntervalMs: 0,
    });

    await Promise.all([
      transport.enqueuePush("clock", createPayload("A")),
      transport.enqueuePush("weather", createPayload("B")),
      transport.enqueuePush("pomodoro", createPayload("C")),
    ]);

    expect(maxInFlight).toBe(1);
  });

  test("applies min interval between consecutive sends", async () => {
    const timestamps: number[] = [];

    const client: TransportClient = {
      pushApp() {
        timestamps.push(Date.now());
        return Promise.resolve();
      },
      deleteApp() {
        return Promise.resolve();
      },
    };

    const minIntervalMs = 35;
    const transport = new DeviceTransport({
      host: "127.0.0.1",
      port: 80,
      client,
      minIntervalMs,
    });

    await Promise.all([
      transport.enqueuePush("clock", createPayload("A")),
      transport.enqueuePush("weather", createPayload("B")),
    ]);

    expect(timestamps).toHaveLength(2);
    const firstTimestamp = timestamps[0];
    const secondTimestamp = timestamps[1];
    if (firstTimestamp === undefined || secondTimestamp === undefined) {
      throw new Error("Expected two send timestamps.");
    }

    const delta = secondTimestamp - firstTimestamp;
    expect(delta).toBeGreaterThanOrEqual(minIntervalMs - 5);
  });

  test("replace pending push with delete for same app", async () => {
    const calls: string[] = [];
    const firstSendGate = createDeferred();

    const client: TransportClient = {
      async pushApp(_host, _port, name) {
        calls.push(`push:${name}`);
        await firstSendGate.promise;
      },
      async deleteApp(_host, _port, name) {
        calls.push(`delete:${name}`);
      },
    };

    const transport = new DeviceTransport({
      host: "127.0.0.1",
      port: 80,
      client,
      minIntervalMs: 0,
    });

    const first = transport.enqueuePush("clock", createPayload("A"));
    const second = transport.enqueuePush("weather", createPayload("B"));
    const third = transport.enqueueDelete("weather");

    firstSendGate.resolve();

    await Promise.all([first, second, third]);

    expect(calls).toEqual(["push:clock", "delete:weather"]);
  });

  test("continues draining after a failed send", async () => {
    const calls: string[] = [];

    const client: TransportClient = {
      async pushApp(_host, _port, name) {
        calls.push(name);
        if (name === "bad") {
          throw new Error("boom");
        }
      },
      deleteApp() {
        return Promise.resolve();
      },
    };

    const transport = new DeviceTransport({
      host: "127.0.0.1",
      port: 80,
      client,
      minIntervalMs: 0,
    });

    await expect(transport.enqueuePush("bad", createPayload("X"))).rejects.toThrow("boom");
    await expect(transport.enqueuePush("good", createPayload("Y"))).resolves.toBeUndefined();

    expect(calls).toEqual(["bad", "good"]);
  });
});
