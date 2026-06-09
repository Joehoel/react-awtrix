import type { DrawCommand } from "./display.ts";
import type { AppProps } from "./element-props.ts";

export interface NotifyPayloadOptions {
  hold?: boolean;
  sound?: string;
  stack?: boolean;
  wakeup?: boolean;
}

export interface AppPayload extends Omit<AppProps, "background" | "progressC" | "progressBC"> {
  background?: string;
  progressC?: string;
  progressBC?: string;
  draw?: DrawCommand[];
}

export type AwtrixPayload = AppPayload & NotifyPayloadOptions;
