import { describe, expect, test } from "bun:test";
import {
  parseAppProps,
  parseBitmapProps,
  parseCircleProps,
  parseLineProps,
  parsePixelProps,
  parseRectProps,
  parseTextProps,
} from "../props.ts";

describe("props validation", () => {
  test("parses valid props for every intrinsic element", () => {
    expect(parsePixelProps({ x: 1, y: 2, color: [255, 0, 0] })).toEqual({
      x: 1,
      y: 2,
      color: [255, 0, 0],
    });

    expect(parseLineProps({ x1: 0, y1: 0, x2: 10, y2: 1, color: "#00FF00" })).toEqual({
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 1,
      color: "#00FF00",
    });

    expect(parseRectProps({ x: 0, y: 0, width: 4, height: 2, color: "blue", filled: true })).toEqual({
      x: 0,
      y: 0,
      width: 4,
      height: 2,
      color: "blue",
      filled: true,
    });

    expect(parseCircleProps({ x: 5, y: 4, radius: 2, color: [0, 255, 0], filled: false })).toEqual({
      x: 5,
      y: 4,
      radius: 2,
      color: [0, 255, 0],
      filled: false,
    });

    expect(parseTextProps({ x: 0, y: 6, color: "white", maxWidth: 16, charWidth: 4 })).toEqual({
      x: 0,
      y: 6,
      color: "white",
      maxWidth: 16,
      charWidth: 4,
    });

    expect(parseBitmapProps({ x: 1, y: 1, width: 2, height: 2, data: [1, 2, 3, 4] })).toEqual({
      x: 1,
      y: 1,
      width: 2,
      height: 2,
      data: [1, 2, 3, 4],
    });

    expect(
      parseAppProps({
        text: "Hello",
        duration: 5,
        overlay: "rain",
        textCase: 1,
        lifetimeMode: 0,
        pushIcon: 2,
        background: [16, 32, 64],
        progressC: "#00FF00",
        save: true,
      }),
    ).toEqual({
      text: "Hello",
      duration: 5,
      overlay: "rain",
      textCase: 1,
      lifetimeMode: 0,
      pushIcon: 2,
      background: [16, 32, 64],
      progressC: "#00FF00",
      save: true,
    });
  });

  test("throws descriptive errors for invalid props", () => {
    expect(() => parsePixelProps({ x: 0, y: 1 })).toThrow("<awtrix-pixel>");
    expect(() => parseLineProps({ x1: 0, y1: 0, x2: 1, y2: "2", color: "red" })).toThrow("<awtrix-line>");
    expect(() => parseRectProps({ x: 0, y: 0, width: 1, height: 1, color: "red", filled: "yes" })).toThrow(
      "<awtrix-rect>",
    );
    expect(() => parseCircleProps({ x: 0, y: 0, radius: "1", color: "red" })).toThrow("<awtrix-circle>");
    expect(() => parseTextProps({ x: 0, y: 0, color: "red", maxWidth: 0 })).toThrow("<awtrix-text>");
    expect(() => parseBitmapProps({ x: 0, y: 0, width: 2, height: 2, data: "invalid" })).toThrow(
      "<awtrix-bitmap>",
    );
    expect(() => parseAppProps({ overlay: "fog" })).toThrow("<awtrix-app>");
  });
});
