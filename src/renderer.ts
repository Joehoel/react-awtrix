import type { ReactNode } from "react";
import { resolveProtocol } from "./protocols/resolve.ts";
import { createAppRenderSession, createNotifyRenderSession } from "./render-session.ts";
import type { NotifyOptions, RenderHandle, RenderOptions } from "./api.ts";
import type { NotifyPayloadOptions } from "./payload.ts";

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

  const session = createAppRenderSession({
    appName,
    identifierPrefix: "awtrix",
    width: options.width,
    height: options.height,
    debug: options.debug,
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
      disposed = true;
      return enqueueOperation(async () => {
        await protocol.deleteApp(appName);
      });
    },
  });

  session.update(element);

  return {
    async unmount() {
      try {
        await session.unmount();
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

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

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
    let session: ReturnType<typeof createNotifyRenderSession> | undefined;

    const cleanup = (): void => {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
    };

    session = createNotifyRenderSession({
      notifyOptions: notifyPayloadOptions,
      width: options.width,
      height: options.height,
      debug: options.debug,
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
        reject(toError(error));
      },
      requestFlush: async (payload) => {
        await protocol.pushNotify(payload);
      },
      onError(error) {
        console.error("[react-awtrix] Uncaught:", error);
        if (!completed) {
          completed = true;
          cleanup();
          reject(toError(error));
        }
      },
    });

    timeoutHandle = setTimeout(() => {
      if (!completed) {
        completed = true;

        session?.unmount();

        reject(
          new Error(
            `[react-awtrix] notify() timed out after ${timeoutMs}ms — did the component render anything?`,
          ),
        );
      }
    }, timeoutMs);

    session.update(element);
  });
}
