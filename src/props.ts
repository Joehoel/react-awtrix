import { type } from "arktype";
import type {
  AppProps,
  BitmapProps,
  CircleProps,
  Color,
  EffectSettings,
  LineProps,
  PixelProps,
  RectProps,
  TextProps,
} from "./types.ts";

const colorSchema = type(["string", "|", ["number", "number", "number"]]);
const overlaySchema = type("'clear' | 'snow' | 'rain' | 'drizzle' | 'storm' | 'thunder' | 'frost'");
const textCaseSchema = type("0 | 1 | 2");
const lifetimeModeSchema = type("0 | 1");
const pushIconSchema = type("0 | 1 | 2");

const effectSettingsSchema = type({
  "speed?": "number",
  "palette?": "string",
  "blend?": "boolean",
});

const pixelPropsSchema = type({
  x: "number",
  y: "number",
  color: colorSchema,
});

const linePropsSchema = type({
  x1: "number",
  y1: "number",
  x2: "number",
  y2: "number",
  color: colorSchema,
});

const rectPropsSchema = type({
  x: "number",
  y: "number",
  width: "number",
  height: "number",
  color: colorSchema,
  "filled?": "boolean",
});

const circlePropsSchema = type({
  x: "number",
  y: "number",
  radius: "number",
  color: colorSchema,
  "filled?": "boolean",
});

const textPropsSchema = type({
  x: "number",
  y: "number",
  color: colorSchema,
  "maxWidth?": "number > 0",
  "charWidth?": "number > 0",
});

const bitmapPropsSchema = type({
  x: "number",
  y: "number",
  width: "number",
  height: "number",
  data: "number[]",
});

const appPropsSchema = type({
  "icon?": "string",
  "duration?": "number",
  "lifetime?": "number",
  "lifetimeMode?": lifetimeModeSchema,
  "text?": "string",
  "textCase?": textCaseSchema,
  "topText?": "boolean",
  "textOffset?": "number",
  "center?": "boolean",
  "noScroll?": "boolean",
  "scrollSpeed?": "number",
  "background?": colorSchema,
  "effect?": "string",
  "effectSettings?": effectSettingsSchema,
  "overlay?": overlaySchema,
  "progress?": "number",
  "progressC?": colorSchema,
  "progressBC?": colorSchema,
  "bar?": "number[]",
  "line?": "number[]",
  "rainbow?": "boolean",
  "pushIcon?": pushIconSchema,
  "repeat?": "number",
  "save?": "boolean",
});

function throwParseError(element: string, summary: string): never {
  throw new Error(`[react-awtrix] <${element}> ${summary}`);
}

export function parsePixelProps(value: unknown): PixelProps {
  const result = pixelPropsSchema(value);
  if (result instanceof type.errors) {
    throwParseError("awtrix-pixel", result.summary);
  }
  return result;
}

export function parseLineProps(value: unknown): LineProps {
  const result = linePropsSchema(value);
  if (result instanceof type.errors) {
    throwParseError("awtrix-line", result.summary);
  }
  return result;
}

export function parseRectProps(value: unknown): RectProps {
  const result = rectPropsSchema(value);
  if (result instanceof type.errors) {
    throwParseError("awtrix-rect", result.summary);
  }
  return result;
}

export function parseCircleProps(value: unknown): CircleProps {
  const result = circlePropsSchema(value);
  if (result instanceof type.errors) {
    throwParseError("awtrix-circle", result.summary);
  }
  return result;
}

export function parseTextProps(value: unknown): TextProps {
  const result = textPropsSchema(value);
  if (result instanceof type.errors) {
    throwParseError("awtrix-text", result.summary);
  }
  return result;
}

export function parseBitmapProps(value: unknown): BitmapProps {
  const result = bitmapPropsSchema(value);
  if (result instanceof type.errors) {
    throwParseError("awtrix-bitmap", result.summary);
  }
  return result;
}

export function parseAppProps(value: unknown): AppProps {
  const result = appPropsSchema(value);
  if (result instanceof type.errors) {
    throwParseError("awtrix-app", result.summary);
  }
  return result;
}

export type { AppProps, BitmapProps, CircleProps, Color, EffectSettings, LineProps, PixelProps, RectProps, TextProps };
