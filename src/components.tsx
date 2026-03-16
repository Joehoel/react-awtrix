import type { ReactNode } from "react";
import type {
  AppProps,
  BitmapProps,
  CircleProps,
  LineProps,
  PixelProps,
  RectProps,
  TextProps,
} from "./types.ts";

export interface AppComponentProps extends AppProps {
  children?: ReactNode;
}

export interface TextComponentProps extends TextProps {
  children?: string | number | Array<string | number>;
}

export function App(props: AppComponentProps) {
  return <awtrix-app {...props}>{props.children}</awtrix-app>;
}

export function Pixel(props: PixelProps) {
  return <awtrix-pixel {...props} />;
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

export function Text(props: TextComponentProps) {
  return <awtrix-text {...props}>{props.children}</awtrix-text>;
}

export function Bitmap(props: BitmapProps) {
  return <awtrix-bitmap {...props} />;
}
