import type { ReactNode } from "react";
import { createReconcilerRoot, reconciler } from "./reconciler.ts";
import { DEFAULT_MATRIX_HEIGHT, DEFAULT_MATRIX_WIDTH } from "./types.ts";
import type { AwtrixAppContainer, AwtrixPayload } from "./types.ts";

export interface AppRenderSession {
  update(element: ReactNode): void;
  unmount(options?: { deleteOnDevice?: boolean }): Promise<void>;
  cancelPendingFlush(): void;
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

  const root = createReconcilerRoot(container, options.identifierPrefix, options.onError);

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

    unmount(unmountOptions = {}) {
      if (unmountPromise !== undefined) {
        return unmountPromise;
      }

      unmountPromise = (async () => {
        disposed = true;
        reconciler.updateContainer(null, root, null, null);
        cancelPendingFlush();

        if (unmountOptions.deleteOnDevice !== false) {
          await container.requestDelete();
        }
      })();

      return unmountPromise;
    },

    cancelPendingFlush,
  };
}
