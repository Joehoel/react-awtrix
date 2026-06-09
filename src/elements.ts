import {
  parseAppProps,
  parseBitmapProps,
  parseCircleProps,
  parseLineProps,
  parsePixelProps,
  parseRectProps,
  parseTextProps,
} from "./props.ts";
import { DEFAULT_TEXT_CHAR_WIDTH, normalizeColor } from "./display.ts";
import type { DrawCommand } from "./display.ts";
import type { AppPayload } from "./payload.ts";
import type { AwtrixContainer, AwtrixInstance, AwtrixNode } from "./render-tree.ts";

export type ElementType = "pixel" | "line" | "rect" | "circle" | "text" | "bitmap" | "app";

type PropsParser = (props: unknown) => AwtrixInstance["props"];

const elementDefinitions = [
  { type: "app", hostTag: "awtrix-app", parseProps: parseAppProps },
  { type: "pixel", hostTag: "awtrix-pixel", parseProps: parsePixelProps },
  { type: "line", hostTag: "awtrix-line", parseProps: parseLineProps },
  { type: "rect", hostTag: "awtrix-rect", parseProps: parseRectProps },
  { type: "circle", hostTag: "awtrix-circle", parseProps: parseCircleProps },
  { type: "text", hostTag: "awtrix-text", parseProps: parseTextProps },
  { type: "bitmap", hostTag: "awtrix-bitmap", parseProps: parseBitmapProps },
] as const satisfies ReadonlyArray<{
  type: ElementType;
  hostTag: string;
  parseProps: PropsParser;
}>;

const hostElementTypeMap = new Map<string, ElementType>(
  elementDefinitions.map((definition) => [definition.hostTag, definition.type]),
);

const parsers = Object.fromEntries(
  elementDefinitions.map((definition) => [definition.type, definition.parseProps]),
) as Record<ElementType, PropsParser>;

const APP_PAYLOAD_MERGE_KEYS = [
  "icon",
  "duration",
  "lifetime",
  "lifetimeMode",
  "text",
  "textCase",
  "topText",
  "textOffset",
  "center",
  "noScroll",
  "scrollSpeed",
  "effect",
  "effectSettings",
  "overlay",
  "progress",
  "bar",
  "line",
  "rainbow",
  "pushIcon",
  "repeat",
  "save",
] as const satisfies ReadonlyArray<keyof AppPayload>;

const APP_PAYLOAD_COLOR_KEYS = ["background", "progressC", "progressBC"] as const;

export function validHostElementNames(): string[] {
  return elementDefinitions.map((definition) => definition.hostTag);
}

export function resolveElementType(value: string): ElementType | undefined {
  return hostElementTypeMap.get(value);
}

export function parseElementProps(type: ElementType, props: unknown): AwtrixInstance["props"] {
  return parsers[type](props);
}

export function createElementInstance(type: ElementType, props: unknown): AwtrixInstance {
  return {
    type,
    props: parseElementProps(type, props),
    children: [],
    hidden: false,
  } as AwtrixInstance;
}

export function updateElementInstance(instance: AwtrixInstance, nextProps: unknown): void {
  (instance as { props: unknown }).props = parseElementProps(instance.type, nextProps);
}

export function mergeElementPayload(target: AppPayload, instance: AwtrixInstance): void {
  if (instance.type !== "app") {
    return;
  }

  for (const key of APP_PAYLOAD_MERGE_KEYS) {
    const value = instance.props[key];
    if (value !== undefined) {
      (target as Record<string, unknown>)[key] = value;
    }
  }

  for (const key of APP_PAYLOAD_COLOR_KEYS) {
    const value = instance.props[key];
    if (value !== undefined) {
      (target as Record<string, unknown>)[key] = normalizeColor(value);
    }
  }
}

export interface SerializeElementContext {
  container: AwtrixContainer;
  textContent: (children: AwtrixNode[]) => string;
}

function isVisiblePixel(x: number, y: number, container: AwtrixContainer): boolean {
  return x >= 0 && x < container.matrixWidth && y >= 0 && y < container.matrixHeight;
}

function clipFilledRect(
  x: number,
  y: number,
  width: number,
  height: number,
  container: AwtrixContainer,
): [number, number, number, number] | null {
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(container.matrixWidth, x + width);
  const bottom = Math.min(container.matrixHeight, y + height);

  const clippedWidth = right - left;
  const clippedHeight = bottom - top;
  if (clippedWidth <= 0 || clippedHeight <= 0) {
    return null;
  }

  return [left, top, clippedWidth, clippedHeight];
}

function clipTextToMatrix(
  text: string,
  instance: AwtrixInstance,
  container: AwtrixContainer,
): string {
  if (instance.type !== "text") {
    return text;
  }

  if (instance.props.x >= container.matrixWidth) {
    return "";
  }

  if (instance.props.maxWidth === undefined && instance.props.charWidth === undefined) {
    return text;
  }

  const usableWidthFromMatrix = container.matrixWidth - Math.max(0, instance.props.x);
  const usableWidth =
    instance.props.maxWidth === undefined
      ? usableWidthFromMatrix
      : Math.min(usableWidthFromMatrix, instance.props.maxWidth);

  const charWidth = instance.props.charWidth ?? DEFAULT_TEXT_CHAR_WIDTH;
  const maxChars = Math.floor(usableWidth / charWidth);

  if (maxChars <= 0) {
    return "";
  }

  if (text.length <= maxChars) {
    return text;
  }

  return text.slice(0, maxChars);
}

export function serializeElement(
  instance: AwtrixInstance,
  context: SerializeElementContext,
): DrawCommand | null {
  if (instance.hidden) {
    return null;
  }

  switch (instance.type) {
    case "pixel": {
      if (!isVisiblePixel(instance.props.x, instance.props.y, context.container)) {
        return null;
      }

      return { dp: [instance.props.x, instance.props.y, normalizeColor(instance.props.color)] };
    }

    case "line":
      return {
        dl: [
          instance.props.x1,
          instance.props.y1,
          instance.props.x2,
          instance.props.y2,
          normalizeColor(instance.props.color),
        ],
      };

    case "rect": {
      if (instance.props.filled) {
        const clipped = clipFilledRect(
          instance.props.x,
          instance.props.y,
          instance.props.width,
          instance.props.height,
          context.container,
        );

        if (clipped === null) {
          return null;
        }

        return {
          df: [
            clipped[0],
            clipped[1],
            clipped[2],
            clipped[3],
            normalizeColor(instance.props.color),
          ],
        };
      }

      return {
        dr: [
          instance.props.x,
          instance.props.y,
          instance.props.width,
          instance.props.height,
          normalizeColor(instance.props.color),
        ],
      };
    }

    case "circle":
      if (instance.props.filled) {
        return {
          dfc: [
            instance.props.x,
            instance.props.y,
            instance.props.radius,
            normalizeColor(instance.props.color),
          ],
        };
      }

      return {
        dc: [
          instance.props.x,
          instance.props.y,
          instance.props.radius,
          normalizeColor(instance.props.color),
        ],
      };

    case "text": {
      const rawText = context.textContent(instance.children);
      const clippedText = clipTextToMatrix(rawText, instance, context.container);
      if (clippedText.length === 0) {
        return null;
      }

      return {
        dt: [instance.props.x, instance.props.y, clippedText, normalizeColor(instance.props.color)],
      };
    }

    case "bitmap":
      return {
        db: [
          instance.props.x,
          instance.props.y,
          instance.props.width,
          instance.props.height,
          instance.props.data,
        ],
      };

    case "app":
      return null;
  }
}
