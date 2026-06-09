import ReactReconciler from "react-reconciler";
import { ConcurrentRoot } from "react-reconciler/constants.js";
import {
  createElementInstance,
  resolveElementType,
  updateElementInstance,
  validHostElementNames,
} from "./elements.ts";
import { serialize } from "./serialize.ts";
import type { AwtrixContainer, AwtrixInstance, AwtrixNode, AwtrixTextInstance } from "./types.ts";

// ─── Event priority constants (React internals) ───────────────────────────

const DefaultEventPriority = 0b0000000000000000000000000100000; // 32
let currentUpdatePriority = DefaultEventPriority;

interface HostTransitionProvider {
  $$typeof: symbol;
  _context: HostTransitionContext;
}

interface HostTransitionContext {
  $$typeof: symbol;
  Consumer: HostTransitionContext;
  Provider: HostTransitionProvider;
  _currentValue: null;
  _currentValue2: null;
  _threadCount: number;
}

function createHostTransitionContext(): HostTransitionContext {
  let context: HostTransitionContext;

  const provider: HostTransitionProvider = {
    $$typeof: Symbol.for("react.provider"),
    get _context() {
      return context;
    },
  };

  context = {
    $$typeof: Symbol.for("react.context"),
    get Consumer() {
      return context;
    },
    Provider: provider,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0,
  };

  return context;
}

const hostTransitionContext = createHostTransitionContext();

// ─── Flush: serialize instance tree and push to device ─────────────────────

function scheduleFlush(container: AwtrixContainer): void {
  if (container.pendingFlush !== undefined) {
    clearTimeout(container.pendingFlush);
  }

  container.pendingFlush = setTimeout(async () => {
    container.pendingFlush = undefined;

    const payload = serialize(container);

    if (container.debug) {
      console.log(
        `[react-awtrix] ${container.mode === "notify" ? "notify" : container.appName} →`,
        JSON.stringify(payload, null, 2),
      );
    }

    try {
      await container.requestFlush(payload);

      if (container.onFlush !== undefined) {
        container.onFlush();
      }
    } catch (err) {
      console.error("[react-awtrix] Flush failed:", err);

      if (container.onFlushError !== undefined) {
        container.onFlushError(err);
      }
    }
  }, container.debounceMs);
}

// ─── Child list helpers ────────────────────────────────────────────────────

type ChildNode = AwtrixNode;

function removeFromArray(arr: ChildNode[], item: ChildNode): void {
  const idx = arr.indexOf(item);
  if (idx !== -1) arr.splice(idx, 1);
}

function insertBeforeInArray(arr: ChildNode[], item: ChildNode, before: ChildNode): void {
  removeFromArray(arr, item);
  const idx = arr.indexOf(before);
  if (idx === -1) {
    arr.push(item);
  } else {
    arr.splice(idx, 0, item);
  }
}

// ─── Reconciler host config ────────────────────────────────────────────────

const hostConfig: ReactReconciler.HostConfig<
  /* Type             */ string,
  /* Props            */ unknown,
  /* Container       */ AwtrixContainer,
  /* Instance        */ AwtrixInstance,
  /* TextInstance    */ AwtrixTextInstance,
  /* SuspenseInstance */ never,
  /* HydratableInst  */ never,
  /* FormInstance    */ never,
  /* PublicInstance  */ AwtrixNode,
  /* HostContext     */ Record<string, never>,
  /* ChildSet         */ never,
  /* TimeoutHandle   */ ReturnType<typeof setTimeout>,
  /* NoTimeout       */ -1,
  /* TransitionStatus */ null
> = {
  // ── Modes ──────────────────────────────────────────────────────────────

  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,

  // ── Core methods ───────────────────────────────────────────────────────

  createInstance(type, props) {
    const elementType = resolveElementType(type);
    if (elementType === undefined) {
      throw new Error(
        `[react-awtrix] Unknown element <${type}>. ` +
          `Valid elements: ${validHostElementNames().join(", ")}`,
      );
    }

    return createElementInstance(elementType, props);
  },

  createTextInstance(text) {
    return {
      type: "__text",
      value: text,
      hidden: false,
    };
  },

  appendInitialChild(parent, child) {
    parent.children.push(child);
  },

  finalizeInitialChildren() {
    return false;
  },

  shouldSetTextContent() {
    return false;
  },

  getRootHostContext() {
    return {};
  },

  getChildHostContext(parentContext) {
    return parentContext;
  },

  getPublicInstance(instance) {
    return instance;
  },

  prepareForCommit() {
    return null;
  },

  resetAfterCommit(container) {
    scheduleFlush(container);
  },

  preparePortalMount() {},

  // ── Scheduling ─────────────────────────────────────────────────────────

  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,

  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,

  // ── Mutation methods ───────────────────────────────────────────────────

  appendChild(parent, child) {
    removeFromArray(parent.children, child);
    parent.children.push(child);
  },

  appendChildToContainer(container, child) {
    removeFromArray(container.children, child);
    container.children.push(child);
  },

  insertBefore(parent, child, beforeChild) {
    insertBeforeInArray(parent.children, child, beforeChild);
  },

  insertInContainerBefore(container, child, beforeChild) {
    insertBeforeInArray(container.children, child, beforeChild);
  },

  removeChild(parent, child) {
    removeFromArray(parent.children, child);
  },

  removeChildFromContainer(container, child) {
    removeFromArray(container.children, child);
  },

  commitTextUpdate(textInstance, _oldText, newText) {
    textInstance.value = newText;
  },

  commitUpdate(instance, _type, _prevProps, nextProps) {
    updateElementInstance(instance, nextProps);
  },

  resetTextContent() {},

  clearContainer(container) {
    container.children.length = 0;
  },

  hideInstance(instance) {
    instance.hidden = true;
  },

  hideTextInstance(textInstance) {
    textInstance.hidden = true;
  },

  unhideInstance(instance) {
    instance.hidden = false;
  },

  unhideTextInstance(textInstance) {
    textInstance.hidden = false;
  },

  detachDeletedInstance() {},

  // ── Required stubs for React 19 ────────────────────────────────────────

  getInstanceFromNode() {
    return null;
  },

  beforeActiveInstanceBlur() {},
  afterActiveInstanceBlur() {},

  prepareScopeUpdate() {},
  getInstanceFromScope() {
    return null;
  },

  // ── Transition support (React 19) ──────────────────────────────────────

  NotPendingTransition: null,
  HostTransitionContext: hostTransitionContext,

  // ── Event priority (React 19) ──────────────────────────────────────────

  setCurrentUpdatePriority(newPriority: number) {
    currentUpdatePriority = newPriority;
  },

  getCurrentUpdatePriority() {
    return currentUpdatePriority;
  },

  resolveUpdatePriority() {
    return currentUpdatePriority || DefaultEventPriority;
  },

  // ── Form support (React 19) ────────────────────────────────────────────

  resetFormInstance() {},

  // ── Post-paint callback ────────────────────────────────────────────────

  requestPostPaintCallback(callback) {
    queueMicrotask(() => {
      callback(Date.now());
    });
  },

  // ── Eager transition ───────────────────────────────────────────────────

  shouldAttemptEagerTransition() {
    return false;
  },

  // ── Scheduler event tracking ───────────────────────────────────────────

  trackSchedulerEvent() {},

  // ── Event type resolution ──────────────────────────────────────────────

  resolveEventType() {
    return null;
  },

  resolveEventTimeStamp() {
    return Date.now();
  },

  // ── Suspense commit support ────────────────────────────────────────────

  maySuspendCommit() {
    return false;
  },

  preloadInstance() {
    return true;
  },

  startSuspendingCommit() {},

  suspendInstance() {},

  waitForCommitToBeReady() {
    return null;
  },
};

// ─── Create the reconciler ─────────────────────────────────────────────────

export const reconciler = ReactReconciler(hostConfig);

// ─── Root creation helper ──────────────────────────────────────────────────

type ReconcilerRoot = ReturnType<typeof reconciler.createContainer>;

export function createReconcilerRoot(
  container: AwtrixContainer,
  tag: string,
  onUncaughtError?: (error: unknown) => void,
): ReconcilerRoot {
  return reconciler.createContainer(
    container,
    ConcurrentRoot,
    null, // hydration callbacks
    false, // isStrictMode
    null, // concurrentUpdatesByDefaultOverride
    tag, // identifierPrefix
    onUncaughtError ?? ((err) => console.error("[react-awtrix] Uncaught:", err)),
    (err) => console.error("[react-awtrix] Caught:", err),
    (err) => console.error("[react-awtrix] Recoverable:", err),
    () => {}, // onDefaultTransitionIndicator
  );
}
