import { describe, expect, test } from "bun:test";
import { normalizeColor } from "../display.ts";

describe("display", () => {
  test("normalizeColor normalizes tuple and hex colors", () => {
    expect(normalizeColor("#ff00aa")).toBe("#FF00AA");
    expect(normalizeColor("red")).toBe("red");
    expect(normalizeColor([255, 0, 170])).toBe("#FF00AA");
    expect(normalizeColor([300, -5, 15.6])).toBe("#FF0010");
  });
});
