import { afterEach, describe, expect, test } from "bun:test";
import { AwtrixApp, AwtrixText } from "../components.tsx";
import { createRuntime } from "../runtime.ts";
import { createVirtualAwtrixDevice, type VirtualAwtrixDevice } from "../test/virtual-device.ts";
import type { Runtime } from "../types.ts";

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
    expect(context.runtime.apps().sort()).toEqual(["clock", "weather"]);
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
});
