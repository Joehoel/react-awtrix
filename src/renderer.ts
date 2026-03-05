import type { ReactNode } from "react";
import { ConcurrentRoot } from "react-reconciler/constants.js";
import { reconciler } from "./reconciler.ts";
import { deleteApp } from "./client.ts";
import type {
  AwtrixContainer,
  NotifyOptions,
  NotifyPayloadOptions,
  RenderHandle,
  RenderOptions,
} from "./types.ts";

// ─── render() ──────────────────────────────────────────────────────────────

/**
 * Render a React tree as an Awtrix 3 custom app.
 *
 * Every state change re-renders and pushes the updated display to the device.
 * Returns a handle with `.unmount()` to clean up and delete the app.
 *
 * @example
 * ```tsx
 * import { render } from 'react-awtrix';
 *
 * function App() {
 *   return (
 *     <app icon="1234" duration={10}>
 *       <awtrix-text x={1} y={1} color="#FFFFFF">Hello!</awtrix-text>
 *     </app>
 *   );
 * }
 *
 * const handle = render(<App />, {
 *   host: '192.168.1.100',
 *   app: 'hello',
 * });
 *
 * // Later: handle.unmount();
 * ```
 */
export function render(element: ReactNode, options: RenderOptions): RenderHandle {
  const container: AwtrixContainer = {
    host: options.host,
    port: options.port ?? 80,
    appName: options.app,
    mode: "app",
    children: [],
    debug: options.debug ?? false,
    debounceMs: options.debounce ?? 50,
  };

  const root = reconciler.createContainer(
    container,
    ConcurrentRoot,       // tag
    null,                  // hydration callbacks
    false,                 // isStrictMode
    null,                  // concurrentUpdatesByDefaultOverride
    "awtrix",              // identifierPrefix
    (err) => console.error("[react-awtrix] Uncaught:", err),
    (err) => console.error("[react-awtrix] Caught:", err),
    (err) => console.error("[react-awtrix] Recoverable:", err),
    () => {},              // onDefaultTransitionIndicator
  );

  reconciler.updateContainer(element, root, null, null);

  return {
    async unmount() {
      reconciler.updateContainer(null, root, null, null);

      // Clear pending flush
      if (container.pendingFlush !== undefined) {
        clearTimeout(container.pendingFlush);
        container.pendingFlush = undefined;
      }

      // Delete the app from the device
      try {
        await deleteApp(container.host, container.port, container.appName);
      } catch (err) {
        console.error("[react-awtrix] Failed to delete app on unmount:", err);
      }
    },
  };
}

// ─── notify() ──────────────────────────────────────────────────────────────

/**
 * Render a React tree as an Awtrix 3 notification (one-shot).
 *
 * The tree is rendered once and pushed as a notification.
 * Returns a promise that resolves when the notification has been sent.
 *
 * @example
 * ```tsx
 * import { notify } from 'react-awtrix';
 *
 * await notify(
 *   <awtrix-text x={0} y={0} color="#FF0000">Alert!</awtrix-text>,
 *   { host: '192.168.1.100', hold: true }
 * );
 * ```
 */
export function notify(element: ReactNode, options: NotifyOptions): Promise<void> {
  const notifyPayloadOptions: NotifyPayloadOptions = {
    hold: options.hold,
    sound: options.sound,
    stack: options.stack,
    wakeup: options.wakeup,
  };

  return new Promise((resolve, reject) => {
    const container: AwtrixContainer = {
      host: options.host,
      port: options.port ?? 80,
      appName: "__notify",
      mode: "notify",
      notifyOptions: notifyPayloadOptions,
      children: [],
      debug: options.debug ?? false,
      debounceMs: 0, // notifications flush immediately
      onFlush: resolve,
      onFlushError(error) {
        reject(error);
      },
    };

    const root = reconciler.createContainer(
      container,
      ConcurrentRoot,
      null,
      false,
      null,
      "awtrix-notify",
      (err) => { console.error("[react-awtrix] Uncaught:", err); reject(err); },
      (err) => console.error("[react-awtrix] Caught:", err),
      (err) => console.error("[react-awtrix] Recoverable:", err),
      () => {},
    );

    reconciler.updateContainer(element, root, null, null);
  });
}
