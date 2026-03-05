import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { http } from "../protocols/http.ts";
import { createVirtualAwtrixDevice, type VirtualAwtrixDevice } from "../test/virtual-device.ts";

describe("http protocol", () => {
  let device: VirtualAwtrixDevice;

  beforeEach(() => {
    device = createVirtualAwtrixDevice();
  });

  afterEach(() => {
    device.stop();
  });

  test("exposes stable kind and key", () => {
    const protocol = http({ host: device.host, port: device.port });

    expect(protocol.kind).toBe("http");
    expect(protocol.key).toBe(`http:${device.host}:${device.port}`);
  });

  test("pushApp sends payload to custom app endpoint", async () => {
    const protocol = http({ host: device.host, port: device.port });

    await protocol.pushApp("unit-http", {
      text: "Hello",
      draw: [{ dt: [0, 7, "HI", "#FFFFFF"] }],
    });

    const payload = await device.waitForApp("unit-http");
    expect(payload).toEqual({
      text: "Hello",
      draw: [{ dt: [0, 7, "HI", "#FFFFFF"] }],
    });
  });

  test("deleteApp removes app from device state", async () => {
    const protocol = http({ host: device.host, port: device.port });

    await protocol.pushApp("delete-target", { text: "To delete" });
    await device.waitForApp("delete-target");

    await protocol.deleteApp("delete-target");
    await device.waitForAppDeletion("delete-target");

    expect(device.getApp("delete-target")).toBeUndefined();
    expect(device.getCustomRequestCount()).toBe(2);
  });

  test("pushNotify sends payload to notify endpoint", async () => {
    const protocol = http({ host: device.host, port: device.port });

    await protocol.pushNotify({
      hold: true,
      sound: "beep",
      draw: [{ dp: [1, 1, "#00FF00"] }],
    });

    await device.waitForNotificationCount(1);

    expect(device.getLastNotification()).toEqual({
      hold: true,
      sound: "beep",
      draw: [{ dp: [1, 1, "#00FF00"] }],
    });
  });
});
