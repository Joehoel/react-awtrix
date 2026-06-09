import type { ReactNode } from "react";
import type { AppHandle, Runtime, RuntimeOptions } from "./api.ts";
import { DEFAULT_MATRIX_HEIGHT, DEFAULT_MATRIX_WIDTH } from "./display.ts";
import type { AwtrixProtocol, AwtrixProtocolEventMap } from "./protocol.ts";
import { resolveProtocol } from "./protocols/resolve.ts";
import { createAppRenderSession, type AppRenderSession } from "./render-session.ts";
import { DeviceTransport } from "./transport.ts";

const moduleRuntimeOwner = Symbol("react-awtrix-runtime-owner");

interface RuntimeAppEntry {
  name: string;
  session: AppRenderSession;
  generation: number;
}

declare global {
  var __react_awtrix_runtime_registry__: Map<string, AwtrixRuntimeImpl> | undefined;
}

function runtimeRegistry(): Map<string, AwtrixRuntimeImpl> {
  globalThis.__react_awtrix_runtime_registry__ ??= new Map();

  return globalThis.__react_awtrix_runtime_registry__;
}

function runtimeKey(protocol: AwtrixProtocol): string {
  return protocol.key;
}

class AwtrixRuntimeImpl implements Runtime {
  private readonly protocol: AwtrixProtocol;
  private readonly transport: DeviceTransport;
  private readonly entries = new Map<string, RuntimeAppEntry>();
  private readonly protocolSubscriptions = new Map<
    keyof AwtrixProtocolEventMap,
    Map<unknown, () => void>
  >();
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

  constructor(
    options: RuntimeOptions,
    protocol: AwtrixProtocol,
    registry: Map<string, AwtrixRuntimeImpl>,
    key: string,
    owner: symbol,
  ) {
    this.protocol = protocol;
    this.registry = registry;
    this.registryKey = key;
    this.owner = owner;
    this.transport = new DeviceTransport({
      client: protocol,
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

    this.hmrSeenApps ??= new Set();

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
      const nextEntry: RuntimeAppEntry = {
        name,
        session: this.createSession(name),
        generation: 1,
      };

      this.entries.set(name, nextEntry);
      nextEntry.session.update(element);
      return this.createHandle(name, nextEntry.generation);
    }

    existingEntry.generation += 1;
    existingEntry.session.update(element);
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

    this.clearProtocolSubscriptions();
    this.transport.dispose();

    if (this.protocol.dispose !== undefined) {
      try {
        await this.protocol.dispose();
      } catch (error) {
        console.error("[react-awtrix] Runtime protocol disposal failed:", error);
      }
    }

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
      void entry.session.unmount({ deleteOnDevice: false });
    }

    this.clearProtocolSubscriptions();
    this.transport.dispose();

    if (this.protocol.dispose !== undefined) {
      void this.protocol.dispose().catch((error: unknown) => {
        console.error("[react-awtrix] Runtime protocol disposal failed during hot handoff:", error);
      });
    }

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

  on<K extends keyof AwtrixProtocolEventMap>(
    event: K,
    handler: (payload: AwtrixProtocolEventMap[K]) => void,
  ): void {
    if (this.disposed) {
      throw new Error("[react-awtrix] Cannot subscribe on a disposed runtime.");
    }

    if (this.protocol.on === undefined) {
      throw new Error(
        `[react-awtrix] Protocol "${this.protocol.kind}" does not support subscriptions.`,
      );
    }

    const unsubscribe = this.protocol.on(event, handler);
    let listeners = this.protocolSubscriptions.get(event);

    if (listeners === undefined) {
      listeners = new Map();
      this.protocolSubscriptions.set(event, listeners);
    }

    const existing = listeners.get(handler);
    if (existing !== undefined) {
      existing();
    }

    listeners.set(handler, unsubscribe);
  }

  off<K extends keyof AwtrixProtocolEventMap>(
    event: K,
    handler: (payload: AwtrixProtocolEventMap[K]) => void,
  ): void {
    const listeners = this.protocolSubscriptions.get(event);
    if (listeners === undefined) {
      return;
    }

    const unsubscribe = listeners.get(handler);
    if (unsubscribe === undefined) {
      return;
    }

    listeners.delete(handler);
    unsubscribe();

    if (listeners.size === 0) {
      this.protocolSubscriptions.delete(event);
    }
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

  private createSession(name: string): AppRenderSession {
    return createAppRenderSession({
      appName: name,
      identifierPrefix: `awtrix-runtime-${name}`,
      width: this.matrixWidth,
      height: this.matrixHeight,
      debug: this.debug,
      debounceMs: this.debounceMs,
      onError: (error) => {
        this.reportError(name, error);
      },
      requestFlush: async (payload) => {
        if (this.disposed || !this.entries.has(name)) {
          return;
        }

        await this.transport.enqueuePush(name, payload);
      },
      requestDelete: async () => {
        await this.transport.enqueueDelete(name);
      },
    });
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

        entry.session.update(element);
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
    await entry.session.unmount({ deleteOnDevice });
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

  private clearProtocolSubscriptions(): void {
    for (const listeners of this.protocolSubscriptions.values()) {
      for (const unsubscribe of listeners.values()) {
        unsubscribe();
      }
    }

    this.protocolSubscriptions.clear();
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
    console.error(`[react-awtrix] Runtime app "${appName}" error:`, error);

    if (this.onError !== undefined) {
      this.onError(appName, error);
    }
  }
}

interface LegacyRuntimeLike {
  dispose(): unknown;
}

function hasLegacyDispose(value: unknown): value is LegacyRuntimeLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "dispose" in value &&
    typeof value.dispose === "function"
  );
}

function disposeLegacyRuntime(existingRuntime: unknown): void {
  if (!hasLegacyDispose(existingRuntime)) {
    return;
  }

  try {
    const disposeResult = existingRuntime.dispose();

    if (disposeResult instanceof Promise) {
      void disposeResult.catch((error: unknown) => {
        console.error("[react-awtrix] Legacy runtime disposal failed:", error);
      });
    }
  } catch (error) {
    console.error("[react-awtrix] Legacy runtime disposal threw:", error);
  }
}

export function createRuntime(options: RuntimeOptions): Runtime {
  const protocol = resolveProtocol(options);
  const key = runtimeKey(protocol);
  const registry = runtimeRegistry();

  const existingRuntime = registry.get(key);
  if (existingRuntime !== undefined && !existingRuntime.isDisposed()) {
    const ownsMethod = Reflect.get(existingRuntime, "owns");
    const hotHandoffMethod = Reflect.get(existingRuntime, "hotHandoff");

    if (typeof ownsMethod !== "function" || typeof hotHandoffMethod !== "function") {
      disposeLegacyRuntime(existingRuntime);

      const nextRuntime = new AwtrixRuntimeImpl(
        options,
        protocol,
        registry,
        key,
        moduleRuntimeOwner,
      );
      registry.set(key, nextRuntime);

      if (options.hmr === true) {
        nextRuntime.startHmrPass();
      }

      return nextRuntime;
    }

    const hmrEnabled = options.hmr === true || existingRuntime.shouldUseHmr();

    if (!existingRuntime.owns(moduleRuntimeOwner)) {
      const carryoverApps = existingRuntime.hotHandoff();
      const nextRuntime = new AwtrixRuntimeImpl(
        options,
        protocol,
        registry,
        key,
        moduleRuntimeOwner,
      );
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

  const runtime = new AwtrixRuntimeImpl(options, protocol, registry, key, moduleRuntimeOwner);
  registry.set(key, runtime);
  return runtime;
}
