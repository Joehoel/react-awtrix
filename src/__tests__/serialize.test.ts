import { describe, expect, test } from "bun:test";
import { serialize } from "../serialize.ts";
import type {
  AppInstance,
  AwtrixAppContainer,
  AwtrixContainer,
  AwtrixNotifyContainer,
  AwtrixTextInstance,
  BitmapInstance,
  CircleInstance,
  LineInstance,
  PixelInstance,
  RectInstance,
  TextInstance,
} from "../types.ts";

function createContainer(mode: "app"): AwtrixAppContainer;
function createContainer(mode: "notify"): AwtrixNotifyContainer;
function createContainer(mode?: "app" | "notify"): AwtrixContainer;
function createContainer(mode: "app" | "notify" = "app"): AwtrixContainer {
  if (mode === "notify") {
    const notifyContainer: AwtrixNotifyContainer = {
      appName: "serialize-test",
      mode: "notify",
      matrixWidth: 32,
      matrixHeight: 8,
      children: [],
      debug: false,
      debounceMs: 0,
      requestFlush: async () => {},
    };

    return notifyContainer;
  }

  const appContainer: AwtrixAppContainer = {
    appName: "serialize-test",
    mode: "app",
    matrixWidth: 32,
    matrixHeight: 8,
    children: [],
    debug: false,
    debounceMs: 0,
    requestFlush: async () => {},
    requestDelete: async () => {},
  };

  return appContainer;
}

function createTextValue(value: string): AwtrixTextInstance {
  return { type: "__text", value, hidden: false };
}

describe("serialize", () => {
  test("serializes app props and draw commands", () => {
    const pixel: PixelInstance = {
      type: "pixel",
      props: { x: 1, y: 2, color: [255, 0, 0] },
      children: [],
      hidden: false,
    };

    const line: LineInstance = {
      type: "line",
      props: { x1: 0, y1: 0, x2: 3, y2: 3, color: "orange" },
      children: [],
      hidden: false,
    };

    const rect: RectInstance = {
      type: "rect",
      props: { x: 4, y: 1, width: 5, height: 2, color: "#00ff00", filled: false },
      children: [],
      hidden: false,
    };

    const circle: CircleInstance = {
      type: "circle",
      props: { x: 7, y: 3, radius: 2, color: [0, 128, 255], filled: true },
      children: [],
      hidden: false,
    };

    const text: TextInstance = {
      type: "text",
      props: { x: 0, y: 7, color: "#abcdef" },
      children: [createTextValue("HELLO")],
      hidden: false,
    };

    const bitmap: BitmapInstance = {
      type: "bitmap",
      props: { x: 10, y: 0, width: 2, height: 2, data: [1, 2, 3, 4] },
      children: [],
      hidden: false,
    };

    const app: AppInstance = {
      type: "app",
      props: {
        text: "Top Text",
        duration: 5,
        overlay: "rain",
        background: [1, 2, 3],
        progressC: [0, 255, 0],
      },
      children: [pixel, line, rect, circle, text, bitmap],
      hidden: false,
    };

    const container = createContainer("app");
    container.children = [app];

    expect(serialize(container)).toEqual({
      text: "Top Text",
      duration: 5,
      overlay: "rain",
      background: "#010203",
      progressC: "#00FF00",
      draw: [
        { dp: [1, 2, "#FF0000"] },
        { dl: [0, 0, 3, 3, "orange"] },
        { dr: [4, 1, 5, 2, "#00FF00"] },
        { dfc: [7, 3, 2, "#0080FF"] },
        { dt: [0, 7, "HELLO", "#ABCDEF"] },
        { db: [10, 0, 2, 2, [1, 2, 3, 4]] },
      ],
    });
  });

  test("clips commands to matrix bounds and omits hidden/out-of-bounds nodes", () => {
    const outsidePixel: PixelInstance = {
      type: "pixel",
      props: { x: 40, y: 2, color: "red" },
      children: [],
      hidden: false,
    };

    const clippedFilledRect: RectInstance = {
      type: "rect",
      props: { x: 30, y: 6, width: 5, height: 4, color: [255, 255, 0], filled: true },
      children: [],
      hidden: false,
    };

    const hiddenLine: LineInstance = {
      type: "line",
      props: { x1: 0, y1: 0, x2: 5, y2: 5, color: "white" },
      children: [],
      hidden: true,
    };

    const clippedText: TextInstance = {
      type: "text",
      props: { x: 28, y: 7, color: "white", charWidth: 4 },
      children: [createTextValue("HELLO")],
      hidden: false,
    };

    const fullyHiddenText: TextInstance = {
      type: "text",
      props: { x: 32, y: 7, color: "white", charWidth: 4 },
      children: [createTextValue("A")],
      hidden: false,
    };

    const container = createContainer("app");
    container.children = [
      outsidePixel,
      clippedFilledRect,
      hiddenLine,
      clippedText,
      fullyHiddenText,
    ];

    expect(serialize(container)).toEqual({
      draw: [{ df: [30, 6, 2, 2, "#FFFF00"] }, { dt: [28, 7, "H", "white"] }],
    });
  });

  test("merges app props from multiple app nodes", () => {
    const firstApp: AppInstance = {
      type: "app",
      props: { text: "A", duration: 5, progress: 10 },
      children: [],
      hidden: false,
    };

    const secondApp: AppInstance = {
      type: "app",
      props: { duration: 12, center: true },
      children: [],
      hidden: false,
    };

    const container = createContainer("app");
    container.children = [firstApp, secondApp];

    expect(serialize(container)).toEqual({
      text: "A",
      duration: 12,
      progress: 10,
      center: true,
    });
  });

  test("includes notify options when serializing notify mode", () => {
    const pixel: PixelInstance = {
      type: "pixel",
      props: { x: 0, y: 0, color: "#123456" },
      children: [],
      hidden: false,
    };

    const container = createContainer("notify");
    container.notifyOptions = {
      hold: true,
      sound: "beep",
      stack: false,
      wakeup: true,
    };
    container.children = [pixel];

    expect(serialize(container)).toEqual({
      hold: true,
      sound: "beep",
      stack: false,
      wakeup: true,
      draw: [{ dp: [0, 0, "#123456"] }],
    });
  });

  test("does not trim clock text when charWidth is not provided", () => {
    const clockText: TextInstance = {
      type: "text",
      props: { x: 1, y: 1, color: "#7FDBFF" },
      children: [createTextValue("20:10:01")],
      hidden: false,
    };

    const container = createContainer("app");
    container.children = [clockText];

    expect(serialize(container)).toEqual({
      draw: [{ dt: [1, 1, "20:10:01", "#7FDBFF"] }],
    });
  });
});
