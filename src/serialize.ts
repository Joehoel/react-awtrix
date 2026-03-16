import type {
  AppPayload,
  AppProps,
  AwtrixContainer,
  AwtrixInstance,
  AwtrixNode,
  AwtrixPayload,
  DrawCommand,
} from "./types.ts";
import { DEFAULT_TEXT_CHAR_WIDTH, normalizeColor } from "./types.ts";

// ─── AppPayload key definitions ────────────────────────────────────────────

// Keys that can be copied directly without color normalization
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

// Keys that need normalizeColor (Color → string)
const APP_PAYLOAD_COLOR_KEYS = ["background", "progressC", "progressBC"] as const;

function collectText(children: AwtrixNode[]): string {
  let value = "";

  for (const child of children) {
    if (child.hidden) {
      continue;
    }

    if (child.type === "__text") {
      value += child.value;
      continue;
    }

    value += collectText(child.children);
  }

  return value;
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

function serializeInstance(
  instance: AwtrixInstance,
  container: AwtrixContainer,
): DrawCommand | null {
  if (instance.hidden) {
    return null;
  }

  if (instance.type === "pixel") {
    if (!isVisiblePixel(instance.props.x, instance.props.y, container)) {
      return null;
    }

    return { dp: [instance.props.x, instance.props.y, normalizeColor(instance.props.color)] };
  }

  if (instance.type === "line") {
    return {
      dl: [
        instance.props.x1,
        instance.props.y1,
        instance.props.x2,
        instance.props.y2,
        normalizeColor(instance.props.color),
      ],
    };
  }

  if (instance.type === "rect") {
    if (instance.props.filled) {
      const clipped = clipFilledRect(
        instance.props.x,
        instance.props.y,
        instance.props.width,
        instance.props.height,
        container,
      );

      if (clipped === null) {
        return null;
      }

      return {
        df: [clipped[0], clipped[1], clipped[2], clipped[3], normalizeColor(instance.props.color)],
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

  if (instance.type === "circle") {
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
  }

  if (instance.type === "text") {
    const rawText = collectText(instance.children);
    const clippedText = clipTextToMatrix(rawText, instance, container);
    if (clippedText.length === 0) {
      return null;
    }

    return {
      dt: [instance.props.x, instance.props.y, clippedText, normalizeColor(instance.props.color)],
    };
  }

  if (instance.type === "bitmap") {
    return {
      db: [
        instance.props.x,
        instance.props.y,
        instance.props.width,
        instance.props.height,
        instance.props.data,
      ],
    };
  }

  return null;
}

function collectDrawCommands(
  nodes: AwtrixNode[],
  commands: DrawCommand[],
  container: AwtrixContainer,
): void {
  for (const node of nodes) {
    if (node.hidden || node.type === "__text") {
      continue;
    }

    const command = serializeInstance(node, container);
    if (command !== null) {
      commands.push(command);
    }

    if (node.type !== "text") {
      collectDrawCommands(node.children, commands, container);
    }
  }
}

function mergeAppProps(target: AppPayload, source: AppProps): void {
  for (const key of APP_PAYLOAD_MERGE_KEYS) {
    const value = source[key];
    if (value !== undefined) {
      (target as Record<string, unknown>)[key] = value;
    }
  }

  // Handle color keys separately (need normalizeColor)
  for (const key of APP_PAYLOAD_COLOR_KEYS) {
    const value = source[key];
    if (value !== undefined) {
      (target as Record<string, unknown>)[key] = normalizeColor(value);
    }
  }
}

function collectAppProps(nodes: AwtrixNode[]): AppPayload {
  const appPayload: AppPayload = {};

  for (const node of nodes) {
    if (node.hidden || node.type === "__text") {
      continue;
    }

    if (node.type === "app") {
      mergeAppProps(appPayload, node.props);
    }
  }

  return appPayload;
}

export function serialize(container: AwtrixContainer): AwtrixPayload {
  const payload: AwtrixPayload = collectAppProps(container.children);

  const draw: DrawCommand[] = [];
  collectDrawCommands(container.children, draw, container);
  if (draw.length > 0) {
    payload.draw = draw;
  }

  if (container.mode === "notify" && container.notifyOptions !== undefined) {
    if (container.notifyOptions.hold !== undefined) payload.hold = container.notifyOptions.hold;
    if (container.notifyOptions.sound !== undefined) payload.sound = container.notifyOptions.sound;
    if (container.notifyOptions.stack !== undefined) payload.stack = container.notifyOptions.stack;
    if (container.notifyOptions.wakeup !== undefined)
      payload.wakeup = container.notifyOptions.wakeup;
  }

  return payload;
}
