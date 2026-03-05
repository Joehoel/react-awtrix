import { afterEach, describe, expect, test } from "bun:test";
import { AwtrixApp, AwtrixText } from "../components.tsx";
import { notify } from "../renderer.ts";
import { createRenderTestContext, type RenderTestContext } from "../test/render-test.ts";

describe("notify", () => {
  let context: RenderTestContext | undefined;

  afterEach(async () => {
    if (context !== undefined) {
      await context.teardown();
      context = undefined;
    }
  });

  test("pushes notification payload with notify options", async () => {
    context = createRenderTestContext({ timeoutMs: 1500 });

    await context.notifyWithDevice(
      <AwtrixApp text="Notification">
        <AwtrixText x={0} y={7} color="#FFFFFF">
          Hi
        </AwtrixText>
      </AwtrixApp>,
      {
        hold: true,
        sound: "ding",
        stack: true,
        wakeup: false,
      },
    );

    const payload = await context.waitForNotification();

    expect(payload).toEqual({
      text: "Notification",
      hold: true,
      sound: "ding",
      stack: true,
      wakeup: false,
      draw: [{ dt: [0, 7, "Hi", "#FFFFFF"] }],
    });
  });

  test("rejects when notification cannot be delivered", async () => {
    context = createRenderTestContext({ timeoutMs: 1500 });
    const host = context.host;
    const port = context.port;

    context.device.stop();

    const failedNotify = notify(
      <AwtrixApp text="Should fail">
        <AwtrixText x={0} y={7} color="white">
          Fail
        </AwtrixText>
      </AwtrixApp>,
      {
        host,
        port,
      },
    );

    const originalConsoleError = console.error;
    console.error = (..._args: unknown[]) => {};

    try {
      await expect(failedNotify).rejects.toThrow();
    } finally {
      console.error = originalConsoleError;
    }
  });
});
