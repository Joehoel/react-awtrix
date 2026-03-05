# Multi-App Runtime + HMR Plan

## Goal

Design `react-awtrix` to run as a single long-running process that manages multiple JSX apps on one Awtrix device, while also supporting `bun --hot` re-evaluation without leaking roots/timers.

## Priorities

1. Multi-app server runtime (primary)
2. HMR support (secondary, integrated into the same runtime design)

## Core Decisions

- Add a new `createRuntime()` API as the primary multi-app entry point
- Keep existing `render()` API for simple single-app usage
- Use one independent reconciler root per app name
- Add a runtime-level device transport queue for serialized flushes
- Reuse runtime across hot reloads via a `globalThis` registry
- Auto-prune stale apps during HMR when app registrations disappear
- Keep per-app error isolation (one app failure should not crash others)

## Proposed Public API

```ts
interface RuntimeOptions {
  host: string;
  port?: number;
  debug?: boolean;
  debounce?: number;
  width?: number;
  height?: number;
  hmr?: boolean;
  onError?: (appName: string, error: unknown) => void;
}

interface AppHandle {
  update(element: ReactNode): void;
  unmount(): Promise<void>;
}

interface Runtime {
  app(name: string, element: ReactNode): AppHandle;
  remove(name: string): Promise<void>;
  dispose(): Promise<void>;
  apps(): string[];
  handleSignals(): void;
}

declare function createRuntime(options: RuntimeOptions): Runtime;
```

## Transport Queue Design

Runtime owns a single queue per device (`host:port`) with:

- concurrency `= 1`
- latest-write-wins coalescing by app name
- optional short minimum interval between sends
- graceful disposal

This protects ESP32 HTTP handling when multiple apps flush near-simultaneously.

## HMR Design

- Store runtimes in `globalThis` keyed by `host:port`
- On `bun --hot` re-evaluation, `createRuntime()` returns the existing runtime
- `runtime.app(name, element)` upserts: existing app roots call `updateContainer()`
- Track app names seen in the current evaluation cycle
- After the cycle (microtask), auto-remove apps that were previously present but not re-registered
- Use generation-safe app handles so stale handles from old module evaluations cannot unmount fresh app roots

## Backward Compatibility

- Keep `render()` and `notify()` behavior intact
- Additive API only: export `createRuntime()` and runtime types
- Existing tests should continue to pass after changes

## Implementation Phases (TDD)

1. Add transport queue tests
2. Implement `src/transport.ts`
3. Add runtime tests for multi-app lifecycle and upsert behavior
4. Implement `src/runtime.ts` and new runtime types
5. Wire `reconciler` flush path to optional runtime transport callback
6. Add HMR tests and implement global registry + stale app pruning
7. Fix `deleteApp` body behavior in `src/client.ts`
8. Export runtime API and add multi-app example
9. Run full `bun test` and `bun run typecheck`

## Validation Checklist

- Multiple apps can run in one process and each updates independently
- Removing one app does not affect others
- `dispose()` cleans up all app roots and deletes all apps
- Running with `bun --hot` does not duplicate apps or leak timers
- Removing an app registration line during HMR deletes the stale app
- Existing single-app examples keep working with `render()`
