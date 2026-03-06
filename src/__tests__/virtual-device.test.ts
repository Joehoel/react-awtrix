import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createVirtualAwtrixDevice, type VirtualAwtrixDevice } from "../test/virtual-device.ts";

async function post(device: VirtualAwtrixDevice, path: string, body?: string): Promise<Response> {
  return fetch(`${device.url}${path}`, {
    method: "POST",
    body,
  });
}

async function get(device: VirtualAwtrixDevice, path: string): Promise<Response> {
  return fetch(`${device.url}${path}`, {
    method: "GET",
  });
}

async function readJson(response: Response): Promise<unknown> {
  const value: unknown = await response.json();
  return value;
}

describe("virtual Awtrix device", () => {
  let device: VirtualAwtrixDevice;

  beforeEach(() => {
    device = createVirtualAwtrixDevice();
  });

  afterEach(() => {
    device.stop();
  });

  test("mirrors custom app array naming and prefix deletion", async () => {
    const createResult = await post(
      device,
      "/api/custom?name=test",
      '[{"text":"first"},{"text":"second"}]',
    );

    expect(createResult.status).toBe(200);
    expect(device.getApp("test0")).toEqual({ text: "first" });
    expect(device.getApp("test1")).toEqual({ text: "second" });

    const deleteWithEmptyBodyResult = await post(device, "/api/custom?name=test");
    expect(deleteWithEmptyBodyResult.status).toBe(200);
    expect(device.getApp("test0")).toBeUndefined();
    expect(device.getApp("test1")).toBeUndefined();

    await post(device, "/api/custom?name=again", '[{"text":"keep-0"},{"text":"keep-1"}]');
    expect(device.getApp("again0")).toEqual({ text: "keep-0" });
    expect(device.getApp("again1")).toEqual({ text: "keep-1" });

    const deleteWithObjectResult = await post(device, "/api/custom?name=again", "{}");
    expect(deleteWithObjectResult.status).toBe(200);
    expect(device.getApp("again0")).toBeUndefined();
    expect(device.getApp("again1")).toBeUndefined();
  });

  test("mirrors custom endpoint parse failure response", async () => {
    const result = await post(device, "/api/custom?name=parse-fail", "{");

    expect(result.status).toBe(500);
    expect(await result.text()).toBe("ErrorParsingJson");
  });

  test("mirrors notify stack behavior and clients stripping", async () => {
    const first = await post(device, "/api/notify", '{"text":"A"}');
    expect(first.status).toBe(200);

    const second = await post(device, "/api/notify", '{"text":"B"}');
    expect(second.status).toBe(200);

    const third = await post(
      device,
      "/api/notify",
      '{"text":"C","stack":false,"clients":["192.168.1.10"]}',
    );
    expect(third.status).toBe(200);

    expect(device.getNotificationCount()).toBe(3);
    expect(device.getActiveNotifications()).toEqual([{ text: "C", stack: false }, { text: "B" }]);

    const lastNotification = device.getLastNotification();
    expect(lastNotification).toEqual({ text: "C", stack: false });

    if (lastNotification !== undefined) {
      expect(Object.hasOwn(lastNotification, "clients")).toBe(false);
    }
  });

  test("mirrors notify dismiss endpoint behavior", async () => {
    await post(device, "/api/notify", '{"text":"A"}');
    await post(device, "/api/notify", '{"text":"B"}');

    expect(device.getActiveNotifications()).toEqual([{ text: "A" }, { text: "B" }]);

    const dismissResult = await fetch(`${device.url}/api/notify/dismiss`, { method: "GET" });
    expect(dismissResult.status).toBe(200);
    expect(device.getActiveNotifications()).toEqual([{ text: "B" }]);
  });

  test("mirrors notify endpoint parse failure response", async () => {
    const result = await post(device, "/api/notify", "{");

    expect(result.status).toBe(500);
    expect(await result.text()).toBe("ErrorParsingJson");
  });

  test("mirrors power, sleep, and settings endpoints", async () => {
    expect(device.isMatrixPoweredOn()).toBe(true);

    const powerOff = await post(device, "/api/power", "off");
    expect(powerOff.status).toBe(200);
    expect(device.isMatrixPoweredOn()).toBe(false);

    const powerOn = await post(device, "/api/power", '{"power":true}');
    expect(powerOn.status).toBe(200);
    expect(device.isMatrixPoweredOn()).toBe(true);

    const sleepResult = await post(device, "/api/sleep", '{"sleep":15}');
    expect(sleepResult.status).toBe(200);
    expect(device.isMatrixPoweredOn()).toBe(false);
    expect(device.getSleepSeconds()).toBe(15);

    const settingsPost = await post(
      device,
      "/api/settings",
      '{"BRI":170,"OVERLAY":"rain","MATP":true}',
    );
    expect(settingsPost.status).toBe(200);

    const settingsGet = await get(device, "/api/settings");
    expect(settingsGet.status).toBe(200);
    expect(await readJson(settingsGet)).toMatchObject({
      BRI: 170,
      OVERLAY: "rain",
      MATP: true,
    });
    expect(device.isMatrixPoweredOn()).toBe(true);
  });

  test("mirrors indicator and moodlight parser behavior", async () => {
    const indicatorOn = await post(
      device,
      "/api/indicator1",
      '{"color":[255,0,0],"blink":500,"fade":250}',
    );
    expect(indicatorOn.status).toBe(200);
    expect(device.getIndicatorState(1)).toEqual({
      enabled: true,
      color: [255, 0, 0],
      blinkMs: 500,
      fadeMs: 250,
    });

    const indicatorOff = await post(device, "/api/indicator1", "{}");
    expect(indicatorOff.status).toBe(200);
    expect(device.getIndicatorState(1)).toEqual({
      enabled: false,
      color: [255, 0, 0],
      blinkMs: 0,
      fadeMs: 0,
    });

    const invalidIndicator = await post(device, "/api/indicator2", "{");
    expect(invalidIndicator.status).toBe(500);
    expect(await invalidIndicator.text()).toBe("ErrorParsingJson");

    const moodlightOn = await post(
      device,
      "/api/moodlight",
      '{"brightness":170,"color":"#336699"}',
    );
    expect(moodlightOn.status).toBe(200);
    expect(device.isMoodlightEnabled()).toBe(true);
    expect(device.getMoodlightPayload()).toEqual({ brightness: 170, color: "#336699" });

    const screen = device.getScreen();
    expect(screen.length).toBe(256);
    expect(screen[0]).toBe(0x336699);

    const moodlightOff = await post(device, "/api/moodlight", "");
    expect(moodlightOff.status).toBe(200);
    expect(device.isMoodlightEnabled()).toBe(false);

    const invalidMoodlight = await post(device, "/api/moodlight", "{");
    expect(invalidMoodlight.status).toBe(500);
    expect(await invalidMoodlight.text()).toBe("ErrorParsingJson");
  });

  test("mirrors app loop, apps update, switch, next, previous, and reorder", async () => {
    await post(device, "/api/custom?name=alpha", '{"text":"A","icon":"87"}');
    await post(device, "/api/custom?name=beta", '{"text":"B"}');

    const loopResponse = await get(device, "/api/loop");
    expect(loopResponse.status).toBe(200);
    const loopObject = await readJson(loopResponse);
    expect(loopObject).toMatchObject({
      Time: 0,
      Date: 1,
      Temperature: 2,
      Humidity: 3,
      Battery: 4,
      alpha: 5,
      beta: 6,
    });

    const appsResponse = await get(device, "/api/apps");
    expect(appsResponse.status).toBe(200);
    expect(await readJson(appsResponse)).toEqual([
      { name: "Time" },
      { name: "Date" },
      { name: "Temperature" },
      { name: "Humidity" },
      { name: "Battery" },
      { name: "alpha", icon: "87" },
      { name: "beta" },
    ]);

    const switchOk = await post(device, "/api/switch", '{"name":"beta"}');
    expect(switchOk.status).toBe(200);
    expect(device.getCurrentAppName()).toBe("beta");

    const nextApp = await get(device, "/api/nextapp");
    expect(nextApp.status).toBe(200);
    expect(device.getCurrentAppName()).toBe("Time");

    const previousApp = await post(device, "/api/previousapp", "");
    expect(previousApp.status).toBe(200);
    expect(device.getCurrentAppName()).toBe("beta");

    const hideNative = await post(device, "/api/apps", '{"name":"Time","show":false}');
    expect(hideNative.status).toBe(200);
    expect(device.getAppLoop().includes("Time")).toBe(false);

    const moveNative = await post(device, "/api/apps", '{"name":"Time","show":true,"pos":0}');
    expect(moveNative.status).toBe(200);
    expect(device.getAppLoop()[0]).toBe("Time");

    const reorder = await post(device, "/api/reorder", '["beta","alpha","Time"]');
    expect(reorder.status).toBe(200);
    expect(device.getAppLoop()).toEqual(["beta", "alpha", "Time"]);

    const switchFail = await post(device, "/api/switch", '{"name":"missing"}');
    expect(switchFail.status).toBe(500);
    expect(await switchFail.text()).toBe("FAILED");
  });

  test("mirrors sound, rtttl, r2d2, stats, screen, update, reboot, erase, and resetSettings", async () => {
    const soundFromJson = await post(device, "/api/sound", '{"sound":"alarm"}');
    expect(soundFromJson.status).toBe(200);

    const soundFromRaw = await post(device, "/api/sound", "beep");
    expect(soundFromRaw.status).toBe(200);

    const soundMissing = await post(device, "/api/sound", "{}");
    expect(soundMissing.status).toBe(404);
    expect(await soundMissing.text()).toBe("FileNotFound");
    expect(device.getSoundRequests()).toEqual(["alarm", "beep"]);

    const rtttl = await post(device, "/api/rtttl", "d=4,o=5,b=140:c");
    expect(rtttl.status).toBe(200);
    expect(device.getRtttlRequests()).toEqual(["d=4,o=5,b=140:c"]);

    const r2d2 = await post(device, "/api/r2d2", "left");
    expect(r2d2.status).toBe(200);
    expect(device.getR2D2Requests()).toEqual(["left"]);

    const effects = await get(device, "/api/effects");
    expect(effects.status).toBe(200);
    expect(await readJson(effects)).toContain("Fade");

    const transitions = await get(device, "/api/transitions");
    expect(transitions.status).toBe(200);
    expect(await readJson(transitions)).toContain("Slide");

    const stats = await get(device, "/api/stats");
    expect(stats.status).toBe(200);
    expect(await readJson(stats)).toMatchObject({
      matrix: true,
      version: "virtual-awtrix3",
    });

    const screen = await get(device, "/api/screen");
    expect(screen.status).toBe(200);
    const screenData = await readJson(screen);
    expect(Array.isArray(screenData)).toBe(true);
    if (Array.isArray(screenData)) {
      expect(screenData.length).toBe(256);
    }

    const noUpdate = await post(device, "/api/doupdate", "");
    expect(noUpdate.status).toBe(404);
    expect(await noUpdate.text()).toBe("NoUpdateFound");

    device.setUpdateAvailable(true);

    const withUpdate = await post(device, "/api/doupdate", "");
    expect(withUpdate.status).toBe(200);
    expect(await withUpdate.text()).toBe("OK");

    const reboot = await get(device, "/api/reboot");
    expect(reboot.status).toBe(200);
    expect(device.getRebootCount()).toBe(1);

    await post(device, "/api/custom?name=erase-me", '{"text":"bye"}');
    expect(device.getApp("erase-me")).toEqual({ text: "bye" });

    const resetSettings = await get(device, "/api/resetSettings");
    expect(resetSettings.status).toBe(200);
    expect(device.getResetSettingsCount()).toBe(1);

    const erase = await post(device, "/api/erase", "");
    expect(erase.status).toBe(200);
    expect(device.getEraseCount()).toBe(1);
    expect(device.getApp("erase-me")).toBeUndefined();
  });
});
