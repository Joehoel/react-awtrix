import { describe, expect, test } from "bun:test";
import { AwtrixApp, AwtrixText } from "../components.tsx";
import { notify, render } from "../renderer.ts";
import type { AwtrixPayload, AwtrixProtocol } from "../types.ts";

async function waitFor(check: () => boolean, timeoutMs = 500): Promise<void> {
  const startedAt = Date.now();

  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for expected condition.");
    }

    await Bun.sleep(5);
  }
}

describe("renderer protocol options", () => {
  test("render uses provided protocol for push and delete", async () => {
    const pushed: Array<{ name: string; payload: AwtrixPayload }> = [];
    const deleted: string[] = [];

    const protocol: AwtrixProtocol = {
      kind: "mock",
      key: "mock:renderer",
      pushApp: async (name, payload) => {
        pushed.push({ name, payload });
      },
      deleteApp: async (name) => {
        deleted.push(name);
      },
      pushNotify: async (_payload) => {},
    };

    const handle = render(
      <AwtrixApp>
        <AwtrixText x={0} y={7} color="#FFFFFF">
          Hi
        </AwtrixText>
      </AwtrixApp>,
      {
        app: "proto-render",
        protocol,
        debounce: 0,
      },
    );

    await waitFor(() => pushed.length === 1);
    expect(pushed[0]).toEqual({
      name: "proto-render",
      payload: {
        draw: [{ dt: [0, 7, "Hi", "#FFFFFF"] }],
      },
    });

    await handle.unmount();
    await waitFor(() => deleted.length === 1);
    expect(deleted).toEqual(["proto-render"]);
  });

  test("notify uses provided protocol", async () => {
    const notifications: AwtrixPayload[] = [];

    const protocol: AwtrixProtocol = {
      kind: "mock",
      key: "mock:notify",
      pushApp: async (_name, _payload) => {},
      deleteApp: async (_name) => {},
      pushNotify: async (payload) => {
        notifications.push(payload);
      },
    };

    await notify(
      <AwtrixApp text="Alert">
        <AwtrixText x={0} y={7} color="#FFFFFF">
          Yo
        </AwtrixText>
      </AwtrixApp>,
      { protocol },
    );

    expect(notifications).toEqual([
      {
        text: "Alert",
        draw: [{ dt: [0, 7, "Yo", "#FFFFFF"] }],
      },
    ]);
  });
});
