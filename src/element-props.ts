import type { Color } from "./display.ts";

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
