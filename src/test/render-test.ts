import type { ReactNode } from "react";
import { notify, render } from "../renderer.ts";
import type { AwtrixPayload, NotifyOptions, RenderHandle, RenderOptions } from "../types.ts";
import { createVirtualAwtrixDevice, type VirtualAwtrixDevice } from "./virtual-device.ts";

export interface RenderTestContextOptions {
  app?: string;
  debounce?: number;
  width?: number;
  height?: number;
  debug?: boolean;
  timeoutMs?: number;
}

export interface RenderAppOptions {
  app?: string;
  debounce?: number;
  width?: number;
  height?: number;
  debug?: boolean;
}

export interface NotifyWithDeviceOptions {
  hold?: boolean;
  sound?: string;
  stack?: boolean;
  wakeup?: boolean;
  width?: number;
  height?: number;
  debug?: boolean;
}

export interface RenderTestContext {
  device: VirtualAwtrixDevice;
  host: string;
  port: number;
  defaultApp: string;
  renderApp: (element: ReactNode, options?: RenderAppOptions) => RenderHandle;
  notifyWithDevice: (element: ReactNode, options?: NotifyWithDeviceOptions) => Promise<void>;
  waitForAppPayload: (appName?: string, timeoutMs?: number) => Promise<AwtrixPayload>;
  waitForAppDeletion: (appName?: string, timeoutMs?: number) => Promise<void>;
  waitForNotification: (timeoutMs?: number) => Promise<AwtrixPayload>;
  teardown: () => Promise<void>;
}

export function createRenderTestContext(options: RenderTestContextOptions = {}): RenderTestContext {
  const device = createVirtualAwtrixDevice();
  const defaultApp = options.app ?? "test-app";
  const defaultDebounce = options.debounce ?? 0;
  const defaultWidth = options.width;
  const defaultHeight = options.height;
  const defaultDebug = options.debug ?? false;
  const defaultTimeoutMs = options.timeoutMs ?? 1000;
  const activeHandles: RenderHandle[] = [];
  let disposed = false;

  function buildRenderOptions(app: string, renderOptions: RenderAppOptions = {}): RenderOptions {
    return {
      host: device.host,
      port: device.port,
      app,
      debounce: renderOptions.debounce ?? defaultDebounce,
      width: renderOptions.width ?? defaultWidth,
      height: renderOptions.height ?? defaultHeight,
      debug: renderOptions.debug ?? defaultDebug,
    };
  }

  function renderApp(element: ReactNode, renderOptions: RenderAppOptions = {}): RenderHandle {
    const app = renderOptions.app ?? defaultApp;
    const handle = render(element, buildRenderOptions(app, renderOptions));

    const trackedHandle: RenderHandle = {
      async unmount() {
        const index = activeHandles.indexOf(trackedHandle);
        if (index !== -1) {
          activeHandles.splice(index, 1);
        }

        await handle.unmount();
      },
    };

    activeHandles.push(trackedHandle);
    return trackedHandle;
  }

  function notifyWithDevice(element: ReactNode, notifyOptions: NotifyWithDeviceOptions = {}): Promise<void> {
    const optionsForNotify: NotifyOptions = {
      host: device.host,
      port: device.port,
      hold: notifyOptions.hold,
      sound: notifyOptions.sound,
      stack: notifyOptions.stack,
      wakeup: notifyOptions.wakeup,
      width: notifyOptions.width ?? defaultWidth,
      height: notifyOptions.height ?? defaultHeight,
      debug: notifyOptions.debug ?? defaultDebug,
    };

    return notify(element, optionsForNotify);
  }

  async function waitForAppPayload(appName = defaultApp, timeoutMs = defaultTimeoutMs): Promise<AwtrixPayload> {
    return device.waitForApp(appName, timeoutMs);
  }

  function waitForAppDeletion(appName = defaultApp, timeoutMs = defaultTimeoutMs): Promise<void> {
    return device.waitForAppDeletion(appName, timeoutMs);
  }

  async function waitForNotification(timeoutMs = defaultTimeoutMs): Promise<AwtrixPayload> {
    await device.waitForNotificationCount(1, timeoutMs);

    const payload = device.getLastNotification();
    if (payload === undefined) {
      throw new Error("Expected notification payload after waiting, but none was found.");
    }

    return payload;
  }

  async function teardown(): Promise<void> {
    if (disposed) {
      return;
    }

    disposed = true;

    const handlesToUnmount = [...activeHandles];
    activeHandles.length = 0;

    for (const handle of handlesToUnmount) {
      await handle.unmount();
    }

    device.stop();
  }

  return {
    device,
    host: device.host,
    port: device.port,
    defaultApp,
    renderApp,
    notifyWithDevice,
    waitForAppPayload,
    waitForAppDeletion,
    waitForNotification,
    teardown,
  };
}
