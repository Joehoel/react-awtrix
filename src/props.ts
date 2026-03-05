import type {
  AppProps,
  BitmapProps,
  CircleProps,
  Color,
  EffectSettings,
  ElementType,
  LineProps,
  LifetimeMode,
  Overlay,
  PixelProps,
  PushIcon,
  RectProps,
  TextCase,
  TextProps,
} from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidProp(element: string, prop: string, expected: string): never {
  throw new Error(`[react-awtrix] <${element}> prop "${prop}" must be ${expected}.`);
}

function expectRecord(value: unknown, element: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`[react-awtrix] <${element}> props must be an object.`);
  }
  return value;
}

function readRequiredNumber(record: Record<string, unknown>, key: string, element: string): number {
  const value = record[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    invalidProp(element, key, "a number");
  }
  return value;
}

function readOptionalNumber(record: Record<string, unknown>, key: string, element: string): number | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    invalidProp(element, key, "a number");
  }
  return value;
}

function readOptionalBoolean(record: Record<string, unknown>, key: string, element: string): boolean | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    invalidProp(element, key, "a boolean");
  }
  return value;
}

function readOptionalString(record: Record<string, unknown>, key: string, element: string): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    invalidProp(element, key, "a string");
  }
  return value;
}

function isColorTuple(value: unknown): value is [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    return false;
  }

  const [red, green, blue] = value;
  return (
    typeof red === "number" &&
    typeof green === "number" &&
    typeof blue === "number" &&
    Number.isFinite(red) &&
    Number.isFinite(green) &&
    Number.isFinite(blue)
  );
}

function parseColor(value: unknown, element: string, key: string): Color {
  if (typeof value === "string") {
    return value;
  }

  if (isColorTuple(value)) {
    return value;
  }

  invalidProp(element, key, "a color string or [r, g, b] tuple");
}

function readRequiredColor(record: Record<string, unknown>, key: string, element: string): Color {
  if (!(key in record)) {
    invalidProp(element, key, "a color string or [r, g, b] tuple");
  }
  return parseColor(record[key], element, key);
}

function readOptionalColor(record: Record<string, unknown>, key: string, element: string): Color | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  return parseColor(value, element, key);
}

function isNumberArray(value: unknown): value is number[] {
  if (!Array.isArray(value)) {
    return false;
  }

  for (const item of value) {
    if (typeof item !== "number" || Number.isNaN(item)) {
      return false;
    }
  }

  return true;
}

function readRequiredNumberArray(record: Record<string, unknown>, key: string, element: string): number[] {
  const value = record[key];
  if (!isNumberArray(value)) {
    invalidProp(element, key, "an array of numbers");
  }
  return value;
}

function readOptionalNumberArray(record: Record<string, unknown>, key: string, element: string): number[] | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!isNumberArray(value)) {
    invalidProp(element, key, "an array of numbers");
  }
  return value;
}

function isOverlay(value: string): value is Overlay {
  return (
    value === "clear" ||
    value === "snow" ||
    value === "rain" ||
    value === "drizzle" ||
    value === "storm" ||
    value === "thunder" ||
    value === "frost"
  );
}

function readOptionalOverlay(record: Record<string, unknown>, key: string, element: string): Overlay | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !isOverlay(value)) {
    invalidProp(element, key, "one of clear|snow|rain|drizzle|storm|thunder|frost");
  }

  return value;
}

function readOptionalTextCase(record: Record<string, unknown>, key: string, element: string): TextCase | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }

  if (value === 0 || value === 1 || value === 2) {
    return value;
  }

  invalidProp(element, key, "0, 1, or 2");
}

function readOptionalLifetimeMode(
  record: Record<string, unknown>,
  key: string,
  element: string,
): LifetimeMode | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }

  if (value === 0 || value === 1) {
    return value;
  }

  invalidProp(element, key, "0 or 1");
}

function readOptionalPushIcon(record: Record<string, unknown>, key: string, element: string): PushIcon | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }

  if (value === 0 || value === 1 || value === 2) {
    return value;
  }

  invalidProp(element, key, "0, 1, or 2");
}

function parseEffectSettings(value: unknown, element: string): EffectSettings {
  if (!isRecord(value)) {
    invalidProp(element, "effectSettings", "an object");
  }

  const settings: EffectSettings = {};
  const speed = readOptionalNumber(value, "speed", element);
  if (speed !== undefined) {
    settings.speed = speed;
  }

  const palette = readOptionalString(value, "palette", element);
  if (palette !== undefined) {
    settings.palette = palette;
  }

  const blend = readOptionalBoolean(value, "blend", element);
  if (blend !== undefined) {
    settings.blend = blend;
  }

  return settings;
}

export function parsePixelProps(value: unknown): PixelProps {
  const record = expectRecord(value, "pixel");
  return {
    x: readRequiredNumber(record, "x", "pixel"),
    y: readRequiredNumber(record, "y", "pixel"),
    color: readRequiredColor(record, "color", "pixel"),
  };
}

export function parseLineProps(value: unknown): LineProps {
  const record = expectRecord(value, "line");
  return {
    x1: readRequiredNumber(record, "x1", "line"),
    y1: readRequiredNumber(record, "y1", "line"),
    x2: readRequiredNumber(record, "x2", "line"),
    y2: readRequiredNumber(record, "y2", "line"),
    color: readRequiredColor(record, "color", "line"),
  };
}

export function parseRectProps(value: unknown): RectProps {
  const record = expectRecord(value, "rect");
  return {
    x: readRequiredNumber(record, "x", "rect"),
    y: readRequiredNumber(record, "y", "rect"),
    width: readRequiredNumber(record, "width", "rect"),
    height: readRequiredNumber(record, "height", "rect"),
    color: readRequiredColor(record, "color", "rect"),
    filled: readOptionalBoolean(record, "filled", "rect"),
  };
}

export function parseCircleProps(value: unknown): CircleProps {
  const record = expectRecord(value, "circle");
  return {
    x: readRequiredNumber(record, "x", "circle"),
    y: readRequiredNumber(record, "y", "circle"),
    radius: readRequiredNumber(record, "radius", "circle"),
    color: readRequiredColor(record, "color", "circle"),
    filled: readOptionalBoolean(record, "filled", "circle"),
  };
}

export function parseTextProps(value: unknown): TextProps {
  const record = expectRecord(value, "text");
  return {
    x: readRequiredNumber(record, "x", "text"),
    y: readRequiredNumber(record, "y", "text"),
    color: readRequiredColor(record, "color", "text"),
  };
}

export function parseBitmapProps(value: unknown): BitmapProps {
  const record = expectRecord(value, "bitmap");
  return {
    x: readRequiredNumber(record, "x", "bitmap"),
    y: readRequiredNumber(record, "y", "bitmap"),
    width: readRequiredNumber(record, "width", "bitmap"),
    height: readRequiredNumber(record, "height", "bitmap"),
    data: readRequiredNumberArray(record, "data", "bitmap"),
  };
}

export function parseAppProps(value: unknown): AppProps {
  const record = expectRecord(value, "app");
  const props: AppProps = {};

  const icon = readOptionalString(record, "icon", "app");
  if (icon !== undefined) props.icon = icon;

  const duration = readOptionalNumber(record, "duration", "app");
  if (duration !== undefined) props.duration = duration;

  const lifetime = readOptionalNumber(record, "lifetime", "app");
  if (lifetime !== undefined) props.lifetime = lifetime;

  const lifetimeMode = readOptionalLifetimeMode(record, "lifetimeMode", "app");
  if (lifetimeMode !== undefined) props.lifetimeMode = lifetimeMode;

  const text = readOptionalString(record, "text", "app");
  if (text !== undefined) props.text = text;

  const textCase = readOptionalTextCase(record, "textCase", "app");
  if (textCase !== undefined) props.textCase = textCase;

  const topText = readOptionalBoolean(record, "topText", "app");
  if (topText !== undefined) props.topText = topText;

  const textOffset = readOptionalNumber(record, "textOffset", "app");
  if (textOffset !== undefined) props.textOffset = textOffset;

  const center = readOptionalBoolean(record, "center", "app");
  if (center !== undefined) props.center = center;

  const noScroll = readOptionalBoolean(record, "noScroll", "app");
  if (noScroll !== undefined) props.noScroll = noScroll;

  const scrollSpeed = readOptionalNumber(record, "scrollSpeed", "app");
  if (scrollSpeed !== undefined) props.scrollSpeed = scrollSpeed;

  const background = readOptionalColor(record, "background", "app");
  if (background !== undefined) props.background = background;

  const effect = readOptionalString(record, "effect", "app");
  if (effect !== undefined) props.effect = effect;

  if (record.effectSettings !== undefined) {
    props.effectSettings = parseEffectSettings(record.effectSettings, "app");
  }

  const overlay = readOptionalOverlay(record, "overlay", "app");
  if (overlay !== undefined) props.overlay = overlay;

  const progress = readOptionalNumber(record, "progress", "app");
  if (progress !== undefined) props.progress = progress;

  const progressC = readOptionalColor(record, "progressC", "app");
  if (progressC !== undefined) props.progressC = progressC;

  const progressBC = readOptionalColor(record, "progressBC", "app");
  if (progressBC !== undefined) props.progressBC = progressBC;

  const bar = readOptionalNumberArray(record, "bar", "app");
  if (bar !== undefined) props.bar = bar;

  const line = readOptionalNumberArray(record, "line", "app");
  if (line !== undefined) props.line = line;

  const rainbow = readOptionalBoolean(record, "rainbow", "app");
  if (rainbow !== undefined) props.rainbow = rainbow;

  const pushIcon = readOptionalPushIcon(record, "pushIcon", "app");
  if (pushIcon !== undefined) props.pushIcon = pushIcon;

  const repeat = readOptionalNumber(record, "repeat", "app");
  if (repeat !== undefined) props.repeat = repeat;

  const save = readOptionalBoolean(record, "save", "app");
  if (save !== undefined) props.save = save;

  return props;
}

export function parsePropsForType(type: "pixel", value: unknown): PixelProps;
export function parsePropsForType(type: "line", value: unknown): LineProps;
export function parsePropsForType(type: "rect", value: unknown): RectProps;
export function parsePropsForType(type: "circle", value: unknown): CircleProps;
export function parsePropsForType(type: "text", value: unknown): TextProps;
export function parsePropsForType(type: "bitmap", value: unknown): BitmapProps;
export function parsePropsForType(type: "app", value: unknown): AppProps;
export function parsePropsForType(type: ElementType, value: unknown) {
  if (type === "pixel") return parsePixelProps(value);
  if (type === "line") return parseLineProps(value);
  if (type === "rect") return parseRectProps(value);
  if (type === "circle") return parseCircleProps(value);
  if (type === "text") return parseTextProps(value);
  if (type === "bitmap") return parseBitmapProps(value);
  return parseAppProps(value);
}
