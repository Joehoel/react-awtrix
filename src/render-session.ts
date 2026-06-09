import type { ReactNode } from "react";
import { createReconcilerRoot, reconciler } from "./reconciler.ts";
import { DEFAULT_MATRIX_HEIGHT, DEFAULT_MATRIX_WIDTH } from "./display.ts";
import type { AwtrixPayload, NotifyPayloadOptions } from "./payload.ts";
import type { AwtrixAppContainer, AwtrixNotifyContainer } from "./render-tree.ts";

export interface RenderSession {
  update(element: ReactNode): void;
  unmount(): void;
  cancelPendingFlush(): void;
}

export interface AppRenderSession extends Omit<RenderSession, "unmount"> {
  unmount(options?: { deleteOnDevice?: boolean }): Promise<void>;
}

export interface AppRenderSessionOptions {
  appName: string;
  identifierPrefix: string;
  width?: number;
  height?: number;
  debug?: boolean;
  debounceMs?: number;
  requestFlush: (payload: AwtrixPayload) => Promise<void>;
  requestDelete: () => Promise<void>;
  onError?: (error: unknown) => void;
}

export interface NotifyRenderSessionOptions {
  width?: number;
  height?: number;
  debug?: boolean;
  notifyOptions?: NotifyPayloadOptions;
  requestFlush: (payload: AwtrixPayload) => Promise<void>;
  onFlush?: () => void;
  onFlushError?: (error: unknown) => void;
  onError?: (error: unknown) => void;
}

function createBaseRenderSession(
  container: AwtrixAppContainer | AwtrixNotifyContainer,
  identifierPrefix: string,
  onError: ((error: unknown) => void) | undefined,
): RenderSession {
  let disposed = false;
  const root = createReconcilerRoot(container, identifierPrefix, onError);

  function cancelPendingFlush(): void {
    if (container.pendingFlush !== undefined) {
      clearTimeout(container.pendingFlush);
      container.pendingFlush = undefined;
    }
  }

  return {
    update(element) {
      if (disposed) {
        return;
      }

      reconciler.updateContainer(element, root, null, null);
    },

    unmount() {
      if (disposed) {
        return;
      }

      disposed = true;
      reconciler.updateContainer(null, root, null, null);
      cancelPendingFlush();
    },

    cancelPendingFlush,
  };
}

export function createAppRenderSession(options: AppRenderSessionOptions): AppRenderSession {
  let disposed = false;
  let unmountPromise: Promise<void> | undefined;
  let deletePromise: Promise<void> | undefined;

  const container: AwtrixAppContainer = {
    appName: options.appName,
    mode: "app",
    matrixWidth: options.width ?? DEFAULT_MATRIX_WIDTH,
    matrixHeight: options.height ?? DEFAULT_MATRIX_HEIGHT,
    children: [],
    debug: options.debug ?? false,
    debounceMs: options.debounceMs ?? 50,
    requestFlush: async (payload) => {
      if (disposed) {
        return;
      }

      await options.requestFlush(payload);
    },
    requestDelete: () => {
      if (deletePromise !== undefined) {
        return deletePromise;
      }

      deletePromise = options.requestDelete();
      return deletePromise;
    },
  };

  const session = createBaseRenderSession(container, options.identifierPrefix, options.onError);

  return {
    update(element) {
      if (disposed) {
        return;
      }

      session.update(element);
    },

    unmount(unmountOptions = {}) {
      if (unmountPromise !== undefined) {
        return unmountPromise;
      }

      unmountPromise = (async () => {
        disposed = true;
        session.unmount();

        if (unmountOptions.deleteOnDevice !== false) {
          await container.requestDelete();
        }
      })();

      return unmountPromise;
    },

    cancelPendingFlush: session.cancelPendingFlush,
  };
}

export function createNotifyRenderSession(options: NotifyRenderSessionOptions): RenderSession {
  let disposed = false;

  const container: AwtrixNotifyContainer = {
    appName: "__notify",
    mode: "notify",
    notifyOptions: options.notifyOptions,
    matrixWidth: options.width ?? DEFAULT_MATRIX_WIDTH,
    matrixHeight: options.height ?? DEFAULT_MATRIX_HEIGHT,
    children: [],
    debug: options.debug ?? false,
    debounceMs: 0,
    onFlush: options.onFlush,
    onFlushError: options.onFlushError,
    requestFlush: async (payload) => {
      if (disposed) {
        return;
      }

      await options.requestFlush(payload);
    },
  };

  const session = createBaseRenderSession(container, "awtrix-notify", options.onError);

  return {
    update(element) {
      if (disposed) {
        return;
      }

      session.update(element);
    },

    unmount() {
      if (disposed) {
        return;
      }

      disposed = true;
      session.unmount();
    },

    cancelPendingFlush: session.cancelPendingFlush,
  };
}
