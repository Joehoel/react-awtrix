import type { ReactNode } from "react";
import { ConcurrentRoot } from "react-reconciler/constants.js";
import { reconciler } from "./reconciler.ts";
import { DEFAULT_MATRIX_HEIGHT, DEFAULT_MATRIX_WIDTH } from "./types.ts";
import { DeviceTransport } from "./transport.ts";
import type {
  AppHandle,
  AwtrixAppContainer,
  AwtrixContainer,
  Runtime,
  RuntimeOptions,
} from "./types.ts";

type RuntimeRoot = ReturnType<typeof reconciler.createContainer>;
const moduleRuntimeOwner = Symbol("react-awtrix-runtime-owner");

interface RuntimeAppEntry {
  name: string;
  root: RuntimeRoot;
  container: AwtrixAppContainer;
  generation: number;
}

declare global {
  var __react_awtrix_runtime_registry__: Map<string, AwtrixRuntimeImpl> | undefined;
}

function runtimeRegistry(): Map<string, AwtrixRuntimeImpl> {
  if (globalThis.__react_awtrix_runtime_registry__ === undefined) {
    globalThis.__react_awtrix_runtime_registry__ = new Map();
  }

  return globalThis.__react_awtrix_runtime_registry__;
}

function runtimeKey(host: string, port: number): string {
  return `${host}:${port}`;
}

class AwtrixRuntimeImpl implements Runtime {
  private readonly host: string;
  private readonly port: number;
  private readonly transport: DeviceTransport;
  private readonly entries = new Map<string, RuntimeAppEntry>();
  private readonly registry: Map<string, AwtrixRuntimeImpl>;
  private readonly registryKey: string;
  private readonly owner: symbol;

  private disposed = false;
  private signalsRegistered = false;
  private signalHandler: (() => void) | undefined;
  private hmrSeenApps: Set<string> | undefined;
  private hmrCarryoverApps: Set<string> | undefined;
  private hmrPruneScheduled = false;

  private debug = false;
  private debounceMs = 50;
  private matrixWidth = DEFAULT_MATRIX_WIDTH;
  private matrixHeight = DEFAULT_MATRIX_HEIGHT;
  private hmrEnabled = false;
  private onError: ((appName: string, error: unknown) => void) | undefined;

  constructor(options: RuntimeOptions, registry: Map<string, AwtrixRuntimeImpl>, key: string, owner: symbol) {
    this.host = options.host;
    this.port = options.port ?? 80;
    this.registry = registry;
    this.registryKey = key;
    this.owner = owner;
    this.transport = new DeviceTransport({
      host: this.host,
      port: this.port,
      minIntervalMs: 0,
    });

    this.applyOptions(options);
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  applyOptions(options: RuntimeOptions): void {
    this.debug = options.debug ?? false;
    this.debounceMs = options.debounce ?? 50;
    this.matrixWidth = options.width ?? DEFAULT_MATRIX_WIDTH;
    this.matrixHeight = options.height ?? DEFAULT_MATRIX_HEIGHT;

    if (options.hmr !== undefined) {
      this.hmrEnabled = options.hmr;
    }

    this.onError = options.onError;
  }

  shouldUseHmr(): boolean {
    return this.hmrEnabled;
  }

  owns(owner: symbol): boolean {
    return this.owner === owner;
  }

  setHmrCarryover(appNames: string[]): void {
    if (appNames.length === 0) {
      this.hmrCarryoverApps = undefined;
      return;
    }

    this.hmrCarryoverApps = new Set(appNames);
  }

  startHmrPass(): void {
    if (this.disposed) {
      return;
    }

    if (this.hmrSeenApps === undefined) {
      this.hmrSeenApps = new Set();
    }

    if (this.hmrPruneScheduled) {
      return;
    }

    this.hmrPruneScheduled = true;
    queueMicrotask(() => {
      this.hmrPruneScheduled = false;

      const seenApps = this.hmrSeenApps;
      this.hmrSeenApps = undefined;

      if (seenApps === undefined || this.disposed) {
        return;
      }

      const staleNames: string[] = [];

      if (this.hmrCarryoverApps !== undefined) {
        for (const appName of this.hmrCarryoverApps) {
          if (!seenApps.has(appName)) {
            staleNames.push(appName);
          }
        }

        this.hmrCarryoverApps = undefined;
        void this.pruneStaleApps(staleNames);
        return;
      }

      for (const appName of this.entries.keys()) {
        if (!seenApps.has(appName)) {
          staleNames.push(appName);
        }
      }

      void this.pruneStaleApps(staleNames);
    });
  }

  app(name: string, element: ReactNode): AppHandle {
    if (this.disposed) {
      throw new Error("[react-awtrix] Cannot register app on a disposed runtime.");
    }

    if (this.hmrSeenApps !== undefined) {
      this.hmrSeenApps.add(name);
    }

    const existingEntry = this.entries.get(name);
    if (existingEntry === undefined) {
      const container = this.createContainer(name);
      const root = this.createRoot(name, container);
      const nextEntry: RuntimeAppEntry = {
        name,
        root,
        container,
        generation: 1,
      };

      this.entries.set(name, nextEntry);
      reconciler.updateContainer(element, root, null, null);
      return this.createHandle(name, nextEntry.generation);
    }

    existingEntry.generation += 1;
    reconciler.updateContainer(element, existingEntry.root, null, null);
    return this.createHandle(name, existingEntry.generation);
  }

  async remove(name: string): Promise<void> {
    if (this.disposed) {
      return;
    }

    const entry = this.entries.get(name);
    if (entry === undefined) {
      return;
    }

    this.entries.delete(name);

    try {
      await this.teardownEntry(entry, true);
    } catch (error) {
      this.reportError(name, error);
      throw error;
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.unregisterSignals();

    const entriesToRemove = [...this.entries.values()];
    this.entries.clear();

    for (const entry of entriesToRemove) {
      try {
        await this.teardownEntry(entry, true);
      } catch (error) {
        this.reportError(entry.name, error);
      }
    }

    this.transport.dispose();
    this.hmrSeenApps = undefined;

    const currentRegistryEntry = this.registry.get(this.registryKey);
    if (currentRegistryEntry === this) {
      this.registry.delete(this.registryKey);
    }
  }

  hotHandoff(): string[] {
    if (this.disposed) {
      return [];
    }

    this.disposed = true;
    this.unregisterSignals();

    const carryoverApps = [...this.entries.keys()];
    const entriesToUnmount = [...this.entries.values()];
    this.entries.clear();

    for (const entry of entriesToUnmount) {
      reconciler.updateContainer(null, entry.root, null, null);

      if (entry.container.pendingFlush !== undefined) {
        clearTimeout(entry.container.pendingFlush);
        entry.container.pendingFlush = undefined;
      }
    }

    this.transport.dispose();
    this.hmrSeenApps = undefined;
    this.hmrCarryoverApps = undefined;

    const currentRegistryEntry = this.registry.get(this.registryKey);
    if (currentRegistryEntry === this) {
      this.registry.delete(this.registryKey);
    }

    return carryoverApps;
  }

  apps(): string[] {
    return [...this.entries.keys()];
  }

  handleSignals(): void {
    if (this.signalsRegistered) {
      return;
    }

    const handler = (): void => {
      void this.dispose().then(() => {
        process.exit(0);
      });
    };

    process.on("SIGINT", handler);
    process.on("SIGTERM", handler);

    this.signalHandler = handler;
    this.signalsRegistered = true;
  }

  private createContainer(name: string): AwtrixAppContainer {
    return {
      host: this.host,
      port: this.port,
      appName: name,
      mode: "app",
      matrixWidth: this.matrixWidth,
      matrixHeight: this.matrixHeight,
      children: [],
      debug: this.debug,
      debounceMs: this.debounceMs,
      requestFlush: async (payload) => {
        if (this.disposed || !this.entries.has(name)) {
          return;
        }

        await this.transport.enqueuePush(name, payload);
      },
      requestDelete: async () => {
        await this.transport.enqueueDelete(name);
      },
    };
  }

  private createRoot(name: string, container: AwtrixContainer): RuntimeRoot {
    return reconciler.createContainer(
      container,
      ConcurrentRoot,
      null,
      false,
      null,
      `awtrix-runtime-${name}`,
      (error) => this.reportError(name, error),
      (error) => this.reportError(name, error),
      (error) => this.reportError(name, error),
      () => {},
    );
  }

  private createHandle(name: string, generation: number): AppHandle {
    return {
      update: (element) => {
        if (this.disposed) {
          return;
        }

        const entry = this.entries.get(name);
        if (entry === undefined || entry.generation !== generation) {
          return;
        }

        reconciler.updateContainer(element, entry.root, null, null);
      },

      unmount: async () => {
        if (this.disposed) {
          return;
        }

        const entry = this.entries.get(name);
        if (entry === undefined || entry.generation !== generation) {
          return;
        }

        await this.remove(name);
      },
    };
  }

  private async teardownEntry(entry: RuntimeAppEntry, deleteOnDevice: boolean): Promise<void> {
    reconciler.updateContainer(null, entry.root, null, null);

    if (entry.container.pendingFlush !== undefined) {
      clearTimeout(entry.container.pendingFlush);
      entry.container.pendingFlush = undefined;
    }

    if (deleteOnDevice) {
      await entry.container.requestDelete();
    }
  }

  private unregisterSignals(): void {
    if (!this.signalsRegistered || this.signalHandler === undefined) {
      return;
    }

    process.off("SIGINT", this.signalHandler);
    process.off("SIGTERM", this.signalHandler);

    this.signalHandler = undefined;
    this.signalsRegistered = false;
  }

  private async pruneStaleApps(names: string[]): Promise<void> {
    for (const name of names) {
      try {
        if (this.entries.has(name)) {
          await this.remove(name);
        } else {
          await this.transport.enqueueDelete(name);
        }
      } catch (error) {
        this.reportError(name, error);
      }
    }
  }

  private reportError(appName: string, error: unknown): void {
    console.error(`[react-awtrix] Runtime app \"${appName}\" error:`, error);

    if (this.onError !== undefined) {
      this.onError(appName, error);
    }
  }
}

export function createRuntime(options: RuntimeOptions): Runtime {
  const host = options.host;
  const port = options.port ?? 80;
  const key = runtimeKey(host, port);
  const registry = runtimeRegistry();

  const existingRuntime = registry.get(key);
  if (existingRuntime !== undefined && !existingRuntime.isDisposed()) {
    const ownsMethod = Reflect.get(existingRuntime, "owns");
    const hotHandoffMethod = Reflect.get(existingRuntime, "hotHandoff");

    if (typeof ownsMethod !== "function" || typeof hotHandoffMethod !== "function") {
      const disposeMethod = Reflect.get(existingRuntime, "dispose");

      if (typeof disposeMethod === "function") {
        try {
          const disposeResult = disposeMethod.call(existingRuntime);

          if (disposeResult instanceof Promise) {
            void disposeResult.catch((error: unknown) => {
              console.error("[react-awtrix] Legacy runtime disposal failed:", error);
            });
          }
        } catch (error) {
          console.error("[react-awtrix] Legacy runtime disposal threw:", error);
        }
      }

      const nextRuntime = new AwtrixRuntimeImpl(options, registry, key, moduleRuntimeOwner);
      registry.set(key, nextRuntime);

      if (options.hmr === true) {
        nextRuntime.startHmrPass();
      }

      return nextRuntime;
    }

    const hmrEnabled = options.hmr === true || existingRuntime.shouldUseHmr();

    if (!existingRuntime.owns(moduleRuntimeOwner)) {
      const carryoverApps = existingRuntime.hotHandoff();
      const nextRuntime = new AwtrixRuntimeImpl(options, registry, key, moduleRuntimeOwner);
      registry.set(key, nextRuntime);

      if (hmrEnabled) {
        nextRuntime.setHmrCarryover(carryoverApps);
        nextRuntime.startHmrPass();
      }

      return nextRuntime;
    }

    existingRuntime.applyOptions(options);

    if (existingRuntime.shouldUseHmr()) {
      existingRuntime.startHmrPass();
    }

    return existingRuntime;
  }

  const runtime = new AwtrixRuntimeImpl(options, registry, key, moduleRuntimeOwner);
  registry.set(key, runtime);
  return runtime;
}
