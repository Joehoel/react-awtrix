import ReactReconciler from "react-reconciler";
import { pushApp, pushNotify } from "./client.ts";
import {
  parseAppProps,
  parseBitmapProps,
  parseCircleProps,
  parseLineProps,
  parsePixelProps,
  parseRectProps,
  parseTextProps,
} from "./props.ts";
import { serialize } from "./serialize.ts";
import type {
  AwtrixContainer,
  AwtrixInstance,
  AwtrixNode,
  AwtrixTextInstance,
  ElementType,
} from "./types.ts";
import { resolveElementType } from "./types.ts";

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
      if (container.requestFlush !== undefined) {
        await container.requestFlush(payload);
      } else if (container.mode === "notify") {
        await pushNotify(container.host, container.port, payload);
      } else {
        await pushApp(container.host, container.port, container.appName, payload);
      }

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
  if (idx !== -1) {
    arr.splice(idx, 0, item);
  } else {
    arr.push(item);
  }
}

// ─── Reconciler host config ────────────────────────────────────────────────

function createAwtrixInstance(type: ElementType, props: unknown): AwtrixInstance {
  if (type === "pixel") {
    return { type: "pixel", props: parsePixelProps(props), children: [], hidden: false };
  }

  if (type === "line") {
    return { type: "line", props: parseLineProps(props), children: [], hidden: false };
  }

  if (type === "rect") {
    return { type: "rect", props: parseRectProps(props), children: [], hidden: false };
  }

  if (type === "circle") {
    return { type: "circle", props: parseCircleProps(props), children: [], hidden: false };
  }

  if (type === "text") {
    return { type: "text", props: parseTextProps(props), children: [], hidden: false };
  }

  if (type === "bitmap") {
    return { type: "bitmap", props: parseBitmapProps(props), children: [], hidden: false };
  }

  return { type: "app", props: parseAppProps(props), children: [], hidden: false };
}

function updateAwtrixInstance(instance: AwtrixInstance, nextProps: unknown): void {
  if (instance.type === "pixel") {
    instance.props = parsePixelProps(nextProps);
    return;
  }

  if (instance.type === "line") {
    instance.props = parseLineProps(nextProps);
    return;
  }

  if (instance.type === "rect") {
    instance.props = parseRectProps(nextProps);
    return;
  }

  if (instance.type === "circle") {
    instance.props = parseCircleProps(nextProps);
    return;
  }

  if (instance.type === "text") {
    instance.props = parseTextProps(nextProps);
    return;
  }

  if (instance.type === "bitmap") {
    instance.props = parseBitmapProps(nextProps);
    return;
  }

  instance.props = parseAppProps(nextProps);
}

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
        `Valid elements: awtrix-app, awtrix-pixel, awtrix-line, awtrix-rect, awtrix-circle, awtrix-text, awtrix-bitmap`,
      );
    }

    return createAwtrixInstance(elementType, props);
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
    updateAwtrixInstance(instance, nextProps);
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
