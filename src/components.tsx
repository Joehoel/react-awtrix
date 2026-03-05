import type { ReactNode } from "react";
import type { AppProps, BitmapProps, CircleProps, LineProps, PixelProps, RectProps, TextProps } from "./types.ts";

export function App(props: AppProps & { children?: ReactNode }) {
  return <app {...props}>{props.children}</app>;
}

export function Pixel(props: PixelProps) {
  return <pixel {...props} />;
}

export function Line(props: LineProps) {
  return <awtrix-line {...props} />;
}

export function Rect(props: RectProps) {
  return <awtrix-rect {...props} />;
}

export function Circle(props: CircleProps) {
  return <awtrix-circle {...props} />;
}

export function Text(props: TextProps & { children?: string | number | Array<string | number> }) {
  return <awtrix-text {...props}>{props.children}</awtrix-text>;
}

export function Bitmap(props: BitmapProps) {
  return <awtrix-bitmap {...props} />;
}
