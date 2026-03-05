import type { ReactNode } from "react";

export type Color = string | [number, number, number];

export const DEFAULT_MATRIX_WIDTH = 32;
export const DEFAULT_MATRIX_HEIGHT = 8;
export const DEFAULT_TEXT_CHAR_WIDTH = 4;

export type Overlay = "clear" | "snow" | "rain" | "drizzle" | "storm" | "thunder" | "frost";
export type TextCase = 0 | 1 | 2;
export type LifetimeMode = 0 | 1;
export type PushIcon = 0 | 1 | 2;

export interface EffectSettings {
  speed?: number;
  palette?: string;
  blend?: boolean;
}

export interface PixelProps {
  x: number;
  y: number;
  color: Color;
}

export interface LineProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: Color;
}

export interface RectProps {
  x: number;
  y: number;
  width: number;
  height: number;
  color: Color;
  filled?: boolean;
}

export interface CircleProps {
  x: number;
  y: number;
  radius: number;
  color: Color;
  filled?: boolean;
}

export interface TextProps {
  x: number;
  y: number;
  color: Color;
  maxWidth?: number;
  charWidth?: number;
}

export interface BitmapProps {
  x: number;
  y: number;
  width: number;
  height: number;
  data: number[];
}

export interface AppProps {
  icon?: string;
  duration?: number;
  lifetime?: number;
  lifetimeMode?: LifetimeMode;
  text?: string;
  textCase?: TextCase;
  topText?: boolean;
  textOffset?: number;
  center?: boolean;
  noScroll?: boolean;
  scrollSpeed?: number;
  background?: Color;
  effect?: string;
  effectSettings?: EffectSettings;
  overlay?: Overlay;
  progress?: number;
  progressC?: Color;
  progressBC?: Color;
  bar?: number[];
  line?: number[];
  rainbow?: boolean;
  pushIcon?: PushIcon;
  repeat?: number;
  save?: boolean;
}

export type ElementType = "pixel" | "line" | "rect" | "circle" | "text" | "bitmap" | "app";

const hostElementTypeMap: Record<string, ElementType> = {
  "awtrix-app": "app",
  "awtrix-pixel": "pixel",
  "awtrix-line": "line",
  "awtrix-rect": "rect",
  "awtrix-circle": "circle",
  "awtrix-text": "text",
  "awtrix-bitmap": "bitmap",
};

export function resolveElementType(value: string): ElementType | undefined {
  return hostElementTypeMap[value];
}

export type DrawCommand =
  | { dp: [x: number, y: number, color: string] }
  | { dl: [x0: number, y0: number, x1: number, y1: number, color: string] }
  | { dr: [x: number, y: number, w: number, h: number, color: string] }
  | { df: [x: number, y: number, w: number, h: number, color: string] }
  | { dc: [x: number, y: number, r: number, color: string] }
  | { dfc: [x: number, y: number, r: number, color: string] }
  | { dt: [x: number, y: number, text: string, color: string] }
  | { db: [x: number, y: number, w: number, h: number, bmp: number[]] };

interface BaseInstance {
  children: AwtrixNode[];
  hidden: boolean;
}

export interface PixelInstance extends BaseInstance {
  type: "pixel";
  props: PixelProps;
}

export interface LineInstance extends BaseInstance {
  type: "line";
  props: LineProps;
}

export interface RectInstance extends BaseInstance {
  type: "rect";
  props: RectProps;
}

export interface CircleInstance extends BaseInstance {
  type: "circle";
  props: CircleProps;
}

export interface TextInstance extends BaseInstance {
  type: "text";
  props: TextProps;
}

export interface BitmapInstance extends BaseInstance {
  type: "bitmap";
  props: BitmapProps;
}

export interface AppInstance extends BaseInstance {
  type: "app";
  props: AppProps;
}

export type AwtrixInstance =
  | PixelInstance
  | LineInstance
  | RectInstance
  | CircleInstance
  | TextInstance
  | BitmapInstance
  | AppInstance;

export interface AwtrixTextInstance {
  type: "__text";
  value: string;
  hidden: boolean;
}

export type AwtrixNode = AwtrixInstance | AwtrixTextInstance;

interface HostConnectionOptions {
  host: string;
  port?: number;
}

interface ProtocolConnectionOptions {
  protocol: AwtrixProtocol;
  host?: never;
  port?: never;
}

type ConnectionOptions = HostConnectionOptions | ProtocolConnectionOptions;

export type RenderOptions = ConnectionOptions & {
  app: string;
  debug?: boolean;
  debounce?: number;
  width?: number;
  height?: number;
};

export type NotifyOptions = ConnectionOptions & {
  hold?: boolean;
  sound?: string;
  stack?: boolean;
  wakeup?: boolean;
  debug?: boolean;
  width?: number;
  height?: number;
};

export interface NotifyPayloadOptions {
  hold?: boolean;
  sound?: string;
  stack?: boolean;
  wakeup?: boolean;
}

export interface RenderHandle {
  unmount(): Promise<void>;
}

export interface AppHandle extends RenderHandle {
  update(element: ReactNode): void;
}

export type RuntimeOptions = ConnectionOptions & {
  debug?: boolean;
  debounce?: number;
  width?: number;
  height?: number;
  hmr?: boolean;
  onError?: (appName: string, error: unknown) => void;
};

export interface Runtime {
  app(name: string, element: ReactNode): AppHandle;
  remove(name: string): Promise<void>;
  dispose(): Promise<void>;
  apps(): string[];
  on<K extends keyof AwtrixProtocolEventMap>(
    event: K,
    handler: (payload: AwtrixProtocolEventMap[K]) => void,
  ): void;
  off<K extends keyof AwtrixProtocolEventMap>(
    event: K,
    handler: (payload: AwtrixProtocolEventMap[K]) => void,
  ): void;
  handleSignals(): void;
}

export interface AppPayload extends Omit<AppProps, "background" | "progressC" | "progressBC"> {
  background?: string;
  progressC?: string;
  progressBC?: string;
  draw?: DrawCommand[];
}

export type AwtrixPayload = AppPayload & NotifyPayloadOptions;

export interface AwtrixProtocolEventMap {
  "button:left": { pressed: boolean; raw: string };
  "button:select": { pressed: boolean; raw: string };
  "button:right": { pressed: boolean; raw: string };
  currentApp: { name: string };
  stats: { value: Record<string, unknown> };
  device: { online: boolean };
}

export interface AwtrixProtocol {
  readonly kind: "http" | "mqtt" | (string & {});
  readonly key: string;
  pushApp(name: string, payload: AwtrixPayload): Promise<void>;
  deleteApp(name: string): Promise<void>;
  pushNotify(payload: AwtrixPayload): Promise<void>;
  dismissNotify?(): Promise<void>;
  connect?(): Promise<void>;
  dispose?(): Promise<void>;
  on?<K extends keyof AwtrixProtocolEventMap>(
    event: K,
    handler: (payload: AwtrixProtocolEventMap[K]) => void,
  ): () => void;
}

interface AwtrixContainerBase {
  appName: string;
  matrixWidth: number;
  matrixHeight: number;
  children: AwtrixNode[];
  debug: boolean;
  debounceMs: number;
  pendingFlush?: ReturnType<typeof setTimeout>;
  onFlush?: () => void;
  onFlushError?: (error: unknown) => void;
  requestFlush: (payload: AwtrixPayload) => Promise<void>;
}

export interface AwtrixAppContainer extends AwtrixContainerBase {
  mode: "app";
  requestDelete: () => Promise<void>;
}

export interface AwtrixNotifyContainer extends AwtrixContainerBase {
  mode: "notify";
  notifyOptions?: NotifyPayloadOptions;
}

export type AwtrixContainer = AwtrixAppContainer | AwtrixNotifyContainer;

function toHexByte(value: number): string {
  const normalized = Math.max(0, Math.min(255, Math.round(value)));
  return normalized.toString(16).padStart(2, "0");
}

export function normalizeColor(color: Color): string {
  if (typeof color === "string") {
    if (color.startsWith("#")) {
      return color.toUpperCase();
    }
    return color;
  }

  const [red, green, blue] = color;
  return `#${toHexByte(red)}${toHexByte(green)}${toHexByte(blue)}`.toUpperCase();
}
