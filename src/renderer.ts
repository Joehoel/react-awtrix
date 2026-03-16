import type { ReactNode } from "react";
import { resolveProtocol } from "./protocols/resolve.ts";
import { createReconcilerRoot, reconciler } from "./reconciler.ts";
import { DEFAULT_MATRIX_HEIGHT, DEFAULT_MATRIX_WIDTH } from "./types.ts";
import type {
  AwtrixAppContainer,
  AwtrixNotifyContainer,
  NotifyOptions,
  NotifyPayloadOptions,
  RenderHandle,
  RenderOptions,
} from "./types.ts";

function createOperationQueue(): (operation: () => Promise<void>) => Promise<void> {
  let chain: Promise<void> = Promise.resolve();

  return (operation) => {
    const next = chain.then(operation, operation);
    chain = next.then(
      () => undefined,
      () => undefined,
    );

    return next;
  };
}

// ─── render() ──────────────────────────────────────────────────────────────

/**
 * Render a React tree as an Awtrix 3 custom app.
 *
 * Every state change re-renders and pushes the updated display to the device.
 * Returns a handle with `.unmount()` to clean up and delete the app.
 *
 * @example
 * ```tsx
 * import { AwtrixApp, AwtrixText, render } from 'react-awtrix';
 *
 * function App() {
 *   return (
 *     <AwtrixApp icon="1234" duration={10}>
 *       <AwtrixText x={1} y={1} color="#FFFFFF">Hello!</AwtrixText>
 *     </AwtrixApp>
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
  const protocol = resolveProtocol(options);
  const appName = options.app;
  const enqueueOperation = createOperationQueue();
  let disposed = false;
  let deletePromise: Promise<void> | undefined;

  const container: AwtrixAppContainer = {
    appName,
    mode: "app",
    matrixWidth: options.width ?? DEFAULT_MATRIX_WIDTH,
    matrixHeight: options.height ?? DEFAULT_MATRIX_HEIGHT,
    children: [],
    debug: options.debug ?? false,
    debounceMs: options.debounce ?? 50,
    requestFlush: async (payload) => {
      if (disposed) {
        return;
      }

      await enqueueOperation(async () => {
        if (disposed) {
          return;
        }

        await protocol.pushApp(appName, payload);
      });
    },
    requestDelete: () => {
      if (deletePromise !== undefined) {
        return deletePromise;
      }

      disposed = true;
      deletePromise = enqueueOperation(async () => {
        await protocol.deleteApp(appName);
      });

      return deletePromise;
    },
  };

  const root = createReconcilerRoot(container, "awtrix");

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
        await container.requestDelete();
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
 * import { AwtrixText, notify } from 'react-awtrix';
 *
 * await notify(
 *   <AwtrixText x={0} y={0} color="#FF0000">Alert!</AwtrixText>,
 *   { host: '192.168.1.100', hold: true }
 * );
 * ```
 */
const DEFAULT_NOTIFY_TIMEOUT = 5000;

export function notify(element: ReactNode, options: NotifyOptions): Promise<void> {
  const protocol = resolveProtocol(options);
  const timeoutMs = options.timeout ?? DEFAULT_NOTIFY_TIMEOUT;

  const notifyPayloadOptions: NotifyPayloadOptions = {
    hold: options.hold,
    sound: options.sound,
    stack: options.stack,
    wakeup: options.wakeup,
  };

  return new Promise((resolve, reject) => {
    let completed = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let root: ReturnType<typeof createReconcilerRoot> | undefined;

    const cleanup = (): void => {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
    };

    const container: AwtrixNotifyContainer = {
      appName: "__notify",
      mode: "notify",
      notifyOptions: notifyPayloadOptions,
      matrixWidth: options.width ?? DEFAULT_MATRIX_WIDTH,
      matrixHeight: options.height ?? DEFAULT_MATRIX_HEIGHT,
      children: [],
      debug: options.debug ?? false,
      debounceMs: 0, // notifications flush immediately
      onFlush() {
        if (completed) return;
        completed = true;
        cleanup();
        resolve();
      },
      onFlushError(error) {
        if (completed) return;
        completed = true;
        cleanup();
        reject(error);
      },
      requestFlush: async (payload) => {
        await protocol.pushNotify(payload);
      },
    };

    root = createReconcilerRoot(container, "awtrix-notify", (err) => {
      console.error("[react-awtrix] Uncaught:", err);
      if (!completed) {
        completed = true;
        cleanup();
        reject(err);
      }
    });

    timeoutHandle = setTimeout(() => {
      if (completed) return;
      completed = true;

      // Clean up the React root
      if (root !== undefined) {
        reconciler.updateContainer(null, root, null, null);
      }

      // Cancel any pending flush
      if (container.pendingFlush !== undefined) {
        clearTimeout(container.pendingFlush);
        container.pendingFlush = undefined;
      }

      reject(
        new Error(
          `[react-awtrix] notify() timed out after ${timeoutMs}ms — did the component render anything?`,
        ),
      );
    }, timeoutMs);

    reconciler.updateContainer(element, root, null, null);
  });
}
