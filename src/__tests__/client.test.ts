import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { deleteApp, pushApp, pushNotify } from "../client.ts";
import { createVirtualAwtrixDevice, type VirtualAwtrixDevice } from "../test/virtual-device.ts";

describe("client", () => {
  let device: VirtualAwtrixDevice;

  beforeEach(() => {
    device = createVirtualAwtrixDevice();
  });

  afterEach(() => {
    device.stop();
  });

  test("pushApp sends payload to custom app endpoint", async () => {
    await pushApp(device.host, device.port, "unit-client", {
      text: "Hello",
      draw: [{ dt: [0, 7, "HI", "#FFFFFF"] }],
    });

    const payload = await device.waitForApp("unit-client");
    expect(payload).toEqual({
      text: "Hello",
      draw: [{ dt: [0, 7, "HI", "#FFFFFF"] }],
    });
  });

  test("deleteApp removes app from device state", async () => {
    await pushApp(device.host, device.port, "delete-target", { text: "To delete" });
    await device.waitForApp("delete-target");

    await deleteApp(device.host, device.port, "delete-target");
    await device.waitForAppDeletion("delete-target");

    expect(device.getApp("delete-target")).toBeUndefined();
    expect(device.getCustomRequestCount()).toBe(2);
  });

  test("pushNotify sends payload to notify endpoint", async () => {
    await pushNotify(device.host, device.port, {
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
