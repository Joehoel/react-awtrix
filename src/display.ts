export type Color = string | [number, number, number];

export const DEFAULT_MATRIX_WIDTH = 32;
export const DEFAULT_MATRIX_HEIGHT = 8;
export const DEFAULT_TEXT_CHAR_WIDTH = 4;

export type DrawCommand =
  | { dp: [x: number, y: number, color: string] }
  | { dl: [x0: number, y0: number, x1: number, y1: number, color: string] }
  | { dr: [x: number, y: number, w: number, h: number, color: string] }
  | { df: [x: number, y: number, w: number, h: number, color: string] }
  | { dc: [x: number, y: number, r: number, color: string] }
  | { dfc: [x: number, y: number, r: number, color: string] }
  | { dt: [x: number, y: number, text: string, color: string] }
  | { db: [x: number, y: number, w: number, h: number, bmp: number[]] };

function toHexByte(value: number): string {
  const normalized = Math.max(0, Math.min(255, Math.round(value)));
  return normalized.toString(16).padStart(2, "0");
}

export function normalizeColor(color: Color): string {
  if (typeof color === "string") {
    if (color.startsWith("#")) {
      return color.toUpperCase();
    }
    return color;
  }

  const [red, green, blue] = color;
  return `#${toHexByte(red)}${toHexByte(green)}${toHexByte(blue)}`.toUpperCase();
}
