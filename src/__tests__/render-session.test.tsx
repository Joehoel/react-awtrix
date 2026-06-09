import { describe, expect, test } from "bun:test";
import { App, Text } from "../components.tsx";
import { createAppRenderSession } from "../render-session.ts";
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
