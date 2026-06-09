import type {
  AppProps,
  BitmapProps,
  CircleProps,
  LineProps,
  PixelProps,
  RectProps,
  TextProps,
} from "./element-props.ts";
import type { AwtrixPayload, NotifyPayloadOptions } from "./payload.ts";

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
