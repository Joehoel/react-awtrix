import { afterEach, describe, expect, test } from "bun:test";
import { AwtrixApp, AwtrixText } from "../components.tsx";
import { http } from "../protocols/http.ts";
import { createRuntime } from "../runtime.ts";
import { createVirtualAwtrixDevice, type VirtualAwtrixDevice } from "../test/virtual-device.ts";
import type { Runtime } from "../types.ts";

interface HmrTestContext {
  device: VirtualAwtrixDevice;
  runtime: Runtime;
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

describe("runtime HMR", () => {
  let context: HmrTestContext | undefined;

  afterEach(async () => {
    if (context === undefined) {
      Reflect.deleteProperty(globalThis, "__react_awtrix_runtime_registry__");
      return;
    }

    await context.runtime.dispose();
    context.device.stop();
    context = undefined;
    Reflect.deleteProperty(globalThis, "__react_awtrix_runtime_registry__");
  });

  test("reuses runtime instance across createRuntime calls", () => {
    const device = createVirtualAwtrixDevice();
    const options = {
      host: device.host,
      port: device.port,
      debounce: 0,
      hmr: true,
    };

    const first = createRuntime(options);
    const second = createRuntime(options);

    context = {
      device,
      runtime: first,
    };

    expect(second).toBe(first);
  });

  test("prunes stale apps after HMR re-registration pass", async () => {
    const device = createVirtualAwtrixDevice();
    const options = {
      host: device.host,
      port: device.port,
      debounce: 0,
      hmr: true,
    };

    const firstRuntime = createRuntime(options);
    context = {
      device,
      runtime: firstRuntime,
    };

    firstRuntime.app("clock", appWithText("OLD-CLOCK"));
    firstRuntime.app("weather", appWithText("WX"));
    await device.waitForCustomRequestCount(2, 2000);

    const secondRuntime = createRuntime(options);
    secondRuntime.app("clock", appWithText("NEW-CLOCK"));

    await device.waitForCustomRequestCount(4, 2000);
    await device.waitForAppDeletion("weather", 2000);

    const requestSequence = device
      .getCustomRequests()
      .map((request) => `${request.name}:${request.deleted ? "delete" : "push"}`);
    expect(requestSequence).toEqual(["clock:push", "weather:push", "weather:delete", "clock:push"]);

    const clockPayload = await device.waitForApp("clock", 2000);
    expect(clockPayload.draw).toEqual([{ dt: [0, 0, "NEW-CLOCK", "#FFFFFF"] }]);
    expect(secondRuntime.apps()).toEqual(["clock"]);
  });

  test("creates a fresh runtime for a new module instance in hmr mode", async () => {
    const device = createVirtualAwtrixDevice();
    const options = {
      host: device.host,
      port: device.port,
      debounce: 0,
      hmr: true,
    };

    const moduleA = await import(`../runtime.ts?module-a-${Date.now()}`);
    const runtimeA = moduleA.createRuntime(options);

    runtimeA.app("clock", appWithText("OLD-CLOCK"));
    runtimeA.app("weather", appWithText("WX"));
    await device.waitForCustomRequestCount(2, 2000);

    const moduleB = await import(`../runtime.ts?module-b-${Date.now()}`);
    const runtimeB = moduleB.createRuntime(options);

    context = {
      device,
      runtime: runtimeB,
    };

    runtimeB.app("clock", appWithText("NEW-CLOCK"));
    await device.waitForCustomRequestCount(4, 2000);
    await device.waitForAppDeletion("weather", 2000);

    expect(runtimeB).not.toBe(runtimeA);

    const clockPayload = await device.waitForApp("clock", 2000);
    expect(clockPayload.draw).toEqual([{ dt: [0, 0, "NEW-CLOCK", "#FFFFFF"] }]);
  });

  test("replaces legacy runtime entries that do not implement owner methods", async () => {
    const device = createVirtualAwtrixDevice();
    const options = {
      host: device.host,
      port: device.port,
      debounce: 0,
      hmr: true,
    };

    let legacyDisposeCalls = 0;
    const legacyRuntime = {
      isDisposed() {
        return false;
      },
      shouldUseHmr() {
        return true;
      },
      applyOptions() {},
      startHmrPass() {},
      async dispose() {
        legacyDisposeCalls += 1;
      },
    };

    const legacyKey = http({ host: device.host, port: device.port }).key;
    const legacyRegistry = new Map<string, unknown>([[legacyKey, legacyRuntime]]);
    Reflect.set(globalThis, "__react_awtrix_runtime_registry__", legacyRegistry);

    const runtime = createRuntime(options);
    context = {
      device,
      runtime,
    };

    runtime.app("clock", appWithText("NEW-CLOCK"));
    const clockPayload = await device.waitForApp("clock", 2000);

    expect(legacyDisposeCalls).toBe(1);
    expect(clockPayload.draw).toEqual([{ dt: [0, 0, "NEW-CLOCK", "#FFFFFF"] }]);
  });
});
