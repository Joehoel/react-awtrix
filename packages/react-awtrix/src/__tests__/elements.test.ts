import { describe, expect, test } from "bun:test";
import { parseElementProps, resolveElementType, validHostElementNames } from "../elements.ts";

describe("elements", () => {
  test("maps awtrix host elements to element types", () => {
    expect(resolveElementType("awtrix-app")).toBe("app");
    expect(resolveElementType("awtrix-pixel")).toBe("pixel");
    expect(resolveElementType("awtrix-line")).toBe("line");
    expect(resolveElementType("awtrix-rect")).toBe("rect");
    expect(resolveElementType("awtrix-circle")).toBe("circle");
    expect(resolveElementType("awtrix-text")).toBe("text");
    expect(resolveElementType("awtrix-bitmap")).toBe("bitmap");
    expect(resolveElementType("div")).toBeUndefined();
  });

  test("reports valid host element names from the shared element model", () => {
    expect(validHostElementNames()).toEqual([
      "awtrix-app",
      "awtrix-pixel",
      "awtrix-line",
      "awtrix-rect",
      "awtrix-circle",
      "awtrix-text",
      "awtrix-bitmap",
    ]);
  });

  test("parses props through the shared element model", () => {
    expect(parseElementProps("pixel", { x: 1, y: 2, color: [255, 0, 0] })).toEqual({
      x: 1,
      y: 2,
      color: [255, 0, 0],
    });

    expect(parseElementProps("text", { x: 0, y: 6, color: "white", maxWidth: 16 })).toEqual({
      x: 0,
      y: 6,
      color: "white",
      maxWidth: 16,
    });

    expect(parseElementProps("app", { text: "Hello", duration: 5 })).toEqual({
      text: "Hello",
      duration: 5,
    });
  });
});
