import { describe, expect, test } from "bun:test";
import { App, Text } from "../components.tsx";
import { createAppRenderSession, createNotifyRenderSession } from "../render-session.ts";
import type { AwtrixPayload } from "../types.ts";

async function waitFor(check: () => boolean, timeoutMs = 500): Promise<void> {
  const startedAt = Date.now();

  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for expected condition.");
    }

    await Bun.sleep(5);
  }
}

function textApp(value: string) {
  return (
    <App>
      <Text x={0} y={7} color="#FFFFFF">
        {value}
      </Text>
    </App>
  );
}

describe("AppRenderSession", () => {
  test("updates a React tree and flushes the serialized payload", async () => {
    const pushed: AwtrixPayload[] = [];

    const session = createAppRenderSession({
      appName: "session-test",
      identifierPrefix: "session-test",
      debounceMs: 0,
      requestFlush: async (payload) => {
        pushed.push(payload);
      },
      requestDelete: async () => {},
    });

    session.update(textApp("Hi"));

    await waitFor(() => pushed.length === 1);
    expect(pushed[0]).toEqual({
      draw: [{ dt: [0, 7, "Hi", "#FFFFFF"] }],
    });

    await session.unmount({ deleteOnDevice: false });
  });

  test("unmount cancels a pending debounced flush before deleting", async () => {
    const pushed: AwtrixPayload[] = [];
    const deleted: string[] = [];

    const session = createAppRenderSession({
      appName: "debounced-session",
      identifierPrefix: "debounced-session",
      debounceMs: 100,
      requestFlush: async (payload) => {
        pushed.push(payload);
      },
      requestDelete: async () => {
        deleted.push("debounced-session");
      },
    });

    session.update(textApp("Late"));
    await Bun.sleep(10);
    await session.unmount();
    await Bun.sleep(130);

    expect(pushed).toEqual([]);
    expect(deleted).toEqual(["debounced-session"]);
  });

  test("unmount deletes once and ignores later updates", async () => {
    const pushed: AwtrixPayload[] = [];
    const deleted: string[] = [];

    const session = createAppRenderSession({
      appName: "idempotent-session",
      identifierPrefix: "idempotent-session",
      debounceMs: 0,
      requestFlush: async (payload) => {
        pushed.push(payload);
      },
      requestDelete: async () => {
        deleted.push("idempotent-session");
      },
    });

    await session.unmount();
    await session.unmount();
    session.update(textApp("Ignored"));
    await Bun.sleep(20);

    expect(pushed).toEqual([]);
    expect(deleted).toEqual(["idempotent-session"]);
  });
});

describe("NotifyRenderSession", () => {
  test("flushes a notification payload and reports completion", async () => {
    const pushed: AwtrixPayload[] = [];
    let flushed = false;

    const session = createNotifyRenderSession({
      notifyOptions: {
        hold: true,
        sound: "ding",
      },
      requestFlush: async (payload) => {
        pushed.push(payload);
      },
      onFlush() {
        flushed = true;
      },
    });

    session.update(textApp("Notify"));

    await waitFor(() => flushed);
    expect(pushed).toEqual([
      {
        hold: true,
        sound: "ding",
        draw: [{ dt: [0, 7, "Notify", "#FFFFFF"] }],
      },
    ]);

    session.unmount();
  });

  test("reports notification flush errors", async () => {
    const expectedError = new Error("notify failed");
    let flushError: unknown;
    const originalConsoleError = console.error;
    console.error = (..._args: unknown[]) => {};

    try {
      const session = createNotifyRenderSession({
        requestFlush: async () => {
          throw expectedError;
        },
        onFlushError(error) {
          flushError = error;
        },
      });

      session.update(textApp("Boom"));

      await waitFor(() => flushError !== undefined);
      expect(flushError).toBe(expectedError);

      session.unmount();
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("unmount cancels a pending notification flush", async () => {
    const pushed: AwtrixPayload[] = [];

    const session = createNotifyRenderSession({
      requestFlush: async (payload) => {
        pushed.push(payload);
      },
    });

    session.update(textApp("Cancelled"));
    session.unmount();
    await Bun.sleep(20);

    expect(pushed).toEqual([]);
  });
});
