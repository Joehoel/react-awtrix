import { describe, expect, test } from "bun:test";
import { normalizeColor, resolveElementType } from "../types.ts";

describe("types", () => {
  test("normalizeColor normalizes tuple and hex colors", () => {
    expect(normalizeColor("#ff00aa")).toBe("#FF00AA");
    expect(normalizeColor("red")).toBe("red");
    expect(normalizeColor([255, 0, 170])).toBe("#FF00AA");
    expect(normalizeColor([300, -5, 15.6])).toBe("#FF0010");
  });

  test("resolveElementType maps awtrix intrinsic elements", () => {
    expect(resolveElementType("awtrix-app")).toBe("app");
    expect(resolveElementType("awtrix-pixel")).toBe("pixel");
    expect(resolveElementType("awtrix-line")).toBe("line");
    expect(resolveElementType("awtrix-rect")).toBe("rect");
    expect(resolveElementType("awtrix-circle")).toBe("circle");
    expect(resolveElementType("awtrix-text")).toBe("text");
    expect(resolveElementType("awtrix-bitmap")).toBe("bitmap");
    expect(resolveElementType("div")).toBeUndefined();
  });
});
